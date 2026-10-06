const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const file = path.resolve(__dirname, "../src/components/common/form/settingsLayout.ts");
const compiled = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
});
const context = { exports: {}, require: createRequire(file), console };
vm.runInNewContext(compiled.outputText, context, { filename: file });
const layout = context.exports;
const option = "cloud.cacheOtaV3BothSlots";

test("counterpart cache immediately follows TB2 OTA requests in global settings", () => {
    const section = layout.getSettingsSection(option);
    assert.equal(section.id, "tb2.https");
    assert.equal(section.order.indexOf(option), section.order.indexOf("cloud.enableV3Ota") + 1);
    // Effective box cache overrides can differ from the global cache default.
    assert.equal(layout.getSettingDependency(option), undefined);
});

test("production overlay filter excludes only the global counterpart switch", () => {
    assert.equal(layout.isSettingOverlayEligible(option), false);
    assert.equal(layout.isSettingOverlayEligible("cloud.cacheOta"), true);
    assert.equal(layout.isSettingOverlayEligible("cloud.localOta"), true);
});

test("German wording and help describe download without installation", () => {
    const translations = require("../public/translations/de.json");
    const text = translations.settings.optionText.cloud__cacheOtaV3BothSlots;
    assert.equal(text.label, "Andere Firmware-Slot-Variante mitcachen");
    assert.equal(
        text.description,
        "Wenn eine Box ein Firmware-Update anfordert, lädt TeddyCloud zusätzlich die angebotene Firmware für den anderen Slot, sofern sie noch nicht im Cache liegt.",
    );
});
