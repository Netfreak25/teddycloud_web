import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("../src/utils/mqttDiagnostics.ts", import.meta.url), "utf8");
const exports = {};
let fetchResponse;
const requests = [];
vm.runInNewContext(
    ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
            esModuleInterop: true,
        },
    }).outputText,
    {
        exports,
        URLSearchParams,
        TextEncoder,
        fetch: async (...args) => {
            requests.push(args);
            return fetchResponse;
        },
        require: (name) =>
            name === "jszip"
                ? require(name)
                : { defaultAPIConfig: () => ({ basePath: "https://example.test/prefix/" }) },
    },
);
const session = (id = "session-1", files = [{ name: "events.jsonl", size: 2 }]) => ({
    id,
    startedAt: "2026-10-02T12:00:00Z",
    active: true,
    truncated: false,
    files,
});
const status = () => ({
    enabled: true,
    state: "recording",
    error: "",
    bytes: 2,
    droppedEvents: 0,
    sessions: [session()],
});

test("diagnostic schema validates counters, duplicate names and path-free identities", () => {
    assert.equal(exports.parseMqttDiagnosticStatus(status()).state, "recording");
    for (const name of ["../private.key", "a/b", "a\\b", "..", ""]) {
        const invalid = status();
        invalid.sessions[0].files[0].name = name;
        assert.throws(() => exports.parseMqttDiagnosticStatus(invalid));
    }
    for (const bytes of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER + 1])
        assert.throws(() => exports.parseMqttDiagnosticStatus({ ...status(), bytes }));
    const duplicate = status();
    duplicate.sessions[0].files.push({ ...duplicate.sessions[0].files[0] });
    assert.throws(() => exports.parseMqttDiagnosticStatus(duplicate));
    assert.throws(() =>
        exports.parseMqttDiagnosticStatus({ ...status(), sessions: [session(), session()] }),
    );
});

test("archive grouping is deterministic and reserves space for its manifest", () => {
    const size = 32 * 1024 * 1024;
    const sessions = [
        session("z", [{ name: "events.jsonl", size }]),
        session("a", [{ name: "events.jsonl", size }]),
    ];
    const parts = exports.buildMqttArchiveParts(sessions);
    assert.equal(parts.length, 2);
    assert.equal(parts[0][0].session, "a");
    assert.equal(parts[1][0].session, "z");
    assert.equal(exports.buildMqttArchiveParts([]).length, 0);
    assert.throws(() =>
        exports.buildMqttArchiveParts([
            session("x", [{ name: "large.jsonl", size: exports.MQTT_ARCHIVE_MAX_BYTES }]),
        ]),
    );
});

test("download URL uses the configured base and immutable snapshot prefix", () => {
    const url = new URL(
        exports.mqttDiagnosticUrl("BOX A", { session: "session-1", name: "events.jsonl", size: 2 }),
    );
    assert.equal(url.pathname, "/prefix/api/diagnostics/mqtt/file");
    assert.equal(url.searchParams.get("overlay"), "BOX A");
    assert.equal(url.searchParams.get("length"), "2");
});

test("deletion targets one recording in the selected overlay and reports backend errors", async () => {
    fetchResponse = { ok: true, json: async () => ({ ok: true }) };
    await exports.deleteMqttDiagnosticSession("BOX A", "session-1");
    const [address, options] = requests.at(-1);
    const url = new URL(address);
    assert.equal(url.pathname, "/prefix/api/diagnostics/mqtt/delete");
    assert.equal(url.searchParams.get("overlay"), "BOX A");
    assert.equal(url.searchParams.get("session"), "session-1");
    assert.equal(url.searchParams.has("file"), false);
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    fetchResponse = {
        ok: false,
        status: 409,
        json: async () => ({ error: "delete_failed", message: "Recording is unavailable" }),
    };
    await assert.rejects(
        exports.deleteMqttDiagnosticSession("BOX", "session-1"),
        /Recording is unavailable/,
    );
    const requestCount = requests.length;
    await assert.rejects(exports.deleteMqttDiagnosticSession("BOX", "../session-1"));
    await assert.rejects(exports.deleteMqttDiagnosticSession("", "session-1"));
    assert.equal(requests.length, requestCount);
});

