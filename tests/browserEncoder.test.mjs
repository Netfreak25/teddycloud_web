import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
const compile = (name) =>
    ts.transpileModule(read(name), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
const exports = {};
vm.runInNewContext(compile("src/utils/audio/encoderProtocol.ts"), { exports });

test("native mode forces browser encoding while preserving the separate TAF preference", () => {
    for (const preference of [false, true]) {
        assert.equal(exports.encoderUsesBrowser("taf", preference), preference);
        assert.equal(exports.encoderUsesBrowser("native", preference), true);
        assert.equal(exports.encoderUsesBrowser("taf", preference), preference);
    }
    const component = read("src/components/tonies/encoder/Encoder.tsx");
    assert.match(
        component,
        /disabled=\{uploading \|\| processing \|\| outputFormat === "native"\}/,
    );
    assert.doesNotMatch(
        component,
        /disabled=\{uploading \|\| processing \|\| !useFrontendEncoding\}/,
    );
    for (const locale of ["de", "en", "fr", "es", "tlh"])
        assert.ok(
            JSON.parse(read(`public/translations/${locale}.json`)).tonies.encoder
                .nativeBrowserRequired,
        );
});

test("capabilities retain 99-file legacy guard, permit 114 files, and do not invent a native count limit", () => {
    assert.equal(exports.LEGACY_ENCODER_CAPABILITIES.formats.taf.maxFiles, 99);
    const capabilities = {
        version: 1,
        formats: {
            taf: { enabled: true, maxFiles: 4092, maxUploadBytes: 2147418111 },
            native: {
                enabled: true,
                maxFiles: null,
                maxChapterBytes: 2147483647,
                maxMetadataBytes: 1048576,
            },
        },
        maxPcmFrames: 48000,
    };
    assert.equal(exports.parseEncoderCapabilities(capabilities), capabilities);
    assert.equal(capabilities.formats.native.maxFiles, null);
    assert.throws(() => exports.parseEncoderCapabilities({ ...capabilities, maxPcmFrames: NaN }));
    assert.throws(() => exports.parseEncoderCapabilities({ version: 1 }));
});

test("resource estimates distinguish complete TAF output from one native chapter and unknown durations", () => {
    const taf = exports.estimateEncoderResources([60, 120, null], 96, "taf");
    const native = exports.estimateEncoderResources([60, 120, null], 96, "native");
    assert.equal(taf.complete, false);
    assert.equal(taf.unknownFiles, 1);
    assert.equal(taf.totalBytes, 180 * 12000);
    assert.equal(taf.diskBytes, taf.totalBytes);
    assert.equal(native.diskBytes, 120 * 12000);
    assert.equal(native.decodedBytes, 120 * 48000 * 2 * 4);
    assert.equal(exports.encoderChapterTitle("114 - Last chapter.mp3"), "114 - Last chapter");
});

/** Exercise the actual worker protocol while replacing only WASM and browser storage boundaries. */
function workerHarness({ writeMode = "short" } = {}) {
    const activeId = "job-11111111-1111-1111-1111-111111111111";
    const orphanId = "job-22222222-2222-2222-2222-222222222222";
    const jobId = "job-33333333-3333-3333-3333-333333333333";
    const held = new Set([`teddycloud-audio-encoder:${activeId}`]);
    const removed = [];
    const files = new Map();
    const replies = new Map();
    let sequence = 0;
    let sink;
    let context = 0;
    let size = 0;
    let writeCalls = 0;
    let closes = 0;
    const heap = new ArrayBuffer(48000 * 4 + 4096);
    const module = {
        HEAPU8: new Uint8Array(heap),
        HEAP16: new Int16Array(heap),
        _malloc: () => 4096,
        _free() {},
        _taf_encoder_create: () => ++context,
        _opus_encoder_create_file: () => ++context,
        _taf_encoder_new_chapter: () => 0,
        _taf_encoder_get_error: () => 2,
        _taf_encoder_get_size: () => size,
        _taf_encoder_free() {},
        _taf_encoder_encode: (_ctx, pointer, frames) => {
            const count = sink(size, pointer, frames * 4);
            if (count !== frames * 4) return -1;
            size += count;
            return 0;
        },
        _taf_encoder_finalize: () => 0,
    };
    const directory = {
        async getFileHandle(name) {
            files.set(name, []);
            return {
                async createSyncAccessHandle() {
                    return {
                        write(bytes, { at }) {
                            writeCalls++;
                            if (writeMode === "zero") return 0;
                            if (writeMode === "throw") throw new Error("QuotaExceededError");
                            const count = Math.min(3, bytes.length);
                            const output = files.get(name);
                            for (let i = 0; i < count; i++) output[at + i] = bytes[i];
                            return count;
                        },
                        truncate(length) {
                            files.get(name).length = length;
                        },
                        flush() {},
                        close() {
                            closes++;
                        },
                    };
                },
                async getFile() {
                    return { name, size: files.get(name).length, bytes: files.get(name).slice() };
                },
            };
        },
        async removeEntry(name) {
            files.delete(name);
        },
    };
    const root = {
        async *keys() {
            yield activeId;
            yield orphanId;
            yield "unrelated";
        },
        async getDirectoryHandle() {
            return directory;
        },
        async removeEntry(name) {
            removed.push(name);
        },
    };
    const scope = {
        exports: {},
        URL,
        Uint8Array,
        Int16Array,
        Promise,
        console,
        require(name) {
            if (name === "./encoderProtocol") return exports;
            return {
                __esModule: true,
                default: async (options) => {
                    sink = options.tafWrite;
                    return module;
                },
            };
        },
        navigator: {
            storage: {
                async getDirectory() {
                    return {
                        async getDirectoryHandle() {
                            return root;
                        },
                    };
                },
            },
            locks: {
                async request(name, _options, action) {
                    if (held.has(name)) return action(null);
                    held.add(name);
                    try {
                        return await action({ name });
                    } finally {
                        held.delete(name);
                    }
                },
            },
        },
        postMessage(reply) {
            replies.get(reply.requestId)(reply);
        },
    };
    vm.runInNewContext(compile("src/utils/audio/encoder.worker.ts"), scope);
    const call = (command) =>
        new Promise((resolve) => {
            const requestId = ++sequence;
            replies.set(requestId, resolve);
            scope.onmessage({ data: { ...command, requestId } });
        });
    return {
        call,
        jobId,
        activeId,
        orphanId,
        held,
        removed,
        files,
        counts: () => ({ writeCalls, closes }),
    };
}

test("worker preserves bytes across short disk writes, returns PCM ownership and protects another tab's files", async () => {
    const worker = workerHarness();
    const initialized = await worker.call({
        type: "init",
        jobId: worker.jobId,
        moduleUrl: "https://tc.example/encoder.js",
        format: "native",
        maxBytes: 1024,
    });
    assert.equal(initialized.ok, true, initialized.error);
    assert.deepEqual(worker.removed, [worker.orphanId]);
    assert.equal(
        (await worker.call({ type: "begin", filename: "chapter-0.opus", audioId: 1, bitrate: 96 }))
            .ok,
        true,
    );
    const buffer = new Int16Array([1, 2, 3, 4]).buffer;
    const reply = await worker.call({ type: "pcm", buffer, frames: 2 });
    assert.equal(reply.ok, true);
    assert.equal(reply.buffer, buffer);
    const finished = await worker.call({ type: "finish" });
    assert.equal(finished.ok, true);
    assert.deepEqual(Array.from(finished.file.bytes), Array.from(new Uint8Array(buffer)));
    assert.equal(worker.counts().writeCalls, 3);
    assert.equal(worker.counts().closes, 1);
    assert.equal((await worker.call({ type: "cleanup" })).ok, true);
    assert.ok(worker.removed.includes(worker.jobId));
    assert.ok(!worker.removed.includes(worker.activeId));
});

for (const mode of ["zero", "throw"])
    test(`worker reports ${mode} storage failure instead of accepting truncated output`, async () => {
        const worker = workerHarness({ writeMode: mode });
        await worker.call({
            type: "init",
            jobId: worker.jobId,
            moduleUrl: "https://tc.example/encoder.js",
            format: "native",
            maxBytes: 1024,
        });
        await worker.call({ type: "begin", filename: "chapter-0.opus", audioId: 1, bitrate: 96 });
        const reply = await worker.call({
            type: "pcm",
            buffer: new Int16Array([1, 2]).buffer,
            frames: 1,
        });
        assert.equal(reply.ok, false);
        assert.match(reply.error, /storage_write_failed|QuotaExceededError/);
        await worker.call({ type: "cleanup" });
        assert.ok(worker.removed.includes(worker.jobId));
    });

test("all five locales explain native output, unknown estimates and the TB1 warning", () => {
    for (const locale of ["de", "en", "fr", "es", "tlh"]) {
        const text = JSON.parse(read(`public/translations/${locale}.json`)).tonies.encoder;
        for (const key of [
            "nativeFormat",
            "extendedTafWarning",
            "preflightUnknown",
            "browserUnavailable",
            "cancelledDetails",
        ])
            assert.ok(text[key], `${locale}: ${key}`);
    }
});
