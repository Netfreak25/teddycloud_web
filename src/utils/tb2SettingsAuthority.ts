export type CloudSettingsState = "local" | "waiting" | "received" | "confirmed";

export type Tb2AuthoritySetting = {
    iD: string;
    value?: boolean | string | number;
    overlayId?: string;
    readOnly?: boolean;
    readOnlyReason?: string;
    cloudSettingsState?: CloudSettingsState;
};

type SettingLookup = (id: string) => Tb2AuthoritySetting | undefined;

const DEVICE_SETTINGS = new Set([
    "toniebox2.max_volume",
    "toniebox2.bedtime_max_volume",
    "toniebox2.max_headphone_volume",
    "toniebox2.bedtime_max_headphone_volume",
    "toniebox2.lightring_brightness",
    "toniebox2.bedtime_lightring_brightness",
    "toniebox2.scrubbing_enabled",
    "toniebox2.slap_enabled",
    "toniebox2.slap_back_left",
    "toniebox2.baby_mode",
]);

export const isTb2DeviceSetting = (id: string): boolean => DEVICE_SETTINGS.has(id);

export const isCloudSettingsAuthoritySetting = (id: string): boolean =>
    id === "mqtt_client_upstream.enabled" ||
    id === "mqtt_client_upstream.filters_enabled" ||
    id.startsWith("mqtt_client_upstream.forward.settings.");

/** Resolve field access from effective draft values without assuming backend support. */
export const getTb2SettingAccess = (
    setting: Tb2AuthoritySetting,
    getSetting: SettingLookup,
): {
    disabled: boolean;
    cloudManaged: boolean;
    cloudSettingsState?: CloudSettingsState;
} => {
    if (
        setting.iD === "toniebox2.cacheToLibraryV3" ||
        setting.iD === "toniebox2.cacheTonieplayToLibraryV3"
    ) {
        // The backend derives these two readOnly flags solely from the cache master.
        // Follow its current draft value instead of retaining the index snapshot.
        const contentCache = getSetting("toniebox2.cacheContentV3");
        return {
            disabled:
                contentCache === undefined
                    ? setting.readOnly === true
                    : contentCache.value !== true,
            cloudManaged: false,
        };
    }

    if (!isTb2DeviceSetting(setting.iD) || setting.overlayId === undefined) {
        return { disabled: setting.readOnly === true, cloudManaged: false };
    }

    const upstreamEnabled = getSetting("mqtt_client_upstream.enabled")?.value === true;
    const state = setting.cloudSettingsState;
    const supportsAuthority =
        state === "local" || state === "waiting" || state === "received" || state === "confirmed";
    if (!supportsAuthority) {
        // Older servers retain their existing local-control permission model.
        return {
            disabled:
                setting.readOnly === true ||
                (upstreamEnabled &&
                    getSetting("mqtt_client_upstream.local_control_enabled")?.value !== true),
            cloudManaged: false,
        };
    }

    const cloudManaged =
        upstreamEnabled &&
        (getSetting("mqtt_client_upstream.filters_enabled")?.value === false ||
            getSetting("mqtt_client_upstream.forward.settings.desired")?.value !== false);
    const staticReadOnly =
        setting.readOnly === true && setting.readOnlyReason !== "tonies_settings";

    return {
        disabled: staticReadOnly || cloudManaged,
        cloudManaged,
        cloudSettingsState: cloudManaged ? (state === "local" ? "waiting" : state) : "local",
    };
};
