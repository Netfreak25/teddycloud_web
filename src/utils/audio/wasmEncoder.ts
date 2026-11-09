import {
    ENCODER_CHANNELS,
    ENCODER_CHUNK_FRAMES,
    ENCODER_SAMPLE_RATE,
    type EncoderCommand,
    type EncoderFormat,
    type EncoderReply,
} from "./encoderProtocol";
import { supportsBrowserEncoding } from "./encoderPreflight";

interface EncodingOptions {
    format: EncoderFormat;
    audioId: number;
    bitrate: number;
    maxBytes: number;
    signal: AbortSignal;
    onProgress(index: number, total: number, name: string): void;
    /** The disk-backed File remains valid only until this callback completes. */
    onFile(file: File, index: number, duration: number): Promise<void>;
}

/** One request in flight: no unbounded PCM queue and no full output in JavaScript memory. */
class EncoderWorker {
    private worker = new Worker(new URL("./encoder.worker.ts", import.meta.url), {
        type: "module",
    });
    private sequence = 0;
    private fatalError?: Error;
    private active?: { resolve(value: EncoderReply): void; reject(error: Error): void };

    constructor() {
        this.worker.onmessage = ({ data }: MessageEvent<EncoderReply>) => {
            const active = this.active;
            this.active = undefined;
            if (data.ok) active?.resolve(data);
            else active?.reject(new Error(data.error || "encoder_failed"));
        };
        this.worker.onerror = (event) => {
            this.fatalError = new Error(event.message || "encoder_worker_failed");
            this.active?.reject(this.fatalError);
            this.active = undefined;
        };
    }

    call(command: EncoderCommand, transfer: Transferable[] = []): Promise<EncoderReply> {
        if (this.fatalError) return Promise.reject(this.fatalError);
        if (this.active) return Promise.reject(new Error("encoder_busy"));
        return new Promise((resolve, reject) => {
            this.active = { resolve, reject };
            try {
                this.worker.postMessage({ ...command, requestId: ++this.sequence }, transfer);
            } catch (error) {
                this.active = undefined;
                reject(error);
            }
        });
    }

    async close() {
        try {
            await this.call({ type: "cleanup" });
        } finally {
            this.worker.terminate();
        }
    }
}

/** Keep decodeAudioData compatibility while limiting all subsequent PCM/output buffers. */
export async function encodeBrowserAudio(files: File[], options: EncodingOptions): Promise<void> {
    if (!supportsBrowserEncoding()) throw new Error("browser_encoding_unavailable");
    if (!files.length) throw new Error("no_audio_files");
    const worker = new EncoderWorker();
    let decoder: AudioContext | undefined;
    let primaryError: unknown;
    let totalDuration = 0;
    const checkCancelled = () => options.signal.throwIfAborted();
    try {
        decoder = new AudioContext({ sampleRate: ENCODER_SAMPLE_RATE });
        const moduleUrl = new URL(
            `${import.meta.env.BASE_URL.replace(/\/$/, "")}/wasm/audio_encoder.js`,
            location.href,
        );
        moduleUrl.searchParams.set("encoder", "stream-v1");
        await worker.call({
            type: "init",
            moduleUrl: moduleUrl.href,
            jobId: `job-${crypto.randomUUID()}`,
            format: options.format,
            maxBytes: options.maxBytes,
        });
        if (options.format === "taf")
            await worker.call({
                type: "begin",
                filename: "audio.taf",
                audioId: options.audioId,
                bitrate: options.bitrate,
            });

        for (const [index, file] of files.entries()) {
            checkCancelled();
            options.onProgress(index, files.length, file.name);
            const filename = `chapter-${index}.opus`;
            if (options.format === "native")
                await worker.call({
                    type: "begin",
                    filename,
                    audioId: options.audioId + index,
                    bitrate: options.bitrate,
                });
            else if (index > 0) await worker.call({ type: "chapter" });

            // A separate scope releases this file's AudioBuffer before decoding the next file.
            const duration = await (async () => {
                const audio = await decoder!.decodeAudioData(await file.arrayBuffer());
                checkCancelled();
                if (audio.sampleRate !== ENCODER_SAMPLE_RATE || !audio.length)
                    throw new Error("invalid_decoded_audio");
                const left = audio.getChannelData(0);
                const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
                let buffer = new ArrayBuffer(ENCODER_CHUNK_FRAMES * ENCODER_CHANNELS * 2);
                for (let offset = 0; offset < audio.length; offset += ENCODER_CHUNK_FRAMES) {
                    checkCancelled();
                    const frames = Math.min(ENCODER_CHUNK_FRAMES, audio.length - offset);
                    const pcm = new Int16Array(buffer);
                    for (let frame = 0; frame < frames; frame++) {
                        pcm[frame * 2] = Math.max(
                            -32768,
                            Math.min(32767, Math.round(left[offset + frame] * 32767)),
                        );
                        pcm[frame * 2 + 1] = Math.max(
                            -32768,
                            Math.min(32767, Math.round(right[offset + frame] * 32767)),
                        );
                    }
                    const reply = await worker.call({ type: "pcm", buffer, frames }, [buffer]);
                    if (!reply.buffer) throw new Error("encoder_missing_buffer");
                    buffer = reply.buffer;
                }
                return audio.length / ENCODER_SAMPLE_RATE;
            })();
            totalDuration += duration;
            if (options.format === "native") {
                const result = await worker.call({ type: "finish" });
                checkCancelled();
                if (!result.file) throw new Error("encoder_missing_file");
                await options.onFile(result.file, index, duration);
                await worker.call({ type: "remove", filename });
            }
        }
        if (options.format === "taf") {
            const result = await worker.call({ type: "finish" });
            checkCancelled();
            if (!result.file) throw new Error("encoder_missing_file");
            await options.onFile(result.file, 0, totalDuration);
        }
        options.onProgress(files.length, files.length, "");
    } catch (error) {
        primaryError = error;
        throw error;
    } finally {
        try {
            try {
                await decoder?.close();
            } finally {
                await worker.close();
            }
        } catch (cleanupError) {
            if (!primaryError) throw cleanupError;
            console.error("Encoder cleanup failed", cleanupError);
        }
    }
}
