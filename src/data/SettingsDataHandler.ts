import { Dispatch, SetStateAction } from "react";
import { t, TFunction } from "i18next";
import { TeddyCloudApi } from "../api/apis/TeddyCloudApi";
import { defaultAPIConfig } from "../config/defaultApiConfig";
import { NotificationTypeEnum } from "../types/teddyCloudNotificationTypes";
import {
    CloudSettingsState,
    getTb2SettingAccess,
    isCloudSettingsAuthoritySetting,
} from "../utils/tb2SettingsAuthority";

export interface Setting {
    description: string;
    iD: string;
    label: string;
    overlayed: boolean | undefined;
    readOnly?: boolean;
    readOnlyReason?: string;
    cloudSettingsState?: CloudSettingsState;
    shortname: string;
    type: string;
    value: boolean | string | number;
    initialValue?: boolean | string | number;
    initialOverlayed?: boolean | undefined;
    overlayId?: string;
}

const api = new TeddyCloudApi(defaultAPIConfig());
const TB2_HTTPS_MODE_SETTINGS = ["cloud.tb2_enabled", "cloud.tb2_v3_enabled"];

export default class SettingsDataHandler {
    private static instance: SettingsDataHandler | undefined = undefined;
    private settings: Setting[] = [];
    private unsavedChanges: boolean = false;
    private saving = false;
    private configWritePending = false;
    private listeners: (() => void)[] = [];
    private idListeners: { iD: string; listener: () => void }[] = [];
    private addNotification!: (
        type: NotificationTypeEnum,
        message: string,
        description: string,
        title: string,
    ) => void;
    private t!: TFunction;
    private setFetchCloudStatus!: Dispatch<SetStateAction<boolean>> | undefined;

    private constructor() {}

    public static initialize(
        addNotification: (
            type: NotificationTypeEnum,
            message: string,
            description: string,
            title: string,
        ) => void,
        t: TFunction,
        setFetchCloudStatus?: Dispatch<SetStateAction<boolean>>,
    ) {
        if (!SettingsDataHandler.instance) {
            SettingsDataHandler.instance = new SettingsDataHandler();
            SettingsDataHandler.instance.addNotification = addNotification;
            SettingsDataHandler.instance.t = t;
            SettingsDataHandler.instance.setFetchCloudStatus = setFetchCloudStatus || undefined;
        }
        return SettingsDataHandler.instance;
    }

    public hasUnchangedChanges() {
        return this.unsavedChanges;
    }

    public static getInstance() {
        if (!SettingsDataHandler.instance) {
            throw new Error("SettingsDataHandler not initialized. Call initialize() first.");
        }
        return SettingsDataHandler.instance;
    }

    //initialize settings from server
    public initializeSettings(data: Setting[], overlayId: string | undefined) {
        data.forEach((setting) => {
            setting.initialValue = setting.value;
            setting.initialOverlayed =
                setting.overlayed !== undefined ? setting.overlayed : undefined;
            setting.overlayId = overlayId;
        });
        this.settings = data;
        this.updateUnsavedChanges();
    }

    public addListener(listener: () => void) {
        if (!this.listeners.find((currentListener) => currentListener === listener)) {
            this.listeners.push(listener);
        }
    }

    removeListener(listener: () => void) {
        this.listeners = this.listeners.filter((currentListener) => currentListener !== listener);
    }

    public addIdListener(listener: () => void, iD: string) {
        if (!this.idListeners.find((element) => element.listener === listener)) {
            this.idListeners.push({ iD, listener });
        }
    }

    removeIdListener(listener: () => void) {
        this.idListeners = this.idListeners.filter((element) => element.listener !== listener);
    }

    private callAllListeners() {
        this.listeners.forEach((listener) => listener());
    }

    private isChanged(setting: Setting) {
        return (
            setting.initialValue !== setting.value || setting.initialOverlayed !== setting.overlayed
        );
    }

    private updateUnsavedChanges() {
        this.unsavedChanges =
            this.configWritePending || this.settings.some((s) => this.isChanged(s));
    }

    /** Refresh server ownership and effective values without discarding edited drafts. */
    public async refreshSettings(view = this.settings) {
        if (view.length === 0) return;
        const response = await api.apiGetIndexGet(view[0].overlayId ?? "");
        if (this.settings !== view) return; // A different box/dialog is now open.
        if (!response.options?.length) throw new Error("Empty settings index");

        for (const option of response.options) {
            const current = view.find((setting) => setting.iD === option.iD);
            if (!current) continue;
            const dirty = this.isChanged(current);
            const value = current.value;
            const overlayed = current.overlayed;
            Object.assign(current, option, {
                initialValue: option.value,
                initialOverlayed: option.overlayed,
                value: dirty ? value : option.value,
                overlayed: dirty ? overlayed : option.overlayed,
            });
        }
        this.updateUnsavedChanges();
        this.callAllListeners();
        this.idListeners.forEach((element) => element.listener());
    }

