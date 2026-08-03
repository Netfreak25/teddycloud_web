export type BoxGeneration = "tb1" | "tb2" | undefined;

const COMMON_TONIEBOX_SETTINGS = new Set([
    "toniebox.api_access",
    "toniebox.overrideCloud",
    "toniebox.boxGeneration",
]);

export const normalizeBoxGeneration = (
    value: boolean | string | number | undefined,
): BoxGeneration => {
    const normalized = String(value ?? "");
    return normalized === "1" ? "tb1" : normalized === "2" ? "tb2" : undefined;
};

/** Keep generation-specific settings out of overlays for the other box generation. */
export const isSettingVisibleForBoxGeneration = (
    optionId: string,
    generation: BoxGeneration,
): boolean => {
    if (optionId === "core.certdir" || optionId.startsWith("core.client_cert.")) {
        return generation === "tb1";
    }
    if (optionId === "core.certdir_tb2") {
        return generation === "tb2";
    }
    if (optionId.startsWith("core.client_cert_tb1.")) {
        return generation === "tb1";
    }
    if (optionId.startsWith("core.client_cert_tb2.")) {
        return generation === "tb2";
    }
    if (optionId.startsWith("core.client_cert_fake.")) {
        return generation === "tb1";
    }
    if (optionId.startsWith("mqtt_client_upstream.forward.")) {
        return generation === "tb2";
    }
    if (optionId.startsWith("toniebox2.")) {
        return generation === "tb2";
    }
    if (optionId.startsWith("toniebox.") && !COMMON_TONIEBOX_SETTINGS.has(optionId)) {
        return generation === "tb1";
    }
    return true;
};
