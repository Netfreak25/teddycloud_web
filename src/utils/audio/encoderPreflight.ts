import { estimateEncoderResources, type EncoderFormat } from "./encoderProtocol";

const METADATA_TIMEOUT_MS = 10000;
const STORAGE_RESERVE_BYTES = 16 * 1024 * 1024;
const STORAGE_ESTIMATE_MARGIN = 1.25;
export const LARGE_DECODE_BYTES = 512 * 1024 * 1024;

export interface EncoderPreflight {
    supported: boolean;
    resources: ReturnType<typeof estimateEncoderResources>;
    availableBytes: number | null;
    storageWarning: boolean;
}

export const supportsBrowserEncoding = () =>
    window.isSecureContext &&
    typeof Worker !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof navigator.locks?.request === "function";

/** Metadata failure means unknown duration, not an invented codec/format rejection. */
const readDuration = (file: File, signal: AbortSignal): Promise<number | null> =>
    new Promise((resolve) => {
        if (signal.aborted) return resolve(null);
        const audio = document.createElement("audio");
        const url = URL.createObjectURL(file);
        let finished = false;
        const complete = () => {
            if (finished) return;
            finished = true;
            const duration =
                Number.isFinite(audio.duration) && audio.duration >= 0 ? audio.duration : null;
            clearTimeout(timeout);
            signal.removeEventListener("abort", complete);
            audio.onloadedmetadata = null;
            audio.onerror = null;
            audio.removeAttribute("src");
            audio.load();
            URL.revokeObjectURL(url);
            resolve(duration);
        };
        const timeout = window.setTimeout(complete, METADATA_TIMEOUT_MS);
        signal.addEventListener("abort", complete, { once: true });
        audio.preload = "metadata";
        audio.onloadedmetadata = complete;
        audio.onerror = complete;
        audio.src = url;
    });

export async function inspectEncoderInputs(
    files: File[],
    bitrate: number,
    format: EncoderFormat,
    signal: AbortSignal,
): Promise<EncoderPreflight> {
    const durations: (number | null)[] = new Array(files.length).fill(null);
    let next = 0;
    const inspect = async () => {
        while (next < files.length && !signal.aborted) {
            const index = next++;
            durations[index] = await readDuration(files[index], signal);
        }
    };
    await Promise.all([inspect(), inspect()]);
    const resources = estimateEncoderResources(durations, bitrate, format);
    let availableBytes: number | null = null;
    try {
        const estimate = await navigator.storage?.estimate();
        if (estimate?.quota !== undefined && estimate.usage !== undefined)
            availableBytes = Math.max(0, estimate.quota - estimate.usage);
    } catch {
        // Storage estimates are advisory; the worker still checks every actual write.
    }
    return {
        supported: supportsBrowserEncoding(),
        resources,
        availableBytes,
        storageWarning:
            availableBytes !== null &&
            availableBytes < resources.diskBytes * STORAGE_ESTIMATE_MARGIN + STORAGE_RESERVE_BYTES,
    };
}
