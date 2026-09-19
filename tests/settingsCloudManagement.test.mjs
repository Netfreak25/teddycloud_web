// Run with node --test tests/settingsCloudManagement.test.mjs. No server required.
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";

const web = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const ts = require("typescript");
const UPSTREAM = "mqtt_client_upstream.enabled";
const MASTER = "mqtt_client_upstream.filters_enabled";
const DESIRED = "mqtt_client_upstream.forward.settings.desired";
const LOCAL_CONTROL = "mqtt_client_upstream.local_control_enabled";
const VOLUME = "toniebox2.max_volume";
const CACHE = "toniebox2.cacheContentV3";

// Use production TypeScript, with only the network and notifications substituted.
function loadModule(entry, api = {}) {
    const cache = new Map();
    function load(filename) {
        if (cache.has(filename)) return cache.get(filename);
        const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText;
        const exports = {};
        cache.set(filename, exports);
        vm.runInNewContext(
            compiled,
            {
                exports,
                console,
                require: (name) => {
                    if (name === "i18next") return { t: (key) => key };
                    if (name.endsWith("/TeddyCloudApi")) {
                        return {
                            TeddyCloudApi: class {
                                constructor() {
                                    return api;
                                }
                            },
                        };
                    }
                    if (name.endsWith("/defaultApiConfig")) return { defaultAPIConfig: () => ({}) };
                    if (name.endsWith("/teddyCloudNotificationTypes")) {
                        return { NotificationTypeEnum: { Success: "success", Error: "error" } };
                    }
                    assert.ok(name.startsWith("."), `Unexpected dependency: ${name}`);
                    return load(path.resolve(path.dirname(filename), `${name}.ts`));
                },
            },
            { filename },
        );
        return exports;
    }
    return load(path.join(web, entry));
}

function setting(iD, value, extra = {}) {
    return {
        iD,
        value,
        type: typeof value === "boolean" ? "bool" : "uint",
        label: iD,
        description: "",
        shortname: iD,
        overlayed: true,
        ...extra,
    };
}

function options({ upstream = true, desired = false } = {}) {
    return [
        setting(UPSTREAM, upstream),
        setting(MASTER, true),
        setting(DESIRED, desired),
        setting(LOCAL_CONTROL, false),
        setting(VOLUME, 50, { cloudSettingsState: "local" }),
        setting(CACHE, false),
    ];
}

function harness(initialOptions = options()) {
    const server = structuredClone(initialOptions);
    const calls = [];
    const notices = [];
    const api = {
        apiPostTeddyCloudSetting: async (id, value, overlay, reset) => {
            calls.push({ kind: "write", id, value, overlay, reset });
            const entry = server.find((item) => item.iD === id);
            entry.value = value;
            entry.overlayed = !reset;
        },
        apiGetIndexGet: async (overlay) => {
            calls.push({ kind: "index", overlay });
            const cloud =
                server.find((item) => item.iD === UPSTREAM)?.value === true &&
                (server.find((item) => item.iD === MASTER)?.value === false ||
                    server.find((item) => item.iD === DESIRED)?.value !== false);
            const volume = server.find((item) => item.iD === VOLUME);
            if (volume?.cloudSettingsState !== undefined) {
                volume.readOnly = cloud;
                volume.readOnlyReason = cloud ? "tonies_settings" : undefined;
                volume.cloudSettingsState = cloud ? "waiting" : "local";
            }
            return { options: structuredClone(server) };
        },
        apiTriggerWriteConfigGet: async () => {
            calls.push({ kind: "config" });
        },
        apiGetTeddyCloudSettingRaw: async () => ({ text: async () => "false" }),
    };
    const Handler = loadModule("src/data/SettingsDataHandler.ts", api).default;
    const handler = Handler.initialize(
        (...args) => notices.push(args),
        (key) => key,
    );
    handler.initializeSettings(structuredClone(initialOptions), "BOX-A");
    return { handler, api, calls, notices, server };
}

test("API metadata survives parsing and older responses keep optional fields absent", () => {
    const { OptionsItemFromJSON, OptionsItemToJSON } = loadModule("src/api/models/OptionsItem.ts");
    const payload = {
        ID: VOLUME,
        value: 50,
        readOnly: true,
        readOnlyReason: "tonies_settings",
        cloudSettingsState: "received",
    };
    const parsed = OptionsItemFromJSON(payload);
    assert.equal(parsed.readOnly, true);
    assert.equal(parsed.readOnlyReason, "tonies_settings");
    assert.equal(parsed.cloudSettingsState, "received");
    assert.equal(OptionsItemToJSON(parsed).cloudSettingsState, "received");
    const legacy = OptionsItemFromJSON({ ID: VOLUME, value: 50 });
    assert.equal(legacy.readOnly, undefined);
    assert.equal(legacy.readOnlyReason, undefined);
    assert.equal(legacy.cloudSettingsState, undefined);
});

