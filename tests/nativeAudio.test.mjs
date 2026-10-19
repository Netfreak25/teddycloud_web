import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
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
        { exports, require: (name) => mocks[name] || require(name), URLSearchParams, ...globals },
    );
    return exports;
};
const pictures = {
    toImageSrc: (value) => value,
    resolveTonieDisplayPicture: (...values) => values.find(Boolean),
};
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
    playlist: { kind: "native_collection", tracks: ["First", "Last"] },
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

test("player preserves Library metadata priority alongside native cache items", () => {
    const page = read("src/pages/tonies/TeddyAudioPlayerPage.tsx");
    assert.match(page, /\.\.\.standardItems, \.\.\.nativeItems, \.\.\.cachedNativeItems/);
    assert.match(page, /record\.tonieInfo\?\.series \|\|\s+assigned\?\.playlist\?\.title/);
    assert.match(page, /record\.tonieInfo\?\.tracks,\s+assigned\?\.playlist\?\.tracks/);
    assert.match(
        page,
        /resolveTonieDisplayPicture\(assigned\?\.customImage, assigned\?\.tonieInfo\.picture\)/,
    );
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
                "../../common/utils/cacheDownloadUtils": { cacheDownloadReason: () => "" },
                react: {
                    useState: () => [false, (value) => submitted.push(value)],
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
