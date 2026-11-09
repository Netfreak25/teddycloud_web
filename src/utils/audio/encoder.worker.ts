import {
    ENCODER_CHANNELS,
    ENCODER_CHUNK_FRAMES,
    ENCODER_JOB_PREFIX,
    ENCODER_TEMP_DIRECTORY,
    type EncoderCommand,
    type EncoderFormat,
    type EncoderReply,
} from "./encoderProtocol";

interface SyncFile {
    write(bytes: Uint8Array, options: { at: number }): number;
    truncate(size: number): void;
    flush(): void;
    close(): void;
}

interface EncoderModule {
    HEAPU8: Uint8Array;
    HEAP16: Int16Array;
    _malloc(bytes: number): number;
    _free(pointer: number): void;
    _taf_encoder_create(audioId: number, bitrate: number): number;
    _opus_encoder_create_file(audioId: number, bitrate: number): number;
    _taf_encoder_encode(context: number, pointer: number, frames: number): number;
    _taf_encoder_new_chapter(context: number): number;
    _taf_encoder_finalize(context: number): number;
    _taf_encoder_get_error(context: number): number;
    _taf_encoder_get_size(context: number): number;
    _taf_encoder_free(context: number): void;
}

const scope = globalThis as unknown as {
    onmessage: (event: MessageEvent<EncoderCommand & { requestId: number }>) => void;
    postMessage: (message: EncoderReply, transfer?: Transferable[]) => void;
};
let module: EncoderModule;
let root: FileSystemDirectoryHandle | undefined;
let directory: FileSystemDirectoryHandle | undefined;
let fileHandle: FileSystemFileHandle | undefined;
let output: SyncFile | undefined;
let context = 0;
let pcmPointer = 0;
let jobId = "";
let format: EncoderFormat = "taf";
let maxBytes = 0;
let sinkError = "";
let releaseLock: (() => void) | undefined;
let lockTask: Promise<void> | undefined;

const lockName = (id: string) => `${ENCODER_TEMP_DIRECTORY}:${id}`;

/** Remove only our abandoned job directories, never an active job in another tab. */
async function clearAbandonedJobs(handle: FileSystemDirectoryHandle) {
    const iterable = handle as FileSystemDirectoryHandle & {
        keys(): AsyncIterableIterator<string>;
    };
    for await (const name of iterable.keys()) {
        if (!/^job-[a-f0-9-]{36}$/.test(name) || name === jobId) continue;
        await navigator.locks.request(lockName(name), { ifAvailable: true }, async (lock) => {
            if (lock) await handle.removeEntry(name, { recursive: true });
        });
    }
}

function closeEncoder() {
    if (context) module._taf_encoder_free(context);
    context = 0;
    if (pcmPointer) module._free(pcmPointer);
    pcmPointer = 0;
    output?.close();
    output = undefined;
    fileHandle = undefined;
}

async function cleanup() {
    try {
        closeEncoder();
        if (root && directory) await root.removeEntry(jobId, { recursive: true });
    } finally {
        directory = undefined;
        releaseLock?.();
        releaseLock = undefined;
        await lockTask;
        lockTask = undefined;
    }
}

/** The C callback runs synchronously; errors abort encoding, never truncate silently. */
function writeOutput(offset: number, pointer: number, length: number): number {
    try {
        if (!output || !Number.isSafeInteger(offset) || offset < 0 || offset + length > maxBytes)
            throw new Error("output_limit");
        const bytes = module.HEAPU8.subarray(pointer, pointer + length);
        let written = 0;
        while (written < length) {
            const count = output.write(bytes.subarray(written), { at: offset + written });
            if (!Number.isInteger(count) || count <= 0 || count > length - written)
                throw new Error("storage_write_failed");
            written += count;
        }
        return written;
    } catch (error) {
        sinkError = error instanceof Error ? error.message : String(error);
        return -1;
    }
}

function check(result: number) {
    if (result !== 0)
        throw new Error(sinkError || `encoder_error_${module._taf_encoder_get_error(context)}`);
}