test("only the ten box settings are cloud-managed; globals and cache remain editable", () => {
    const { getTb2SettingAccess, isTb2DeviceSetting, isCloudSettingsAuthoritySetting } = loadModule(
        "src/utils/tb2SettingsAuthority.ts",
    );
    const fields = [
        "max_volume",
        "bedtime_max_volume",
        "max_headphone_volume",
        "bedtime_max_headphone_volume",
        "lightring_brightness",
        "bedtime_lightring_brightness",
        "scrubbing_enabled",
        "slap_enabled",
        "slap_back_left",
        "baby_mode",
    ];
    const lookup = (id) => ({ value: id !== LOCAL_CONTROL });
    for (const name of fields) {
        const field = setting(`toniebox2.${name}`, 50, {
            overlayId: "BOX-A",
            cloudSettingsState: "received",
        });
        assert.equal(isTb2DeviceSetting(field.iD), true);
        assert.equal(getTb2SettingAccess(field, lookup).disabled, true);
        assert.equal(
            getTb2SettingAccess({ ...field, overlayId: undefined }, lookup).disabled,
            false,
        );
    }
    for (const id of [CACHE, "toniebox2.cacheToLibraryV3", "toniebox2.cacheTonieplayToLibraryV3"]) {
        assert.equal(isTb2DeviceSetting(id), false);
        assert.equal(
            getTb2SettingAccess(setting(id, false, { overlayId: "BOX-A" }), lookup).disabled,
            false,
        );
    }
    assert.equal(isCloudSettingsAuthoritySetting(UPSTREAM), true);
    assert.equal(isCloudSettingsAuthoritySetting(MASTER), true);
    assert.equal(isCloudSettingsAuthoritySetting(DESIRED), true);
    assert.equal(isCloudSettingsAuthoritySetting(LOCAL_CONTROL), false);
});

test("master bypass and draft authority changes do not depend on app-control permission", () => {
    const { getTb2SettingAccess } = loadModule("src/utils/tb2SettingsAuthority.ts");
    const field = setting(VOLUME, 50, {
        overlayId: "BOX-A",
        readOnly: true,
        readOnlyReason: "tonies_settings",
        cloudSettingsState: "confirmed",
    });
    const values = { [UPSTREAM]: true, [MASTER]: true, [DESIRED]: true, [LOCAL_CONTROL]: true };
    const access = () => getTb2SettingAccess(field, (id) => ({ value: values[id] }));
    assert.equal(access().disabled, true, "local-control exception cannot unlock cloud settings");
    values[DESIRED] = false;
    values[LOCAL_CONTROL] = false;
    assert.equal(access().disabled, false, "blocked desired releases the dynamic lock");
    values[MASTER] = false;
    assert.equal(access().disabled, true, "manual-filter bypass gives desired back to TONIES");
    values[UPSTREAM] = false;
    assert.equal(access().disabled, false);
    assert.equal(
        getTb2SettingAccess({ ...field, readOnlyReason: "immutable" }, (id) => ({
            value: values[id],
        })).disabled,
        true,
    );
});

test("older backend preserves existing local-control gating, without disabling cache fields", () => {
    const { getTb2SettingAccess } = loadModule("src/utils/tb2SettingsAuthority.ts");
    const values = { [UPSTREAM]: true, [LOCAL_CONTROL]: false };
    const lookup = (id) => ({ value: values[id] });
    const field = setting(VOLUME, 50, { overlayId: "BOX-A" });
    assert.equal(getTb2SettingAccess(field, lookup).disabled, true);
    values[LOCAL_CONTROL] = true;
    assert.equal(getTb2SettingAccess(field, lookup).disabled, false);
    assert.equal(
        getTb2SettingAccess(setting(CACHE, false, { overlayId: "BOX-A" }), lookup).disabled,
        false,
    );
});

test("authority changes are saved and refreshed before dependent edits", async () => {
    const { handler, calls, notices } = harness(options({ desired: true }));
    handler.changeSetting(DESIRED, false, true);
    handler.changeSetting(VOLUME, 60, true);
    await handler.saveAll();
    const desiredWrite = calls.findIndex((call) => call.id === DESIRED);
    const refresh = calls.findIndex((call) => call.kind === "index");
    const volumeWrite = calls.findIndex((call) => call.id === VOLUME);
    assert.ok(desiredWrite >= 0 && refresh > desiredWrite && volumeWrite > refresh);
    assert.equal(calls[refresh].overlay, "BOX-A");
    assert.equal(handler.getSetting(VOLUME).value, 60);
    assert.equal(handler.hasUnchangedChanges(), false);
    assert.equal(
        notices.some(([type]) => type === "error"),
        false,
    );
});