test("rotated or incomplete files fail the archive instead of returning a partial success", async () => {
    const entries = exports.buildMqttArchiveParts([session()])[0];
    fetchResponse = { ok: false, status: 404 };
    await assert.rejects(
        exports.createMqttDiagnosticArchive("BOX", [session()], entries, 1, 1),
        /HTTP 404/,
    );
    fetchResponse = { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    await assert.rejects(
        exports.createMqttDiagnosticArchive("BOX", [session()], entries, 1, 1),
        /Incomplete/,
    );
    assert.equal(requests.at(-1)[1].cache, "no-store");
});

test("successful archive includes exact bytes and snapshot manifest", async () => {
    const entries = exports.buildMqttArchiveParts([session()])[0];
    fetchResponse = {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode("{} ".trim()).buffer,
    };
    const blob = await exports.createMqttDiagnosticArchive("BOX", [session()], entries, 1, 1);
    const zip = await require("jszip").loadAsync(await blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file("manifest.json").async("string"));
    assert.equal(manifest.overlay, "BOX");
    assert.equal(manifest.snapshot, true);
    assert.equal(manifest.sessions[0].active, true);
    assert.equal(manifest.files[0].size, 2);
    assert.equal(await zip.file("session-1/events.jsonl").async("string"), "{}");
});

test("box diagnostics use normal drafts, are TB2-only, and have all five translations", () => {
    const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const panel = read("src/components/common/form/MqttDiagnostics.tsx");
    const tabs = read("src/components/common/form/SettingsScopeTabs.tsx");
    const layout = JSON.parse(read("src/components/common/form/settingsLayout.json"));
    assert.ok(panel.includes("handler.changeSettingOverlayed(MQTT_DEBUG_SETTING, true)"));
    assert.ok(panel.includes("handler.changeSetting(MQTT_DEBUG_SETTING, value, true)"));
    assert.ok(!panel.includes("initializeSettings"));
    assert.ok(!panel.includes("setInterval"));
    assert.ok(panel.includes("<Popconfirm"));
    assert.ok(panel.includes("onConfirm={() => deleteRecording(session)}"));
    assert.ok(panel.includes('"settings.mqttDebug.deleteActiveHint"'));
    assert.ok(panel.includes('"settings.mqttDebug.deleteHint"'));
    assert.ok(panel.includes("disabled={busy}"));
    assert.ok(panel.includes("title={deleteError}"));
    assert.match(panel, /finally\s*\{\s*await refresh\(\);\s*setDeleting\(""\);/);
    assert.ok(panel.indexOf('t("settings.mqttDebug.privacy")') < panel.indexOf("<Switch"));
    assert.ok(panel.indexOf('t("settings.mqttDebug.privacy")') < panel.indexOf("<Collapse"));
    assert.ok(tabs.includes(': ["global", boxGeneration]'));
    assert.ok(tabs.includes('overlayId !== undefined && boxGeneration === "tb2"'));
    assert.ok(layout.overlay.ids.includes("mqtt_server.debug_enabled"));
    const english = JSON.parse(read("public/translations/en.json")).settings.mqttDebug;
    for (const language of ["de", "en", "es", "fr", "tlh"]) {
        const translated = JSON.parse(read(`public/translations/${language}.json`)).settings
            .mqttDebug;
        assert.deepEqual(Object.keys(translated), Object.keys(english));
        assert.deepEqual(Object.keys(translated.states), Object.keys(english.states));
    }
});

test("diagnostic drafts save explicit box values and preserve unrelated drafts", async () => {
    const calls = [];
    const handlerExports = {};
    const api = {
        apiPostTeddyCloudSetting: async (id, value, overlay, reset) => {
            calls.push({ id, value, overlay, reset });
        },
        apiTriggerWriteConfigGet: async () => calls.push({ config: true }),
    };
    const source = fs.readFileSync(
        new URL("../src/data/SettingsDataHandler.ts", import.meta.url),
        "utf8",
    );
    vm.runInNewContext(
        ts.transpileModule(source, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText,
        {
            exports: handlerExports,
            console,
            require: (name) => {
                if (name === "i18next") return { t: (key) => key };
                if (name.endsWith("/TeddyCloudApi"))
                    return {
                        TeddyCloudApi: class {
                            constructor() {
                                return api;
                            }
                        },
                    };
                if (name.endsWith("/defaultApiConfig")) return { defaultAPIConfig: () => ({}) };
                if (name.endsWith("/teddyCloudNotificationTypes"))
                    return { NotificationTypeEnum: { Success: "success", Error: "error" } };
                throw new Error(`Unexpected dependency: ${name}`);
            },
        },
    );
    const handler = handlerExports.default.initialize(
        () => {},
        (key) => key,
    );
    const debug = exports.MQTT_DEBUG_SETTING;
    const cache = "toniebox2.cacheContentV3";
    handler.initializeSettings(
        [debug, cache].map((iD) => ({
            iD,
            label: iD,
            description: "",
            shortname: iD,
            type: "bool",
            value: false,
            overlayed: false,
        })),
        "BOX-A",
    );
    handler.changeSettingOverlayed(cache, true);
    handler.changeSetting(cache, true, true);
    handler.changeSettingOverlayed(debug, true);
    handler.changeSetting(debug, true, true);
    assert.equal(handler.getSetting(cache).value, true);
    assert.equal(handler.getSetting(debug).initialValue, false);
    assert.equal(calls.length, 0, "toggle remains a draft until Save");
    await handler.saveAll();
    assert.deepEqual(
        calls.find((call) => call.id === debug),
        {
            id: debug,
            value: true,
            overlay: "BOX-A",
            reset: false,
        },
    );
    assert.equal(calls.filter((call) => call.config).length, 1);
    assert.equal(handler.hasUnchangedChanges(), false);
    calls.length = 0;
    handler.changeSetting(debug, false, true);
    await handler.saveAll();
    assert.equal(calls.find((call) => call.id === debug).reset, false);
    assert.equal(calls.find((call) => call.id === debug).value, false);
});
