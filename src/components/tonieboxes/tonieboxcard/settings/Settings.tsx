import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Divider, Form, Radio, theme } from "antd";
import { Formik } from "formik";

import { OptionsList, TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";

import LoadingSpinner from "../../../common/elements/LoadingSpinner";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { useTeddyCloud } from "../../../../provider/TeddyCloudProvider";
import { SettingsScopeTabs } from "../../../common/form/SettingsScopeTabs";
import { normalizeBoxGeneration } from "../../../common/form/settingsLayout";
import SettingsButton from "../../../common/buttons/SettingsButtons";
import SettingsDataHandler from "../../../../data/SettingsDataHandler";
import { useTriggerWriteConfig } from "../hooks/useTriggerWriteConfig";

const api = new TeddyCloudApi(defaultAPIConfig());

const { useToken } = theme;

export const Settings: React.FC<{ overlay: string; onClose?: () => void }> = ({
    overlay,
    onClose,
}) => {
    const { t } = useTranslation();
    const { token } = useToken();
    const { addNotification } = useTeddyCloud();
    const triggerWriteConfig = useTriggerWriteConfig();

    const [options, setOptions] = useState<OptionsList | undefined>();
    const [settingsLevel, setSettingsLevel] = useState("");
    const [loading, setLoading] = useState(true);
    const [showArrow, setShowArrow] = useState(true);
    const [reloadCount, setReloadCount] = useState(0); // eslint-disable-line @typescript-eslint/no-unused-vars

    SettingsDataHandler.initialize(addNotification, t);

    useEffect(() => {
        const listener = () => setReloadCount((prev) => prev + 1);
        const settingsHandler = SettingsDataHandler.getInstance();
        settingsHandler.addListener(listener);

        return () => {
            settingsHandler.removeListener(listener);
        };
    }, []);

    useEffect(() => {
        const fetchSettingsLevel = async () => {
            try {
                const response = await api.apiGetTeddyCloudSettingRaw("core.settings_level");

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                setSettingsLevel(data.toString());
            } catch (error) {
                console.error("Error fetching settings level: ", error);
            }
        };

        fetchSettingsLevel();
    }, []);

    useEffect(() => {
        if (!settingsLevel) return;

        const fetchOptions = async () => {
            setLoading(true);
            const optionsRequest = (await api.apiGetIndexGet(overlay)) as OptionsList;
            if (optionsRequest?.options?.length && optionsRequest?.options?.length > 0) {
                setOptions(optionsRequest);
                SettingsDataHandler.getInstance().initializeSettings(
                    optionsRequest.options,
                    overlay,
                );
            }
            setLoading(false);
        };

        settingsLevel ? fetchOptions() : "";
    }, [settingsLevel, overlay]);

    useEffect(() => {
        if (loading) return;
        const modalContentElement = document.querySelector(
            ".ant-modal-wrap.overlay-" + overlay.toUpperCase(),
        ) as HTMLElement | null;

        if (modalContentElement) {
            const updateFooterHeightAndScrollState = () => {
                setShowArrow(
                    modalContentElement.scrollTop + modalContentElement.clientHeight <
                        modalContentElement.scrollHeight - 20,
                );
            };
            modalContentElement.addEventListener("scroll", updateFooterHeightAndScrollState);
            modalContentElement.addEventListener("resize", updateFooterHeightAndScrollState);
            return () => {
                modalContentElement.removeEventListener("scroll", updateFooterHeightAndScrollState);
                window.removeEventListener("resize", updateFooterHeightAndScrollState);
            };
        }
    }, [loading, overlay]);

    const handleChange = async (value: any) => {
        try {
            await api.apiPostTeddyCloudSetting("core.settings_level", value);
            triggerWriteConfig();
            setSettingsLevel(value);
        } catch (error) {
            addNotification(
                NotificationTypeEnum.Error,
                t("settings.errorSettingSettingsLevel"),
                t("settings.errorSettingSettingsLevelDetails") + error,
                t("tonieboxes.navigationTitle"),
            );
        }
    };

    const { colorBgElevated, colorTextDescription } = token;
    const boxGeneration = normalizeBoxGeneration(
        options?.options?.find((option) => option.iD === "toniebox.boxGeneration")?.value,
    );
    const optionIds = (options?.options ?? []).map((option) => option.iD);

    const savePanel = (
        <div
            style={{
                position: "sticky",
                bottom: 0,
                padding: "16px 0",
                marginBottom: 8,
                backgroundColor: colorBgElevated,
                zIndex: 501,
            }}
            id="save-panel"
            className="sticky-save-panel"
        >
            <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap" }}>
                <div style={{ padding: 8, fontSize: "smaller", color: colorTextDescription }}>
                    {showArrow && t("settings.keepScrolling")}
                </div>
                <SettingsButton onClose={onClose}></SettingsButton>
            </div>
        </div>
    );

    return (
        <>
            <Alert
                title={t("settings.warning")}
                description={<div>{t("settings.warningHint")}</div>}
                type="info"
                showIcon
                style={{ margin: "8px" }}
            />

            <Divider>{t("settings.title")}</Divider>
            {loading ? (
                <LoadingSpinner />
            ) : (
                <>
                    <Formik
                        initialValues={{
                            test: "test",
                        }}
                        onSubmit={() => {
                            // no-op, alles per onChange
                        }}
                    >
                        <Form labelCol={{ span: 8 }} wrapperCol={{ span: 14 }} layout="horizontal">
                            <SettingsScopeTabs
                                optionIds={optionIds}
                                overlayId={overlay}
                                boxGeneration={boxGeneration}
                            />
                        </Form>
                    </Formik>
                    <Divider>{t("settings.levelLabel")}</Divider>
                    <Radio.Group
                        value={settingsLevel}
                        onChange={(e) => handleChange(e.target.value)}
                        style={{ display: "flex", justifyContent: "center", marginTop: 8 }}
                        disabled={
                            loading || SettingsDataHandler.getInstance().hasUnchangedChanges()
                        }
                    >
                        <Radio.Button value="1">Basic</Radio.Button>
                        <Radio.Button value="2">Detail</Radio.Button>
                        <Radio.Button value="3">Expert</Radio.Button>
                    </Radio.Group>
                    {savePanel}
                </>
            )}
        </>
    );
};