test("new cloud authority prevents a conflicting local edit and leaves it unsaved", async () => {
    const { handler, calls, notices } = harness();
    handler.changeSetting(VOLUME, 60, true);
    handler.changeSetting(DESIRED, true, true);
    await handler.saveAll();
    assert.ok(calls.some((call) => call.id === DESIRED));
    assert.equal(
        calls.some((call) => call.id === VOLUME),
        false,
    );
    assert.equal(handler.hasUnchangedChanges(), true);
    assert.ok(notices.some(([type]) => type === "error"));
});

test("rejected setting writes are not marked saved", async () => {
    const { handler, api, calls, notices } = harness();
    api.apiPostTeddyCloudSetting = async () => {
        throw new Error("409: TONIES manages this setting");
    };
    handler.changeSetting(VOLUME, 60, true);
    await handler.saveAll();
    assert.equal(handler.getSetting(VOLUME).initialValue, 50);
    assert.equal(handler.getSetting(VOLUME).value, 60);
    assert.equal(handler.hasUnchangedChanges(), true);
    assert.equal(
        calls.some((call) => call.kind === "config"),
        false,
    );
    assert.ok(notices.some(([type]) => type === "error"));
});

test("existing app-control enable-before and disable-after save order is retained", async () => {
    const { handler, calls } = harness();
    handler.changeSetting(LOCAL_CONTROL, true, true);
    handler.changeSetting(CACHE, true, true);
    await handler.saveAll();
    assert.ok(
        calls.findIndex((call) => call.id === LOCAL_CONTROL) <
            calls.findIndex((call) => call.id === CACHE),
    );
    calls.length = 0;
    handler.changeSetting(LOCAL_CONTROL, false, true);
    handler.changeSetting(CACHE, false, true);
    await handler.saveAll();
    assert.ok(
        calls.findIndex((call) => call.id === CACHE) <
            calls.findIndex((call) => call.id === LOCAL_CONTROL),
    );
});

test("opening another settings dialog clears the previous unsaved marker", () => {
    const { handler } = harness();
    handler.changeSetting(CACHE, true, true);
    assert.equal(handler.hasUnchangedChanges(), true);
    handler.initializeSettings(options(), "BOX-B");
    assert.equal(handler.hasUnchangedChanges(), false);
    assert.equal(handler.getSetting(CACHE).overlayId, "BOX-B");
});

test("settings refresh preserves unrelated drafts while updating backend metadata", async () => {
    const { handler, server } = harness(options({ desired: true }));
    handler.changeSetting(CACHE, true, true);
    server.find((item) => item.iD === VOLUME).value = 35;
    await handler.refreshSettings();
    assert.equal(handler.getSetting(VOLUME).value, 35);
    assert.equal(handler.getSetting(VOLUME).readOnly, true);
    assert.equal(handler.getSetting(VOLUME).readOnlyReason, "tonies_settings");
    assert.equal(handler.getSetting(CACHE).value, true);
    assert.equal(handler.getSetting(CACHE).initialValue, false);
    assert.equal(handler.hasUnchangedChanges(), true);
});

test("late settings-index response cannot overwrite a newly opened box dialog", async () => {
    const { handler, api } = harness();
    let respond;
    api.apiGetIndexGet = () =>
        new Promise((resolve) => {
            respond = resolve;
        });
    const pending = handler.refreshSettings();
    const next = options();
    next.find((item) => item.iD === VOLUME).value = 80;
    handler.initializeSettings(next, "BOX-B");
    respond({ options: options({ desired: true }) });
    await pending;
    assert.equal(handler.getSetting(VOLUME).value, 80);
    assert.equal(handler.getSetting(VOLUME).overlayId, "BOX-B");
    assert.equal(handler.hasUnchangedChanges(), false);
});

test("partial save persists accepted fields and retries only the rejected field", async () => {
    const { handler, api, calls, notices } = harness();
    const write = api.apiPostTeddyCloudSetting;
    api.apiPostTeddyCloudSetting = async (...args) => {
        if (args[0] === CACHE) throw new Error("409: setting became read-only");
        await write(...args);
    };
    handler.changeSetting(VOLUME, 60, true);
    handler.changeSetting(CACHE, true, true);
    await handler.saveAll();
    assert.equal(handler.getSetting(VOLUME).initialValue, 60);
    assert.equal(handler.getSetting(CACHE).initialValue, false);
    assert.equal(handler.getSetting(CACHE).value, true);
    assert.equal(handler.hasUnchangedChanges(), true);
    assert.equal(calls.filter((call) => call.kind === "config").length, 1);
    assert.ok(notices.some(([type]) => type === "error"));

    calls.length = 0;
    api.apiPostTeddyCloudSetting = write;
    await handler.saveAll();
    assert.deepEqual(
        calls.filter((call) => call.kind === "write").map((call) => call.id),
        [CACHE],
    );
    assert.equal(calls.filter((call) => call.kind === "config").length, 1);
    assert.equal(handler.hasUnchangedChanges(), false);
});

