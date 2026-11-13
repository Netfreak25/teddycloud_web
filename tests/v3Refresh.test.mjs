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
    vm.runInNewContext(
        ts.transpileModule(read(path).replaceAll("import.meta", "({ env: {} })"), {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
        }).outputText,
        { exports, require: (name) => mocks[name] || require(name), ...globals },
    );
    return exports;
};
const cacheUtils = compile("src/components/tonies/common/utils/cacheDownloadUtils.ts");
const target = (overlay, state = "queued", accepted = true) => ({
    overlay,
    boxName: overlay,
    state,
    accepted,
});

test("typed refresh API sends V3 and overlay separately and retains rejected targets", async () => {
    const calls = [];
    let status = 202;
    let body = { ok: true, targets: [target("box & one")] };
    class ResponseError extends Error {
        constructor(response) {
            super("HTTP error");
            this.response = response;
        }
    }
    const { TeddyCloudApi } = compile("src/api/apis/TeddyCloudApi.ts", {
        "../models": {},
        "../runtime": {
            ResponseError,
            BaseAPI: class {
                async request(context) {
                    calls.push(context);
                    const response = {
                        status,
                        json: async () => {
                            if (body instanceof SyntaxError) throw body;
                            return body;
                        },
                    };
                    if (status >= 400) throw new ResponseError(response);
                    return response;
                }
            },
        },
    });
    const api = new TeddyCloudApi();
    assert.equal((await api.apiRefreshV3Content("a/b", "box & one")).targets.length, 1);
    assert.equal(calls[0].path, "/api/content/cache/a%2Fb");
    assert.equal(calls[0].method, "POST");
    assert.equal(calls[0].query.refresh, "v3");
    assert.equal(calls[0].query.overlay, "box & one");
    status = 409;
    body = { ok: false, targets: [{ ...target("blocked", "rejected", false), reason: "nocloud" }] };
    assert.equal((await api.apiRefreshV3Content("ruid", "")).targets[0].reason, "nocloud");
    assert.equal("overlay" in calls[1].query, false);
    body = { error: "invalid_refresh" };
    await assert.rejects(api.apiRefreshV3Content("ruid", ""), /invalid_refresh/);
    body = new SyntaxError("invalid JSON");
    await assert.rejects(api.apiRefreshV3Content("ruid", ""), /Invalid V3 refresh response.*409/);
});

// Exercise the production hook with deterministic React effects and interval ticks.
const createHook = (api, overrides = {}) => {
    const slots = [];
    const timers = new Map();
    let cursor = 0;
    let nextTimer = 0;
    let effects = [];
    let cardRefreshes = 0;
    const props = {
        tonieCard: { ruid: "ruid", cacheState: {} },
        overlay: "group",
        modelTitle: "Tonie",
        t: (key) => key,
        addNotification: () => {},
        addLoadingNotification: () => {},
        closeLoadingNotification: () => {},
        fetchUpdatedTonieCard: async () => cardRefreshes++,
        editorOpen: true,
        refreshDisabled: false,
        ...overrides,
    };
    const { useTonieCardActions } = compile(
        "src/components/tonies/toniecard/hooks/useTonieCardActions.ts",
        {
            react: {
                useState: (initial) => {
                    const index = cursor++;
                    slots[index] ??= { value: initial };
                    return [
                        slots[index].value,
                        (value) => {
                            slots[index].value =
                                typeof value === "function" ? value(slots[index].value) : value;
                        },
                    ];
                },
                useRef: (initial) => {
                    const index = cursor++;
                    return (slots[index] ??= { current: initial });
                },
                useEffect: (effect, deps) => {
                    const index = cursor++;
                    const previous = slots[index];
                    if (previous && deps.every((value, i) => Object.is(value, previous.deps[i])))
                        return;
                    effects.push(() => {
                        previous?.cleanup?.();
                        slots[index] = { deps, cleanup: effect() };
                    });
                },
            },
            "../../../../config/defaultApiConfig": { defaultAPIConfig: () => ({}) },
            "../../../../api": {
                TeddyCloudApi: class {
                    constructor() {
                        return api;
                    }
                },
            },
            "../../../../types/teddyCloudNotificationTypes": { NotificationTypeEnum: {} },
            "../../common/utils/cacheDownloadUtils": cacheUtils,
        },
        {
            window: {
                setInterval: (callback) => {
                    timers.set(++nextTimer, callback);
                    return nextTimer;
                },
                clearInterval: (id) => timers.delete(id),
            },
        },
    );
    return {
        props,
        render() {
            cursor = 0;
            effects = [];
            const state = useTonieCardActions(props);
            effects.forEach((effect) => effect());
            return state;
        },
        async tick() {
            for (const callback of [...timers.values()]) await callback();
        },
        get timerCount() {
            return timers.size;
        },
        get cardRefreshes() {
            return cardRefreshes;
        },
    };
};

