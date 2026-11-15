import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
let playlistMetadata;
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (path, mocks = {}, globals = {}) => {
    const exports = {};
    const source = read(path).replace(
        /import\.meta\.env\.VITE_APP_TEDDYCLOUD_API_URL/g,
        '"https://tc.example"',
    );
    vm.runInNewContext(
        ts.transpileModule(source, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText,
        {
            exports,
            require: (name) =>
                mocks[name] || (name === "./playlistMetadata" ? playlistMetadata : require(name)),
            URLSearchParams,
            ...globals,
        },
    );
    return exports;
};
const pictures = {
    toImageSrc: (value) => value,
    resolveTonieDisplayPicture: (...values) => values.find(Boolean),
};
playlistMetadata = compile("src/utils/audio/playlistMetadata.ts");
const audio = compile("src/utils/audio/nativeCollection.ts", {
    "../../components/tonies/common/utils/imagePathUtils": pictures,
});
const tonieModule = (globals = {}) =>
    compile(
        "src/utils/audio/tonieAudio.ts",
        {
            "./nativeCollection": audio,
            "../../components/tonies/common/utils/imagePathUtils": pictures,
        },
        globals,
    );
const tonie = (changes = {}) => ({
    ruid: "0123456789ABCDEF",
    source: "",
    cachePreference: "taf",
    valid: false,
    cacheState: { tafComplete: false, v3Complete: true, preferredOriginalKind: "taf" },
    playlist: {
        kind: "native_collection",
        contentVersion: 42,
        chapterCount: 2,
        tracks: ["First", "Last"],
        durations: [1.25, null],
    },
    tonieInfo: { series: "Test", episode: "", tracks: [] },
    ...changes,
});

test("native cache fallback does not hide the requested missing TAF and assigned sources win", () => {
    const { usesNativeTonieAudio } = tonieModule();
    assert.equal(usesNativeTonieAudio(tonie()), true);
    assert.equal(
        usesNativeTonieAudio(tonie({ cacheState: { tafComplete: true, v3Complete: true } })),
        false,
    );
    assert.equal(usesNativeTonieAudio(tonie({ source: "lib://some-custom.taf" })), false);
    assert.equal(usesNativeTonieAudio(tonie({ source: "https://radio.example" })), false);
    assert.equal(
        usesNativeTonieAudio(tonie({ playlist: undefined })),
        false,
        "Tonieplay is not audio",
    );
    assert.equal(
        usesNativeTonieAudio(
            tonie({ source: `lib://by/contentHash/${"a".repeat(64)}/library-entry.json` }),
        ),
        true,
    );
    const card = read("src/components/tonies/toniecard/TonieCard.tsx");
    assert.match(card, /const downloadAction =/);
    assert.match(card, /downloadAction \? \[downloadAction\]/);
    assert.match(
        read("src/components/tonies/toniecard/hooks/useTonieCardSaveFlow.ts"),
        /selectedSource\.trim\(\) && !tonieCard\.nocloud && !isOriginalCacheSource/,
    );
});

test("native playback shares ordered URLs and rejects partial title mappings", () => {
    const item = audio.nativeAudioToPlaybackItem(
        {
            id: "version",
            chapters: [
                { index: 0, url: "/0.opus", size: 4 },
                { index: 1, url: "/1.opus", size: 3 },
            ],
        },
        { tracks: ["Wrong"], fallbackTrackTitle: (n) => `Kapitel ${n}` },
    );
    assert.deepEqual(
        Array.from(item.sources, (source) => [source.url, source.title]),
        [
            ["/0.opus", "Kapitel 1"],
            ["/1.opus", "Kapitel 2"],
        ],
    );
    assert.deepEqual(
        Array.from(item.tracks, (track) => track.sourceIndex),
        [0, 1],
    );
});

test("uploaded native collection metadata wins consistently without changing chapter URLs", async () => {
    const hash = "a".repeat(64);
    const manifest = {
        format: "ogg-opus",
        contentHash: hash,
        title: "My audiobook",
        chapters: [
            {
                index: 0,
                originalName: "chapter-0.opus",
                sha256: "b".repeat(64),
                fileSize: 120,
                path: "chapters/0.opus",
                title: "Opening",
                durationSeconds: 1.25,
            },
            {
                index: 1,
                originalName: "chapter-1.opus",
                sha256: "c".repeat(64),
                fileSize: 160,
                path: "chapters/1.opus",
                title: "Ending",
                durationSeconds: 2.75,
            },
        ],
    };
    const module = compile(
        "src/utils/audio/nativeCollection.ts",
        {
            "../../components/tonies/common/utils/imagePathUtils": pictures,
        },
        { fetch: async () => ({ ok: true, json: async () => manifest }) },
    );
    const collection = await module.loadNativeCollectionFromSource(
        `lib://by/contentHash/${hash}/library-entry.json`,
    );
    const item = module.nativeCollectionToPlaybackItem(collection, "", {
        title: "Unrelated model",
        tracks: ["Wrong one", "Wrong two"],
    });
    assert.equal(item.title, "My audiobook");
    assert.deepEqual(
        Array.from(item.tracks, (track) => [track.title, track.durationSeconds]),
        [
            ["Opening", 1.25],
            ["Ending", 2.75],
        ],
    );
    assert.match(item.sources[1].url, /chapters\/1\.opus\?special=library$/);
    delete manifest.chapters[1].title;
    const partial = await module.loadNativeCollectionFromSource(
        `lib://by/contentHash/${hash}/library-entry.json`,
    );
    assert.deepEqual(
        Array.from(partial.tracks),
        ["Opening", ""],
        "Missing names preserve their chapter slots",
    );
});

test("player preserves Library metadata priority alongside native cache items", () => {
    const page = read("src/pages/tonies/TeddyAudioPlayerPage.tsx");
    assert.match(page, /\.\.\.standardItems, \.\.\.nativeItems, \.\.\.cachedNativeItems/);
    assert.match(page, /record\.tonieInfo\?\.series \|\| playlist\?\.title/);
    assert.match(page, /record\.tonieInfo\?\.tracks,\s+playlist\?\.tracks/);
    assert.doesNotMatch(page, /tonies\.find\(\(tonie\) => tonie\.source === source\)/);
    assert.match(
        page,
        /resolveTonieDisplayPicture\(imageTag\?\.customImage, imageTag\?\.tonieInfo\.picture\)/,
    );
    assert.match(page, /tonie\.ruid\.toUpperCase\(\) === tonieRuid\.toUpperCase\(\)/);
});

test("download reasons are shared, translated and authoritative only when supplied by the backend", () => {
    const { cacheDownloadReason } = compile(
        "src/components/tonies/common/utils/cacheDownloadUtils.ts",
    );
    const english = JSON.parse(read("public/translations/en.json")).tonies.cacheDownload.reasons;
    const translate = (key, options) => english[key.split(".").at(-1)] || options.defaultValue;
    assert.equal(cacheDownloadReason("", translate), "");
    assert.equal(
        cacheDownloadReason("missing_tb1_certificates", translate),
        "Complete TB1 client certificates are missing.",
    );
    assert.equal(cacheDownloadReason("new_backend_reason", translate), "new_backend_reason");
    for (const locale of ["de", "fr", "es", "tlh"]) {
        const reasons = JSON.parse(read(`public/translations/${locale}.json`)).tonies.cacheDownload
            .reasons;
        for (const key of Object.keys(english)) assert.ok(reasons[key], `${locale}: ${key}`);
    }
    const card = read("src/components/tonies/toniecard/TonieCard.tsx");
    assert.match(card, /backendBlockedReason !== undefined/);
    assert.match(card, /title=\{blockedReason \|\| downloadStatus/);
    assert.match(card, /\) : blockedReason \? \(/);
    assert.match(
        read("src/components/tonies/common/modals/TonieInformationModal.tsx"),
        /cacheDownloadReason\([\s\S]*?cacheState\?\.downloadBlockedReason/,
    );
});

test("cache-only audio uses only the local read API and keeps the versioned chapter URLs", async () => {
    const calls = [];
    const { loadTonieNativePlaybackItem } = tonieModule({
        fetch: async (url) => {
            calls.push(url);
            return {
                ok: true,
                json: async () => ({
                    contentVersion: 42,
                    chapters: [
                        { index: 0, url: "/api/content/native/tag/0.opus?version=42", size: 4 },
                        { index: 1, url: "/api/content/native/tag/1.opus?version=42", size: 3 },
                    ],
                }),
            };
        },
    });
    const item = await loadTonieNativePlaybackItem(tonie(), "BOX");
    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/content\/native\/0123456789ABCDEF\?overlay=BOX$/);
    assert.equal(
        item.sources[1].url,
        "https://tc.example/api/content/native/tag/1.opus?version=42",
    );
    assert.equal(item.sources[0].title, "First");
    assert.equal(item.id, "native:BOX:0123456789ABCDEF:42");
});

test("audio ZIP numbers and sanitizes filenames, preserves order and contains no manifest", async () => {
    const files = [];
    const calls = [];
    let saved;
    class Zip {
        file(name) {
            files.push(name);
        }
        async generateAsync() {
            return "zip";
        }
    }
    const module = compile(
        "src/utils/audio/nativeCollection.ts",
        {
            jszip: Zip,
            "../../components/tonies/common/utils/imagePathUtils": pictures,
        },
        {
            fetch: async (url) => {
                calls.push(url);
                return { ok: true, blob: async () => "audio" };
            },
            URL: { createObjectURL: () => "blob:zip", revokeObjectURL() {} },
            document: {
                createElement: () => ({
                    click() {
                        saved = this.download;
                    },
                }),
            },
        },
    );
    await module.downloadNativeAudioZip({
        title: "Test",
        sources: [
            { url: "first", title: "Same/Title" },
            { url: "last", title: "Same/Title" },
        ],
    });
    assert.deepEqual(files, ["001 - Same_Title.opus", "002 - Same_Title.opus"]);
    assert.deepEqual(calls, ["first", "last"]);
    assert.equal(saved, "TB2-Test.zip");
    assert.equal(
        files.some((name) => name.includes("json")),
        false,
    );
});

test("system audio keeps the legacy GET and body completion, ordinary tags use the cache worker", async () => {
    for (const system of [true, false]) {
        const events = [];
        const submitted = [];
        let stateIndex = 0;
        const response = { ok: true, blob: async () => events.push("body") };
        class Api {
            async apiGetTeddyCloudApiRaw(path) {
                events.push(["GET", path]);
                return response;
            }
            async apiPostTeddyCloudRaw(path, body, overlay) {
                events.push(["POST", path, body, overlay]);
                return response;
            }
        }
        const { useTonieCardActions } = compile(
            "src/components/tonies/toniecard/hooks/useTonieCardActions.ts",
            {
                "../../../../api": { TeddyCloudApi: Api },
                "../../../../config/defaultApiConfig": { defaultAPIConfig: () => ({}) },
                "../../../../types/teddyCloudNotificationTypes": {
                    NotificationTypeEnum: { Success: "success" },
                },
                "../../common/utils/cacheDownloadUtils": {
                    cacheDownloadReason: () => "",
                    isV3RefreshPending: () => false,
                },
                react: {
                    useState: (initial) => {
                        const isSubmitted = stateIndex++ === 0;
                        return [
                            initial,
                            (value) => {
                                if (isSubmitted) submitted.push(value);
                            },
                        ];
                    },
                    useRef: (current) => ({ current }),
                    useEffect: () => {},
                },
            },
        );
        const ruid = system ? "0000000000000001" : "0123456789ABCDEF";
        const actions = useTonieCardActions({
            tonieCard: tonie({ ruid, downloadTriggerUrl: "/legacy?overlay=BOX" }),
            overlay: "BOX",
            modelTitle: "Title",
            t: (key) => key,
            addNotification: () => {},
            addLoadingNotification: () => {},
            closeLoadingNotification: () => {},
            fetchUpdatedTonieCard: async () => events.push("refresh"),
        });
        await actions.handleBackgroundDownload();
        assert.deepEqual(
            events,
            system
                ? [["GET", "/legacy?overlay=BOX"], "body", "refresh"]
                : [["POST", `/api/content/cache/${ruid}`, "", "BOX"], "refresh"],
        );
        assert.deepEqual(submitted, system ? [true, false] : [true]);
    }
});

test("both format options are global-only and all locales describe export and job states", () => {
    const layout = JSON.parse(read("src/components/common/form/settingsLayout.json"));
    for (const key of ["cloud.cacheBothFormatsOnDownload", "cloud.cacheBothFormatsOnPlayback"]) {
        assert.equal(layout.sections.find((section) => section.ids?.includes(key)).scope, "global");
        assert.ok(layout.overlay.excludedIds.includes(key));
        for (const locale of ["de", "en", "fr", "es", "tlh"]) {
            const translation = JSON.parse(read(`public/translations/${locale}.json`));
            assert.ok(translation.settings.optionText[key.replaceAll(".", "__")].description);
            assert.ok(translation.tonies.infoModal.downloadNative);
            for (const state of ["queued", "running", "complete", "skipped", "failed"]) {
                assert.ok(translation.tonies.cacheDownload[state]);
            }
        }
    }
    const actions = read("src/components/tonies/toniecard/hooks/useTonieCardActions.ts");
    assert.match(actions, /apiPostTeddyCloudRaw\(/);
    assert.match(actions, /\/api\/content\/cache\//);
    assert.match(actions, /if \(systemTonie\) \{\s+await response\.blob\(\)/);
});

test("native manifest counts replace the Sandman and Benjamin figure catalogs", () => {
    for (const [count, catalogCount] of [
        [78, 10],
        [24, 11],
    ]) {
        const tag = tonie({
            tonieInfo: { tracks: Array(catalogCount).fill("Old model title") },
            trackSeconds: Array(catalogCount).fill(0),
            playlist: {
                kind: "native_collection",
                contentVersion: 42,
                chapterCount: count,
                tracks: Array(count).fill(""),
            },
        });
        const tracks = playlistMetadata.resolvePlaybackTracks(tag, true, 42);
        assert.equal(tracks.length, count);
        assert.equal(
            tracks.every((name) => name === ""),
            true,
        );
        assert.equal(playlistMetadata.resolvePlaybackTracks(tag, true, 41).length, 0);
        assert.equal(
            playlistMetadata.resolvePlaybackTracks({ ...tag, playlist: undefined }, true, 42)
                .length,
            0,
        );
        assert.equal(
            playlistMetadata.resolvePlaybackTracks(
                { ...tag, playlist: { kind: "native_collection", tracks: ["Wrong"] } },
                true,
            ).length,
            0,
        );
    }
});

test("native titles are positional and fractional unknown durations never become zero", () => {
    const item = audio.nativeAudioToPlaybackItem(
        {
            id: "version",
            chapters: Array.from({ length: 3 }, (_, index) => ({
                index,
                url: `/${index}.opus`,
                size: 1,
            })),
        },
        { tracks: [" Opening ", "", "Ending"], durations: [33.125, null, 12.875] },
    );
    assert.deepEqual(
        Array.from(item.tracks, (track) => [track.title, track.durationSeconds]),
        [
            ["Opening", 33.125],
            ["Chapter 2", undefined],
            ["Ending", 12.875],
        ],
    );
    assert.deepEqual(
        Array.from(
            playlistMetadata.mergeChapterTitles(
                3,
                ["Own", "", "End"],
                ["Other", "Middle", "Wrong"],
            ),
        ),
        ["Own", "Middle", "End"],
    );
    assert.deepEqual(
        Array.from(playlistMetadata.mergeChapterDurations(3, [1.25, null, NaN], [9, 2.75, -1])),
        [1.25, 2.75, null],
    );
    assert.equal(
        playlistMetadata.playlistTotalSeconds({ chapterCount: 3, durations: [1.25, null, 2.75] }),
        undefined,
    );
    assert.equal(
        playlistMetadata.playlistTotalSeconds({ chapterCount: 3, durations: [1.25, 2.75] }),
        undefined,
    );
    assert.equal(
        playlistMetadata.playlistTotalSeconds({ chapterCount: 2, durations: [1.75, 2.75] }),
        4.5,
    );
    assert.equal(
        playlistMetadata.matchingNativePlaylist({ kind: "native_collection", chapterCount: 2 }, 42),
        undefined,
    );
});

test("native cache playback ignores metadata from another version and physical figure names", async () => {
    const { loadTonieNativePlaybackItem } = tonieModule({
        fetch: async () => ({
            ok: true,
            json: async () => ({
                contentVersion: 43,
                chapters: [
                    { index: 0, url: "/api/content/native/tag/0.opus?version=43", size: 4 },
                    { index: 1, url: "/api/content/native/tag/1.opus?version=43", size: 3 },
                ],
            }),
        }),
    });
    const item = await loadTonieNativePlaybackItem(
        tonie({
            sourceInfo: { series: "Unproven content title", tracks: ["Wrong", "Wrong"] },
            tonieInfo: { series: "Figure", tracks: ["Old", "Old"] },
        }),
        "BOX",
    );
    assert.equal(item.title.startsWith("TB2 "), true);
    assert.deepEqual(
        Array.from(item.tracks, (track) => [track.title, track.durationSeconds]),
        [
            ["Chapter 1", undefined],
            ["Chapter 2", undefined],
        ],
    );
});

test("TAF legacy chapter selection is unchanged and native metadata notices are translated", () => {
    const tag = tonie({
        playlist: undefined,
        source: "lib://test.taf",
        sourceInfo: { tracks: ["A", "B"] },
        trackSeconds: [0, 61],
    });
    assert.deepEqual(Array.from(playlistMetadata.resolvePlaybackTracks(tag)), ["A", "B"]);
    assert.deepEqual(
        Array.from(
            playlistMetadata.resolvePlaybackTracks({
                ...tag,
                playlist: { kind: "direct_taf", chapterCount: 3, tracks: ["A"] },
            }),
        ),
        ["A", "", ""],
    );
    for (const locale of ["de", "en", "fr", "es", "tlh"]) {
        const messages = JSON.parse(read(`public/translations/${locale}.json`)).tonies.infoModal
            .nativeMetadata;
        for (const key of ["pending", "partial", "unavailable", "totalDuration"])
            assert.ok(messages[key], `${locale}: ${key}`);
    }
});

test("runtime metadata reload keeps request order and box, tag, version and revision identity", () => {
    const card = read("src/components/tonieboxes/tonieboxcard/TonieboxCard.tsx");
    assert.match(
        card,
        /tonieboxCard\.ID,\s*currentRuid,\s*currentContentVersion,\s*runtime\?\.playback\.metadataRevision/,
    );
    assert.match(card, /\}, \[metadataKey\]\)/);
    assert.match(card, /request !== metadataRequest\.current/);
    assert.match(card, /currentMetadataKey\.current !== metadataKey/);
    assert.match(
        card,
        /tonie=\{loadedMetadataKey === metadataKey \? nowPlayingTonie : undefined\}/,
    );
});