    public async saveAll() {
        if (this.saving) return;
        this.saving = true;
        const view = this.settings;
        // Freeze the submitted values: edits made while awaiting HTTP stay unsaved.
        const changes = view.filter((setting) => this.isChanged(setting)).map((s) => ({ ...s }));
        const supportsCloudSettings = view.some(
            (setting) => setting.cloudSettingsState !== undefined,
        );
        const errors: unknown[] = [];
        const save = async (setting: Setting) => {
            await this.saveSingleSetting(setting);
            this.configWritePending = true;
            const current = view.find((item) => item.iD === setting.iD);
            if (current) {
                current.initialValue = setting.value;
                current.initialOverlayed = setting.overlayed;
            }
        };

        try {
            const authorityChanges = changes.filter((s) => isCloudSettingsAuthoritySetting(s.iD));
            for (const setting of authorityChanges) await save(setting);
            if (supportsCloudSettings && authorityChanges.length > 0) {
                await this.refreshSettings(view);
            }

            const localControl = changes.find(
                (s) => s.iD === "mqtt_client_upstream.local_control_enabled",
            );
            const httpsMode = changes.find(
                (s) => TB2_HTTPS_MODE_SETTINGS.includes(s.iD) && s.value === true,
            );
            if (localControl?.value === true) await save(localControl);
            if (httpsMode) await save(httpsMode);

            for (const setting of changes) {
                if (
                    isCloudSettingsAuthoritySetting(setting.iD) ||
                    setting === localControl ||
                    setting === httpsMode
                )
                    continue;
                const current = view.find((item) => item.iD === setting.iD)!;
                const access = getTb2SettingAccess(current, (id) => {
                    const effective = view.find((s) => s.iD === id);
                    // Authorize against writes already accepted by the server, not
                    // unsent drafts (local-control disable is deliberately last).
                    return effective
                        ? { ...effective, value: effective.initialValue ?? effective.value }
                        : undefined;
                });
                if (access.disabled) {
                    errors.push(
                        new Error(`${setting.label}: ${t("settings.cloudAuthority.locked")}`),
                    );
                    continue;
                }
                await save(setting);
            }
            if (localControl?.value === false) await save(localControl);
        } catch (error) {
            errors.push(error);
        } finally {
            // Persist successful preceding writes even if a later field was rejected.
            if (this.configWritePending) {
                try {
                    await api.apiTriggerWriteConfigGet();
                    this.configWritePending = false;
                } catch (error) {
                    errors.push(error);
                }
            }
            if (supportsCloudSettings) {
                try {
                    await this.refreshSettings(view);
                } catch (error) {
                    errors.push(error);
                }
            }
            this.saving = false;
            this.updateUnsavedChanges();
            this.callAllListeners();
        }
        if (errors.length > 0) {
            this.addNotification(
                NotificationTypeEnum.Error,
                t("settings.errorWhileSavingConfig"),
                t("settings.errorWhileSavingConfigDetails") + errors.map(String).join("; "),
                t("settings.navigationTitle"),
            );
        }
    }

    private async saveSingleSetting(setting: Setting) {
        const reset = setting.overlayId !== undefined && setting.overlayed === false;
        // Let HTTP errors reach saveAll; a rejected field must not be marked saved.
        await api.apiPostTeddyCloudSetting(setting.iD, setting.value, setting.overlayId, reset);
        this.addNotification(
            NotificationTypeEnum.Success,
            t("settings.saved"),
            t(reset ? "settings.resetToTCDetails" : "settings.saveDetails", {
                setting: setting.label,
                overlay: setting.overlayId !== undefined ? ` [${setting.overlayId}]` : "",
            }),
            setting.overlayId === undefined
                ? t("settings.navigationTitle")
                : t("tonieboxes.navigationTitle"),
        );
        const cloudStatusSettings = [
            "cloud.enabled",
            "cloud.tb2_enabled",
            "cloud.tb2_v3_enabled",
            "cloud.remote_hostname_tb2",
            "cloud.remote_port_tb2",
            "mqtt_client_upstream.enabled",
            "mqtt_client_upstream.local_control_enabled",
            "mqtt_client_upstream.hostname",
            "mqtt_client_upstream.port",
        ];
        if (cloudStatusSettings.includes(setting.iD) && this.setFetchCloudStatus) {
            this.setFetchCloudStatus((prev) => !prev);
        }
    }