test("group polling only observes accepted active targets while editor is open", async () => {
    const queries = [];
    const hook = createHook({
        apiRefreshV3Content: async () => ({
            ok: true,
            targets: [target("accepted"), target("blocked", "rejected", false)],
        }),
        apiGetTagInfo: async (ruid, overlay) => {
            queries.push([ruid, overlay]);
            return { cacheState: { download: { v3: { state: "complete", reason: "unchanged" } } } };
        },
    });
    hook.render();
    await hook.render().handleV3Refresh();
    hook.props.editorOpen = false;
    hook.render();
    assert.equal(hook.timerCount, 0);
    hook.props.editorOpen = true;
    hook.render();
    assert.equal(hook.timerCount, 1);
    await hook.tick();
    const result = hook.render();
    assert.deepEqual(queries, [["ruid", "accepted"]]);
    assert.equal(result.refreshTargets[0].reason, "unchanged");
    assert.equal(result.refreshTargets[1].state, "rejected");
    assert.equal(result.refreshPending, false);
    assert.equal(hook.timerCount, 0);
    assert.equal(hook.cardRefreshes, 1);
});

test("unsaved source/preferences and pending requests prevent another submission", async () => {
    let calls = 0;
    let finish;
    const hook = createHook(
        {
            apiRefreshV3Content: () => {
                calls++;
                return new Promise((resolve) => {
                    finish = resolve;
                });
            },
        },
        { refreshDisabled: true },
    );
    hook.render();
    await hook.render().handleV3Refresh();
    assert.equal(calls, 0);
    hook.props.refreshDisabled = false;
    const state = hook.render();
    const request = state.handleV3Refresh();
    await state.handleV3Refresh();
    assert.equal(calls, 1);
    hook.props.overlay = "different-group";
    hook.render();
    finish({ ok: true, targets: [target("old-box")] });
    await request;
    assert.equal(hook.render().refreshTargets.length, 0);
});

test("rejected group does not suppress ordinary download status polling", async () => {
    const hook = createHook({
        apiRefreshV3Content: async () => ({
            ok: false,
            targets: [target("blocked", "rejected", false)],
        }),
    });
    hook.render();
    await hook.render().handleV3Refresh();
    hook.render();
    hook.props.tonieCard = {
        ruid: "ruid",
        cacheState: { download: { v3: { state: "running" } } },
    };
    hook.render();
    assert.equal(hook.timerCount, 1);
    await hook.tick();
    assert.equal(hook.cardRefreshes, 1);
});

test("lost server job status ends polling without claiming a completed download", async () => {
    const hook = createHook({
        apiRefreshV3Content: async () => ({ ok: true, targets: [target("accepted")] }),
        apiGetTagInfo: async () => ({ cacheState: {} }),
    });
    hook.render();
    await hook.render().handleV3Refresh();
    hook.render();
    await hook.tick();
    const state = hook.render();
    assert.equal(state.refreshPending, false);
    assert.equal(state.refreshTargets[0].reason, "refresh_status_unavailable");
    assert.notEqual(state.refreshTargets[0].state, "complete");
    assert.equal(hook.timerCount, 0);
});

test("refresh labels and terminal outcomes exist in all five languages", () => {
    for (const language of ["de", "en", "fr", "es", "tlh"]) {
        const labels = JSON.parse(read(`public/translations/${language}.json`)).tonies
            .cacheDownload;
        for (const key of [
            "refreshV3",
            "refreshGroupHint",
            "refreshSaveFirst",
            "refreshBusy",
            "rejected",
        ])
            assert.ok(labels[key]);
        for (const key of [
            "unchanged",
            "updated",
            "downloaded",
            "no_tb2_in_group",
            "download_busy",
            "target_changed",
        ])
            assert.ok(labels.reasons[key]);
    }
});
