import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import test from "node:test";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const compile = (path, mocks = {}) => {
    const exports = {};
    vm.runInNewContext(
        ts.transpileModule(read(path).replaceAll("import.meta", "({ env: {} })"), {
            compilerOptions: {
                target: ts.ScriptTarget.ES2022,
                module: ts.ModuleKind.CommonJS,
                jsx: ts.JsxEmit.ReactJSX,
            },
        }).outputText,
        { exports, require: (name) => mocks[name] || require(name) },
    );
    return exports;
};
const images = compile("src/components/tonies/common/utils/imagePathUtils.ts");
const effects = [];
const Modal = compile("src/components/tonies/common/modals/TonieInformationModal.tsx", {
    react: {
        useState: (value) => [value, () => {}],
        useEffect: (effect) => effects.push(effect),
    },
    "react-i18next": { useTranslation: () => ({ t: (key) => key }) },
    antd: {
        Modal: "modal",
        Typography: { Text: "text" },
        Button: "button",
        Tooltip: "tooltip",
        Flex: "flex",
        theme: { useToken: () => ({ token: {} }) },
    },
    "@ant-design/icons": { DownloadOutlined: "icon", PlayCircleOutlined: "icon" },
    "../../../../api": { TeddyCloudApi: class {} },
    "../../../../types/teddyCloudNotificationTypes": { NotificationTypeEnum: {} },
    "../../../../config/defaultApiConfig": { defaultAPIConfig: () => ({}) },
    "../../../common/modals/ConfirmationModal": { default: "confirmation" },
    "../../../../provider/TeddyCloudProvider": {
        useTeddyCloud: () => ({ addNotification: () => {} }),
    },
    "../../../../provider/AudioProvider": { useAudioContext: () => ({}) },
    "../../../../utils/audio/nativeCollection": {},
    "../utils/cacheDownloadUtils": { cacheDownloadReason: () => "" },
    "../../../../utils/audio/tonieAudio": { usesNativeTonieAudio: () => false },
    "../utils/imagePathUtils": images,
}).default;
const nodes = (node) =>
    Array.isArray(node)
        ? node.flatMap(nodes)
        : node?.props
          ? [node, ...nodes(node.props.children)]
          : [];
const text = (node) =>
    Array.isArray(node)
        ? node.map(text).join("")
        : node?.props
          ? text(node.props.children)
          : typeof node === "string"
            ? node
            : "";

test("Library TAF player info tolerates absent/empty catalog data, closed and open", () => {
    for (const tonieInfo of [undefined, null, {}, { series: "", tracks: [] }]) {
        for (const open of [false, true]) {
            effects.length = 0;
            const record = { name: "Audiobook.taf", tafHeader: { trackSeconds: [0, 61] } };
            if (tonieInfo !== undefined) record.tonieInfo = tonieInfo;
            const tree = Modal({ open, onClose: () => {}, tonieCardOrTAFRecord: record });
            effects.forEach((effect) => effect());
            const modal = nodes(tree).find((node) => node.type === "modal");
            assert.equal(modal.props.open, open);
            assert.equal(text(modal.props.title), record.name);
            assert.equal(
                nodes(tree).find((node) => node.type === "img").props.src,
                "/img_unknown.png",
            );
            assert.deepEqual(record.tafHeader.trackSeconds, [0, 61]);
        }
    }
});

test("existing catalog titles and covers retain priority", () => {
    const tree = Modal({
        open: true,
        onClose: () => {},
        tonieCardOrTAFRecord: {
            name: "Audiobook.taf",
            tonieInfo: { series: "Series", episode: "Episode", picture: "/cover.png", tracks: [] },
        },
    });
    assert.equal(
        text(nodes(tree).find((node) => node.type === "modal").props.title),
        "Series - Episode",
    );
    assert.equal(nodes(tree).find((node) => node.type === "img").props.src, "/cover.png");
});
