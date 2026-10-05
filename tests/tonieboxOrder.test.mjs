import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const source = fs.readFileSync(new URL("../src/utils/tonieboxOrder.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(
    ts.transpileModule(source, {
        compilerOptions: {
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.CommonJS,
        },
    }).outputText,
    { exports, URL, require },
);

const ids = (boxes) => Array.from(boxes, (box) => box.ID);
const list = (values) => Array.from(values);

test("storage namespaces resolve default, absolute and relative API bases consistently", () => {
    const key = exports.getTonieboxOrderStorageKey;
    const origin = "https://cloud.example";
    assert.equal(key("", origin), key(origin, origin));
    assert.equal(key("/", origin), key(`${origin}/`, origin));
    assert.equal(key("/proxy", origin), key(`${origin}/proxy/`, origin));
    assert.equal(key("proxy///", origin), key("/proxy", origin));
    assert.equal(key("https://CLOUD.example:443/proxy/", origin), key("/proxy", origin));
    assert.notEqual(key("", origin), key("", "https://other.example"));
    assert.notEqual(key("/proxy-a", origin), key("/proxy-b", origin));
    assert.notEqual(key("https://cloud.example:444", origin), key("", origin));
});

test("missing, malformed and non-array preferences fall back to API order", () => {
    for (const raw of [null, "", "{broken", "null", "true", "42", '"box"', '{"ID":"box"}']) {
        assert.deepEqual(list(exports.parseTonieboxOrder(raw)), []);
    }
});

test("preferences discard invalid entries and duplicate IDs without rewriting identities", () => {
    const raw = JSON.stringify(["b", "", null, "a", "b", 7, {}, [], " ", "box name", " a "]);
    assert.deepEqual(list(exports.parseTonieboxOrder(raw)), ["b", "a", "box name", " a "]);
});

test("saved known boxes lead and new boxes retain their current API order", () => {
    const boxes = [{ ID: "new-b" }, { ID: "a" }, { ID: "new-a" }, { ID: "b" }];
    assert.deepEqual(ids(exports.orderTonieboxes(boxes, ["b", "gone", "a"])), [
        "b",
        "a",
        "new-b",
        "new-a",
    ]);
    assert.deepEqual(ids(exports.orderTonieboxes(boxes, ["a", "b", "a"])), [
        "a",
        "b",
        "new-b",
        "new-a",
    ]);
});

test("empty and removed-box lists are safe and do not rewrite saved preferences", () => {
    const order = Object.freeze(["gone", "b", "a"]);
    assert.deepEqual(ids(exports.orderTonieboxes([], order)), []);
    assert.deepEqual(ids(exports.orderTonieboxes([{ ID: "a" }], order)), ["a"]);
    assert.deepEqual(ids(exports.orderTonieboxes([{ ID: "b" }, { ID: "a" }], [])), ["b", "a"]);
    assert.deepEqual(order, ["gone", "b", "a"]);
});

test("reordering never mutates API arrays or boxes and always retains latest live objects", () => {
    const order = Object.freeze(["b", "a"]);
    const oldA = Object.freeze({ ID: "a", online: false, certificate: false, name: "Old" });
    const oldB = Object.freeze({ ID: "b", online: false });
    const previous = Object.freeze([oldA, oldB]);
    const previousSorted = exports.orderTonieboxes(previous, order);
    const currentA = Object.freeze({ ID: "a", online: true, certificate: true, name: "New" });
    const currentB = Object.freeze({ ID: "b", online: true });
    const current = Object.freeze([currentA, currentB]);
    const currentSorted = exports.orderTonieboxes(current, order);
    assert.notEqual(previousSorted, previous);
    assert.equal(previousSorted[1], oldA);
    assert.equal(currentSorted[0], currentB);
    assert.equal(currentSorted[1], currentA);
    assert.equal(currentSorted[1].online, true);
    assert.equal(currentSorted[1].certificate, true);
    assert.equal(currentSorted[1].name, "New");
    assert.deepEqual(ids(current), ["a", "b"]);
    assert.deepEqual(order, ["b", "a"]);
});

test("drop moves forward and backward in effective order including new live boxes", () => {
    const boxes = Object.freeze([{ ID: "a" }, { ID: "c" }, { ID: "b" }, { ID: "new" }]);
    const order = Object.freeze(["gone", "b", "a", "c"]);
    const currentIds = Object.freeze(ids(exports.orderTonieboxes(boxes, order)));
    assert.deepEqual(list(exports.moveTonieboxOrder(currentIds, "b", "c")), ["a", "c", "b", "new"]);
    assert.deepEqual(list(exports.moveTonieboxOrder(currentIds, "new", "b")), [
        "new",
        "b",
        "a",
        "c",
    ]);
    assert.deepEqual(ids(boxes), ["a", "c", "b", "new"]);
    assert.deepEqual(order, ["gone", "b", "a", "c"]);
});

test("same-target, stale and empty drops never produce a persistable order", () => {
    const currentIds = ["b", "a"];
    for (const [active, over] of [
        ["a", "a"],
        ["gone", "b"],
        ["a", "gone"],
        ["missing", "b"],
        ["a", ""],
    ]) {
        assert.equal(exports.moveTonieboxOrder(currentIds, active, over), null);
    }
    assert.equal(exports.moveTonieboxOrder([], "a", "b"), null);
});