test("failed config persistence remains retryable across discard and dialog changes", async () => {
    const { handler, api, calls, notices, server } = harness();
    const persist = api.apiTriggerWriteConfigGet;
    api.apiTriggerWriteConfigGet = async () => {
        throw new Error("config write failed");
    };
    handler.changeSetting(VOLUME, 60, true);
    await handler.saveAll();
    assert.equal(handler.getSetting(VOLUME).initialValue, 60);
    assert.equal(handler.hasUnchangedChanges(), true);
    assert.ok(notices.some(([type]) => type === "error"));
    handler.resetAll();
    assert.equal(handler.hasUnchangedChanges(), true, "discard cannot undo a pending config write");
    handler.initializeSettings(structuredClone(server), "BOX-A");
    assert.equal(
        handler.hasUnchangedChanges(),
        true,
        "opening a dialog cannot hide pending persistence",
    );

    calls.length = 0;
    api.apiTriggerWriteConfigGet = persist;
    await handler.saveAll();
    assert.equal(calls.filter((call) => call.kind === "write").length, 0);
    assert.equal(calls.filter((call) => call.kind === "config").length, 1);
    assert.equal(handler.hasUnchangedChanges(), false);
});

test("reset saves global inheritance even when the inherited value is unchanged", async () => {
    const { handler, api, calls } = harness();
    const globalReads = [];
    api.apiGetTeddyCloudSettingRaw = async (...args) => {
        globalReads.push(args);
        return { text: async () => "false" };
    };
    handler.changeSettingOverlayed(CACHE, false);
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(globalReads, [[CACHE]], "inheritance reads global rather than box values");
    assert.equal(handler.getSetting(CACHE).value, false);
    assert.equal(handler.hasUnchangedChanges(), true);
    assert.equal(calls.length, 0, "reset remains a draft until Save");
    await handler.saveAll();
    assert.deepEqual(
        calls.filter((call) => call.kind === "write"),
        [
            {
                kind: "write",
                id: CACHE,
                value: false,
                overlay: "BOX-A",
                reset: true,
            },
        ],
    );
    assert.equal(handler.getSetting(CACHE).overlayed, false);
    assert.equal(handler.hasUnchangedChanges(), false);
});

test("legacy library dependency unlocks in the same draft when content caching is enabled", async () => {
    const libraryIds = ["toniebox2.cacheToLibraryV3", "toniebox2.cacheTonieplayToLibraryV3"];
    const initial = options().map(({ cloudSettingsState, ...option }) => option);
    initial.push(...libraryIds.map((id) => setting(id, false, { readOnly: true })));
    const { handler, calls, notices } = harness(initial);
    const { getTb2SettingAccess } = loadModule("src/utils/tb2SettingsAuthority.ts");
    const access = (id) =>
        getTb2SettingAccess(handler.getSetting(id), (key) => handler.getSetting(key));
    for (const id of libraryIds) assert.equal(access(id).disabled, true);

    handler.changeSetting(CACHE, true, true);
    for (const id of libraryIds) {
        assert.equal(access(id).disabled, false);
        handler.changeSetting(id, true, true);
    }
    await handler.saveAll();
    assert.deepEqual(
        calls.filter((call) => call.kind === "write").map((call) => call.id),
        [CACHE, ...libraryIds],
    );
    assert.equal(handler.hasUnchangedChanges(), false);
    assert.equal(
        notices.some(([type]) => type === "error"),
        false,
    );
});

test("legacy device edit is saved before disabling its local-control permission", async () => {
    const initial = options().map(({ cloudSettingsState, ...option }) => option);
    initial.find((option) => option.iD === LOCAL_CONTROL).value = true;
    const { handler, calls, notices } = harness(initial);
    handler.changeSetting(VOLUME, 60, true);
    handler.changeSetting(LOCAL_CONTROL, false, true);
    await handler.saveAll();
    assert.deepEqual(
        calls.filter((call) => call.kind === "write").map((call) => call.id),
        [VOLUME, LOCAL_CONTROL],
    );
    assert.equal(handler.getSetting(VOLUME).initialValue, 60);
    assert.equal(handler.hasUnchangedChanges(), false);
    assert.equal(
        notices.some(([type]) => type === "error"),
        false,
    );
});