async function handle(command: EncoderCommand): Promise<Partial<EncoderReply>> {
    switch (command.type) {
        case "init": {
            if (
                !command.jobId.startsWith(ENCODER_JOB_PREFIX) ||
                !/^job-[a-f0-9-]{36}$/.test(command.jobId)
            )
                throw new Error("invalid_job");
            jobId = command.jobId;
            format = command.format;
            maxBytes = command.maxBytes;
            const acquired = new Promise<void>((resolve, reject) => {
                lockTask = navigator.locks.request(
                    lockName(jobId),
                    { ifAvailable: true },
                    async (lock) => {
                        if (!lock) throw new Error("job_busy");
                        await new Promise<void>((release) => {
                            releaseLock = release;
                            resolve();
                        });
                    },
                );
                void lockTask.catch(reject);
            });
            await acquired;
            root = await (
                await navigator.storage.getDirectory()
            ).getDirectoryHandle(ENCODER_TEMP_DIRECTORY, { create: true });
            await clearAbandonedJobs(root);
            directory = await root.getDirectoryHandle(jobId, { create: true });
            const { default: factory } = await import(/* @vite-ignore */ command.moduleUrl);
            module = await factory({
                locateFile: (name: string) => {
                    const url = new URL(name, command.moduleUrl);
                    url.search = new URL(command.moduleUrl).search;
                    return url.href;
                },
                tafWrite: writeOutput,
            });
            if (
                typeof module._opus_encoder_create_file !== "function" ||
                typeof module._taf_encoder_get_error !== "function"
            )
                throw new Error("encoder_version_mismatch");
            return {};
        }
        case "begin": {
            if (
                !directory ||
                output ||
                !/^(audio\.taf|chapter-[0-9]+\.opus)$/.test(command.filename)
            )
                throw new Error("invalid_output");
            sinkError = "";
            fileHandle = await directory.getFileHandle(command.filename, { create: true });
            output = await (
                fileHandle as FileSystemFileHandle & { createSyncAccessHandle(): Promise<SyncFile> }
            ).createSyncAccessHandle();
            output.truncate(0);
            context =
                format === "taf"
                    ? module._taf_encoder_create(command.audioId, command.bitrate)
                    : module._opus_encoder_create_file(command.audioId, command.bitrate);
            if (!context) throw new Error(sinkError || "encoder_create_failed");
            pcmPointer = module._malloc(ENCODER_CHUNK_FRAMES * ENCODER_CHANNELS * 2);
            if (!pcmPointer) throw new Error("encoder_memory_failed");
            return {};
        }
        case "chapter":
            if (!context || format !== "taf") throw new Error("invalid_chapter");
            check(module._taf_encoder_new_chapter(context));
            return {};
        case "pcm": {
            if (
                !context ||
                !Number.isInteger(command.frames) ||
                command.frames < 1 ||
                command.frames > ENCODER_CHUNK_FRAMES ||
                command.buffer.byteLength < command.frames * ENCODER_CHANNELS * 2
            )
                throw new Error("invalid_pcm");
            module.HEAP16.set(
                new Int16Array(command.buffer, 0, command.frames * ENCODER_CHANNELS),
                pcmPointer / 2,
            );
            check(module._taf_encoder_encode(context, pcmPointer, command.frames));
            return { buffer: command.buffer };
        }
        case "finish": {
            if (!context || !output || !fileHandle) throw new Error("invalid_finish");
            check(module._taf_encoder_finalize(context));
            const size = module._taf_encoder_get_size(context);
            output.truncate(size);
            output.flush();
            const finished = fileHandle;
            closeEncoder();
            return { file: await finished.getFile() };
        }
        case "remove":
            if (!directory || !/^(audio\.taf|chapter-[0-9]+\.opus)$/.test(command.filename))
                throw new Error("invalid_output");
            await directory.removeEntry(command.filename);
            return {};
        case "cleanup":
            await cleanup();
            return {};
    }
}

// One message at a time also makes cancellation wait for the current bounded PCM block.
let pending = Promise.resolve();
scope.onmessage = (event) => {
    pending = pending.then(async () => {
        try {
            const result = await handle(event.data);
            scope.postMessage(
                { requestId: event.data.requestId, ok: true, ...result },
                result.buffer ? [result.buffer] : [],
            );
        } catch (error) {
            scope.postMessage({
                requestId: event.data.requestId,
                ok: false,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    });
};