    public resetAll() {
        this.settings.forEach((setting) => {
            setting.value = setting.initialValue ?? "";
            setting.overlayed =
                setting.initialOverlayed !== undefined ? setting.initialOverlayed : undefined;
        });

        this.updateUnsavedChanges();
        this.callAllListeners();
        this.idListeners.forEach((element) => element.listener());
    }

    public getSetting(iD: string) {
        return this.settings.find((setting) => setting.iD === iD);
    }

    public changeSetting(
        iD: string,
        newValue: boolean | string | number,
        overlayed: boolean | undefined,
    ) {
        const settingToChange = this.settings.find((setting) => setting.iD === iD);
        if (settingToChange) {
            if (typeof settingToChange.initialValue === typeof newValue) {
                settingToChange.value = newValue;
                if (TB2_HTTPS_MODE_SETTINGS.includes(iD) && newValue === true) {
                    const otherMode = this.settings.find(
                        (setting) =>
                            TB2_HTTPS_MODE_SETTINGS.includes(setting.iD) && setting.iD !== iD,
                    );
                    if (otherMode) {
                        otherMode.value = false;
                        if (settingToChange.overlayId !== undefined) {
                            otherMode.overlayed = true;
                        }
                    }
                }
                this.updateUnsavedChanges();
                this.idListeners
                    .filter((element) => element.iD === iD)
                    .forEach((element) => {
                        element.listener();
                    });
                this.callAllListeners();
            } else {
                console.warn(
                    "The type of newValue and initialValue for '" +
                        iD +
                        "' do not match! Omitting.",
                );
            }
        } else {
            console.warn("Unknown setting '" + iD + "' to be changed. Omitting.");
        }
    }

    public changeSettingOverlayed(iD: string, newOverlayed: boolean) {
        const settingToChange = this.settings.find((setting) => setting.iD === iD);
        if (settingToChange) {
            settingToChange.overlayed = newOverlayed;
            if (newOverlayed === false) {
                const fetchFieldValue = () => {
                    try {
                        api.apiGetTeddyCloudSettingRaw(iD)
                            .then((response) => response.text())
                            .then((fieldValue) => {
                                // A delayed global read must not replace a newly enabled
                                // override or data from another box/dialog.
                                if (
                                    this.getSetting(iD) !== settingToChange ||
                                    settingToChange.overlayed !== false
                                ) {
                                    return;
                                }
                                let typedFieldValue: boolean | number | string;

                                if (settingToChange.type === "bool") {
                                    typedFieldValue = fieldValue === "true";
                                } else if (settingToChange.type === "uint") {
                                    typedFieldValue = parseInt(fieldValue, 10);
                                    if (isNaN(typedFieldValue)) {
                                        console.warn(
                                            `Expected a number for setting type "uint", but got "${fieldValue}". Defaulting to 0.`,
                                        );
                                        typedFieldValue = 0;
                                    }
                                } else {
                                    typedFieldValue = fieldValue;
                                }

                                this.changeSetting(iD, typedFieldValue, newOverlayed);
                            })
                            .catch((error) => {
                                this.addNotification(
                                    NotificationTypeEnum.Error,
                                    t("settings.errorFetchingFieldValue"),
                                    t("settings.errorFetchingFieldValueDetails", {
                                        setting: settingToChange.label,
                                        overlay:
                                            settingToChange.overlayId !== undefined
                                                ? ` [${settingToChange.overlayId}]`
                                                : "",
                                    }) + error,
                                    settingToChange.overlayId === undefined
                                        ? t("settings.navigationTitle")
                                        : t("tonieboxes.navigationTitle"),
                                );
                            });
                    } catch (error) {
                        this.addNotification(
                            NotificationTypeEnum.Error,
                            t("settings.errorFetchingFieldValue"),
                            t("setting.errorFetchingFieldValueDetails", {
                                setting: settingToChange.label,
                                overlay:
                                    settingToChange.overlayId !== undefined
                                        ? ` [${settingToChange.overlayId}]`
                                        : "",
                            }) + error,
                            settingToChange.overlayId === undefined
                                ? t("settings.navigationTitle")
                                : t("tonieboxes.navigationTitle"),
                        );
                    }
                };

                fetchFieldValue();
            }

            this.updateUnsavedChanges();
            this.idListeners
                .filter((element) => element.iD === iD)
                .forEach((element) => {
                    element.listener();
                });
            this.callAllListeners();
        } else {
            console.warn("Unknown setting '" + iD + "' to be changed. Omitting.");
        }
    }
}
