import { Collapse, Tabs, Typography } from "antd";
import { useMemo, type FC } from "react";
import { useTranslation } from "react-i18next";
import { SettingsOptionItem } from "./SettingsOptionItem";
import type { BoxGeneration } from "./settingsVisibility";

type CloudGroup = "global" | "tb1" | "tb2";

type Props = {
    optionIds: string[];
    overlayId?: string;
    boxGeneration?: BoxGeneration;
};

const TB1_SETTINGS = new Set([
    "cloud.enabled",
    "cloud.remote_hostname",
    "cloud.remote_port",
    "cloud.enableV1Claim",
    "cloud.enableV1CloudReset",
    "cloud.enableV1FreshnessCheck",
    "cloud.enableV1Log",
    "cloud.enableV1Time",
    "cloud.enableV1Ota",
    "cloud.enableV2Content",
]);

const TB2_SETTINGS = new Set([
    "cloud.tb2_enabled",
    "cloud.tb2_v3_enabled",
    "cloud.tb2_capture_enabled",
    "cloud.remote_hostname_tb2",
    "cloud.remote_port_tb2",
    "cloud.tb2_capture_dir",
    "cloud.tb2_capture_max_mib",
    "cloud.enableV3FreshnessCheck",
    "cloud.enableV3Ota",
    "cloud.enableV3SetupStatus",
    "cloud.enableV3ContentMeta",
    "cloud.enableV3Chapter",
]);

const V3_ENDPOINT_SETTINGS = new Set([
    "cloud.enableV3FreshnessCheck",
    "cloud.enableV3Ota",
    "cloud.enableV3SetupStatus",
    "cloud.enableV3ContentMeta",
    "cloud.enableV3Chapter",
]);

const classifyCloudSetting = (optionId: string): CloudGroup => {
    if (TB1_SETTINGS.has(optionId)) return "tb1";
    if (TB2_SETTINGS.has(optionId)) return "tb2";
    return "global";
};

export const CloudSettingsGroups: FC<Props> = ({ optionIds, overlayId, boxGeneration }) => {
    const { t } = useTranslation();
    const groups = useMemo(() => {
        const result: Record<CloudGroup, string[]> = { global: [], tb1: [], tb2: [] };
        optionIds
            .filter((optionId) => optionId.startsWith("cloud."))
            .forEach((optionId) => result[classifyCloudSetting(optionId)].push(optionId));
        return result;
    }, [optionIds]);

    const renderSetting = (optionId: string) => (
        <SettingsOptionItem
            key={optionId}
            noOverlay={overlayId === undefined}
            iD={optionId}
            overlayId={overlayId}
        />
    );

    const renderTb2Settings = () => {
        const v3Endpoints = groups.tb2.filter((optionId) => V3_ENDPOINT_SETTINGS.has(optionId));
        const settingsBeforeEndpoints = [
            "cloud.tb2_enabled",
            "cloud.tb2_capture_enabled",
            "cloud.tb2_capture_dir",
            "cloud.tb2_capture_max_mib",
            "cloud.tb2_v3_enabled",
        ];
        const settingsAfterEndpoints = ["cloud.remote_hostname_tb2", "cloud.remote_port_tb2"];
        const rendered = new Set([...settingsBeforeEndpoints, ...settingsAfterEndpoints]);
        const remainingSettings = groups.tb2.filter(
            (optionId) => !rendered.has(optionId) && !V3_ENDPOINT_SETTINGS.has(optionId),
        );

        return (
            <>
                {settingsBeforeEndpoints
                    .filter((optionId) => groups.tb2.includes(optionId))
                    .map(renderSetting)}
                {v3Endpoints.length > 0 && (
                    <Collapse
                        size="small"
                        style={{ margin: "8px 0 16px" }}
                        items={[
                            {
                                key: "tb2-v3-endpoints",
                                label: t("settings.cloudGroups.v3Endpoints"),
                                children: v3Endpoints.map(renderSetting),
                            },
                        ]}
                    />
                )}
                {settingsAfterEndpoints
                    .filter((optionId) => groups.tb2.includes(optionId))
                    .map(renderSetting)}
                {remainingSettings.map(renderSetting)}
            </>
        );
    };

    const showAllGenerations = overlayId === undefined;
    const items = [
        {
            key: "global",
            label: t("settings.cloudGroups.global"),
            children: groups.global.map(renderSetting),
        },
        ...(showAllGenerations || boxGeneration === "tb1"
            ? [
                  {
                      key: "tb1",
                      label: "TB1",
                      children: groups.tb1.map(renderSetting),
                  },
              ]
            : []),
        ...(showAllGenerations || boxGeneration === "tb2"
            ? [
                  {
                      key: "tb2",
                      label: "TB2",
                      children: renderTb2Settings(),
                  },
              ]
            : []),
    ].filter((item) => item.children !== undefined);

    return (
        <section style={{ marginBottom: 20 }}>
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
                {t("settings.cloudGroups.title")}
            </Typography.Title>
            <Tabs items={items} />
        </section>
    );
};
