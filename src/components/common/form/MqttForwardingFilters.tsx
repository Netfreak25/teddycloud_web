import { Badge, Collapse, Input, Segmented, Space, Switch, Tooltip, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsDataHandler, { Setting } from "../../../data/SettingsDataHandler";

const FILTER_PREFIX = "mqtt_client_upstream.forward.";

type FilterGroup = {
    key: string;
    label: string;
    matches: (id: string) => boolean;
    searchable?: boolean;
};

const groups: FilterGroup[] = [
    {
        key: "logs",
        label: "Logs",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}logs.`),
        searchable: true,
    },
    {
        key: "metrics",
        label: "Metrics",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}metrics.`),
    },
    {
        key: "app-reply",
        label: "App Reply",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}app_reply.`),
    },
    {
        key: "settings",
        label: "Settings",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}settings.`),
    },
    {
        key: "playback",
        label: "Playback",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}playback.`),
    },
    {
        key: "app-control",
        label: "App Control",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}app_control.`),
    },
];

type Props = {
    optionIds: string[];
    overlayId?: string;
};

export const MqttForwardingFilters: React.FC<Props> = ({ optionIds, overlayId }) => {
    const { t } = useTranslation();
    const [, setRevision] = useState(0);
    const [logSearch, setLogSearch] = useState("");
    const handler = SettingsDataHandler.getInstance();

    useEffect(() => {
        const listener = () => setRevision((revision) => revision + 1);
        handler.addListener(listener);
        return () => handler.removeListener(listener);
    }, [handler]);

    const settings = useMemo(
        () =>
            optionIds
                .filter((id) => id.startsWith(FILTER_PREFIX))
                .map((id) => handler.getSetting(id))
                .filter(
                    (setting): setting is Setting =>
                        setting !== undefined && setting.type === "bool",
                ),
        [handler, optionIds],
    );

    const groupedIds = new Set(
        groups.flatMap((group) =>
            settings.filter((setting) => group.matches(setting.iD)).map((setting) => setting.iD),
        ),
    );
    const singleSettings = settings.filter((setting) => !groupedIds.has(setting.iD));
    const suppressedCount = settings.filter((setting) => setting.value !== true).length;

    const changeGlobal = (setting: Setting, forward: boolean) => {
        handler.changeSetting(setting.iD, forward, undefined);
        setRevision((revision) => revision + 1);
    };

    const changeOverlay = (setting: Setting, mode: string | number) => {
        if (mode === "global") {
            handler.changeSettingOverlayed(setting.iD, false);
        } else {
            if (!setting.overlayed) handler.changeSettingOverlayed(setting.iD, true);
            handler.changeSetting(setting.iD, mode === "forward", true);
        }
        setRevision((revision) => revision + 1);
    };

    const renderSetting = (setting: Setting) => (
        <div
            key={setting.iD}
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                minHeight: 32,
            }}
        >
            <Tooltip title={setting.description}>
                <Typography.Text style={{ overflowWrap: "anywhere" }}>
                    {setting.label}
                </Typography.Text>
            </Tooltip>
            {overlayId === undefined ? (
                <Switch
                    checked={setting.value === true}
                    onChange={(value) => changeGlobal(setting, value)}
                />
            ) : (
                <Segmented
                    size="small"
                    value={
                        !setting.overlayed
                            ? "global"
                            : setting.value === true
                              ? "forward"
                              : "suppress"
                    }
                    options={[
                        { label: t("settings.mqttForwarding.global"), value: "global" },
                        { label: t("settings.mqttForwarding.forward"), value: "forward" },
                        { label: t("settings.mqttForwarding.suppress"), value: "suppress" },
                    ]}
                    onChange={(value) => changeOverlay(setting, value)}
                />
            )}
        </div>
    );

    const collapseItems = groups.map((group) => {
        let groupSettings = settings.filter((setting) => group.matches(setting.iD));
        if (group.searchable && logSearch.trim() !== "") {
            const search = logSearch.trim().toLocaleLowerCase();
            groupSettings = groupSettings.filter((setting) =>
                setting.label.toLocaleLowerCase().includes(search),
            );
        }
        const groupSuppressed = settings.filter(
            (setting) => group.matches(setting.iD) && setting.value !== true,
        ).length;
        return {
            key: group.key,
            label: (
                <Space>
                    <span>{group.label}</span>
                    {groupSuppressed > 0 && <Badge count={groupSuppressed} />}
                </Space>
            ),
            children: (
                <Space direction="vertical" size={12} style={{ width: "100%" }}>
                    {group.searchable && (
                        <Input.Search
                            allowClear
                            value={logSearch}
                            placeholder={t("settings.mqttForwarding.searchSources")}
                            onChange={(event) => setLogSearch(event.target.value)}
                        />
                    )}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                            gap: "8px 20px",
                        }}
                    >
                        {groupSettings.map(renderSetting)}
                    </div>
                </Space>
            ),
        };
    });

    return (
        <div style={{ margin: "12px 0 20px" }}>
            <Collapse
                items={[
                    {
                        key: "mqtt-forwarding-filters",
                        label: (
                            <Space>
                                <span>{t("settings.mqttForwarding.title")}</span>
                                {suppressedCount > 0 && <Badge count={suppressedCount} />}
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                <Typography.Text type="secondary">
                                    {t("settings.mqttForwarding.description")}
                                </Typography.Text>
                                <div
                                    style={{
                                        display: "grid",
                                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                                        gap: "8px 20px",
                                    }}
                                >
                                    {singleSettings.map(renderSetting)}
                                </div>
                                <Collapse size="small" items={collapseItems} />
                            </Space>
                        ),
                    },
                ]}
            />
        </div>
    );
};
