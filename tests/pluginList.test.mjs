import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(
    ts.transpileModule(read("src/components/community/pluginlist/pluginListState.ts"), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText,
    { exports },
);
const ids = (plugins) => Array.from(plugins, (plugin) => plugin.pluginId);
const plugins = [
    { pluginId: "visible", teddyCloudSection: "home" },
    { pluginId: "explicit-visible", teddyCloudSection: "home", hideInNav: false },
    { pluginId: "hidden", teddyCloudSection: "home", hideInNav: true },
    { pluginId: "hidden-other", teddyCloudSection: "settings", hideInNav: true },
    { pluginId: "uncategorized", teddyCloudSection: null, hideInNav: true },
];

test("only true hides a plugin, without removing it from the provider's available plugins", () => {
    const provider = read("src/provider/TeddyCloudProvider.tsx");
    const normalization = provider.match(/hideInNav:\s*([^,\n]+)/)[1];
    for (const value of [undefined, false, true, "false", "true", 1, null]) {
        assert.equal(
            vm.runInNewContext(normalization, { meta: { hideInNav: value } }),
            value === true,
        );
    }
    assert.match(provider, /getPluginMeta[\s\S]*?plugins\.find/);
    assert.equal((provider.match(/hideInNav/g) || []).length, 2);
});

test("all navigation entries honor the flag, including both community menus", () => {
    let filterCount = 0;
    const sections = {
        Home: "home",
        Tonies: "tonies",
        Tonieboxes: "tonieboxes",
        Settings: "settings",
        Community: "community",
    };
    for (const section of Object.keys(sections)) {
        const source = read(`src/components/${section.toLowerCase()}/${section}SubNav.tsx`);
        const predicates = [...source.matchAll(/\.filter\(\(p\) => ([^\n]*hideInNav[^\n]*)\)/g)];
        assert.equal(predicates.length, section === "Community" ? 2 : 1);
        for (const [, expression] of predicates) {
            for (const value of [undefined, false, true]) {
                assert.equal(
                    vm.runInNewContext(expression, {
                        p: { teddyCloudSection: sections[section], hideInNav: value },
                        TeddyCloudSection: sections,
                    }),
                    value !== true,
                );
            }
            filterCount++;
        }
        assert.match(source, /plugin\.standalone/);
        assert.match(source, /target=\{plugin\.standalone \? "_blank" : "_self"\}/);
    }
    assert.equal(filterCount, 6);
});

test("management includes hidden plugins; hidden-only narrows categories and keeps Unknown", () => {
    const filter = (sections, hidden) =>
        ids(exports.filterPluginList(plugins, sections, hidden, "Unknown"));
    assert.deepEqual(filter(["home"], false), ["visible", "explicit-visible", "hidden"]);
    assert.deepEqual(filter(["home"], true), ["hidden"]);
    assert.deepEqual(filter(["Unknown"], true), ["uncategorized"]);
    assert.deepEqual(filter([], false), []);
    assert.deepEqual(filter([], true), []);
    assert.deepEqual(filter(["home", "settings", "Unknown"], false), ids(plugins));
});

test("only supported sizes and a boolean showAll survive stored preferences", () => {
    for (const value of [
        null,
        undefined,
        [],
        {},
        true,
        "bad",
        { pageSize: 0 },
        { pageSize: "12", showAll: "true" },
    ]) {
        assert.deepEqual(JSON.parse(JSON.stringify(exports.normalizePluginListState(value))), {
            pageSize: 12,
            showAll: false,
        });
    }
    for (const size of [6, 12, 24, 48]) {
        assert.equal(exports.normalizePluginListState({ pageSize: size }).pageSize, size);
    }
    assert.equal(exports.normalizePluginListState({ pageSize: 6, showAll: true }).showAll, true);
});

test("pagination clamps after deletion and filtering; show-all preserves order and objects", () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ pluginId: String(i) }));
    assert.deepEqual(ids(exports.paginatePlugins(items, 2, 12, false).items), ["12"]);
    const afterDelete = exports.paginatePlugins(items.slice(0, 12), 2, 12, false);
    assert.equal(afterDelete.currentPage, 1);
    assert.equal(afterDelete.items.length, 12);
    assert.deepEqual(ids(exports.paginatePlugins(items, 2, 6, false).items), [
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
    ]);
    assert.equal(exports.paginatePlugins(items.slice(0, 2), 3, 6, false).currentPage, 1);
    assert.equal(exports.paginatePlugins([], 2, 12, false).currentPage, 1);
    assert.equal(exports.paginatePlugins(items, 2, 12, true).items, items);
});

test("all shipped languages contain the plugin visibility and pagination labels", () => {
    for (const language of ["de", "en", "es", "fr", "tlh"]) {
        const labels = JSON.parse(read(`public/translations/${language}.json`)).community.plugins;
        for (const value of [
            labels.hiddenInNav,
            labels.filter.hidden,
            labels.pagination.showAll,
            labels.pagination.showPages,
            labels.storageUnavailable,
            labels.help.fields.hideInNav,
        ]) {
            assert.equal(typeof value, "string");
            assert.ok(value.length > 0);
        }
        for (const token of ["rangeStart", "rangeEnd", "total"])
            assert.ok(labels.pagination.total.includes(`{{${token}}}`));
    }
});
