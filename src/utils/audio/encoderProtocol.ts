/** Bounded PCM messages; output bytes are written directly to an OPFS file. */
export const ENCODER_SAMPLE_RATE = 48000;
export const ENCODER_CHUNK_FRAMES = 48000;
export const ENCODER_CHANNELS = 2;
export const ENCODER_TEMP_DIRECTORY = "teddycloud-audio-encoder";
export const ENCODER_JOB_PREFIX = "job-";
const TAF_HEADER_OTHER_FIELDS_RESERVE = 96;
const UINT32_VARINT_MAX_BYTES = 5;
/** A warning only: the actual packed offsets, not this upper estimate, decide validity. */
export const estimateTafHeaderMaximum = (chapters: number) =>
    TAF_HEADER_OTHER_FIELDS_RESERVE + chapters * UINT32_VARINT_MAX_BYTES;
export type EncoderFormat = "taf" | "native";
/** Native is browser-only; switching back to TAF restores the user's TAF preference. */
export const encoderUsesBrowser = (format: EncoderFormat, tafPreference: boolean) =>
    format === "native" || tafPreference;

export interface EncoderCapabilities {
    version: number;
    formats: {
        taf: { enabled: boolean; maxFiles: number; maxUploadBytes: number; headerBytes?: number };
        native: {
            enabled: boolean;
            maxFiles: number | null;
            maxChapterBytes: number;
            maxMetadataBytes: number;
        };
    };
    maxPcmFrames: number;
}

/** Old backends keep their existing 99-file TAF restriction. */
export const LEGACY_ENCODER_CAPABILITIES: EncoderCapabilities = {
    version: 0,
    formats: {
        taf: { enabled: true, maxFiles: 99, maxUploadBytes: 2147418111 },
        native: { enabled: false, maxFiles: null, maxChapterBytes: 0, maxMetadataBytes: 0 },
    },
    maxPcmFrames: ENCODER_CHUNK_FRAMES,
};

export const parseEncoderCapabilities = (value: unknown): EncoderCapabilities => {
    const data = value as EncoderCapabilities | undefined;
    const positive = (number: unknown): number is number =>
        typeof number === "number" && Number.isSafeInteger(number) && number > 0;
    if (
        data?.version !== 1 ||
        typeof data.formats?.taf?.enabled !== "boolean" ||
        !positive(data.formats.taf.maxFiles) ||
        !positive(data.formats.taf.maxUploadBytes) ||
        typeof data.formats.native?.enabled !== "boolean" ||
        (data.formats.native.maxFiles !== null && !positive(data.formats.native.maxFiles)) ||
        !positive(data.formats.native.maxChapterBytes) ||
        !positive(data.formats.native.maxMetadataBytes) ||
        !positive(data.maxPcmFrames)
    ) {
        throw new Error("Invalid encoder capabilities");
    }
    return data;
};

export type EncoderCommand =
    | { type: "init"; moduleUrl: string; jobId: string; format: EncoderFormat; maxBytes: number }
    | { type: "begin"; filename: string; audioId: number; bitrate: number }
    | { type: "chapter" }
    | { type: "pcm"; buffer: ArrayBuffer; frames: number }
    | { type: "finish" }
    | { type: "remove"; filename: string }
    | { type: "cleanup" };

export interface EncoderReply {
    requestId: number;
    ok: boolean;
    error?: string;
    file?: File;
    buffer?: ArrayBuffer;
}

/** Estimates, not promises: VBR, decoder internals and other tabs can use more space. */
export const estimateEncoderResources = (
    durations: readonly (number | null)[],
    bitrate: number,
    format: EncoderFormat,
) => {
    const known = durations.filter(
        (duration): duration is number =>
            duration !== null && Number.isFinite(duration) && duration >= 0,
    );
    const totalSeconds = known.reduce((sum, duration) => sum + duration, 0);
    const largestSeconds = known.reduce((largest, duration) => Math.max(largest, duration), 0);
    const bytesPerSecond = (bitrate * 1000) / 8;
    const totalBytes = Math.ceil(totalSeconds * bytesPerSecond);
    const diskBytes = Math.ceil(
        (format === "taf" ? totalSeconds : largestSeconds) * bytesPerSecond,
    );
    return {
        complete: known.length === durations.length,
        unknownFiles: durations.length - known.length,
        totalSeconds,
        totalBytes,
        diskBytes,
        // Stereo float32 output alone, excluding compressed input and decoder working memory.
        decodedBytes: Math.ceil(largestSeconds * ENCODER_SAMPLE_RATE * ENCODER_CHANNELS * 4),
    };
};

/** Every input remains a separate chapter; filenames are labels, never server paths. */
export const encoderChapterTitle = (name: string) => name.replace(/\.[^.]+$/, "").trim() || name;
