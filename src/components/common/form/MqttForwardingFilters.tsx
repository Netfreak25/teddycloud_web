import { ArrowRightOutlined, CheckOutlined, GlobalOutlined, StopOutlined } from "@ant-design/icons";
import {
    Button,
    Collapse,
    Drawer,
    Dropdown,
    Empty,
    Grid,
    Input,
    Space,
    Tooltip,
    Typography,
    theme,
} from "antd";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsDataHandler, { Setting } from "../../../data/SettingsDataHandler";

const FILTER_PREFIX = "mqtt_client_upstream.forward.";

type FilterGroup = {
    key: string;
    labelKey: string;
    matches: (id: string) => boolean;
};

type DisplayFilter = "all" | "overrides" | "suppressed";
type ForwardingMode = "global" | "forward" | "suppress";

const groups: FilterGroup[] = [
    {
        key: "logs",
        labelKey: "settings.mqttForwarding.groups.logs",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}logs.`),
    },
    {
        key: "metrics",
        labelKey: "settings.mqttForwarding.groups.metrics",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}metrics.`),
    },
    {
        key: "app-reply",
        labelKey: "settings.mqttForwarding.groups.appReply",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}app_reply.`),
    },
    {
        key: "settings",
        labelKey: "settings.mqttForwarding.groups.settings",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}settings.`),
    },
    {
        key: "playback",
        labelKey: "settings.mqttForwarding.groups.playback",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}playback.`),
    },
    {
        key: "app-control",
        labelKey: "settings.mqttForwarding.groups.appControl",
        matches: (id) => id.startsWith(`${FILTER_PREFIX}app_control.`),
    },
];

type Props = {
    optionIds: string[];
    overlayId?: string;
};

export const MqttForwardingFilters: React.FC<Props> = ({ optionIds, overlayId }) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [, setRevision] = useState(0);
    const [search, setSearch] = useState("");
    const [displayFilter, setDisplayFilter] = useState<DisplayFilter>("all");
    const [expandedGroups, setExpandedGroups] = useState<string[]>(["direct"]);
    const [mobileSettingId, setMobileSettingId] = useState<string>();
    const handler = SettingsDataHandler.getInstance();
    const screens = Grid.useBreakpoint();
    const isMobile = screens.md === false;

    useEffect(() => {
        const listener = () => setRevision((revision) => revision + 1);
        handler.addListener(listener);
        return () => handler.removeListener(listener);
    }, [handler]);

    useEffect(() => {
        if (overlayId === undefined && displayFilter === "overrides") {
            setDisplayFilter("all");
        }
    }, [displayFilter, overlayId]);

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

    const getSettingText = (setting: Setting) => {
        const translationId = setting.iD.replaceAll(".", "__");
        return {
            label: t(`settings.optionText.${translationId}.label`, {
                defaultValue: setting.label,
            }),
            description: t(`settings.optionText.${translationId}.description`, {
                defaultValue: setting.description,
            }),
        };
    };

    const groupedIds = new Set(
        groups.flatMap((group) =>
            settings.filter((setting) => group.matches(setting.iD)).map((setting) => setting.iD),
        ),
    );
    const directSettings = settings.filter((setting) => !groupedIds.has(setting.iD));
    const allGroups = [
        {
            key: "direct",
            labelKey: "settings.mqttForwarding.groups.direct",
            settings: directSettings,
        },
        ...groups.map((group) => ({
            key: group.key,
            labelKey: group.labelKey,
            settings: settings.filter((setting) => group.matches(setting.iD)),
        })),
    ];

    const normalizedSearch = search.trim().toLocaleLowerCase();
    const matchesDisplayFilter = (setting: Setting) => {
        if (displayFilter === "suppressed") return setting.value !== true;
        if (displayFilter === "overrides") return setting.overlayed === true;
        return true;
    };
    const matchesSearch = (setting: Setting) => {
        if (normalizedSearch === "") return true;
        const { label } = getSettingText(setting);
        return `${label} ${setting.iD}`.toLocaleLowerCase().includes(normalizedSearch);
    };

    const visibleGroups = allGroups
        .map((group) => ({
            ...group,
            visibleSettings: group.settings.filter(
                (setting) => matchesDisplayFilter(setting) && matchesSearch(setting),
            ),
        }))
        .filter((group) => group.visibleSettings.length > 0);
    const filtersActive = normalizedSearch !== "" || displayFilter !== "all";
    const activeGroupKeys = filtersActive
        ? visibleGroups.map((group) => group.key)
        : expandedGroups;
    const suppressedCount = settings.filter((setting) => setting.value !== true).length;
    const mobileSetting = mobileSettingId ? handler.getSetting(mobileSettingId) : undefined;

    const changeGlobal = (setting: Setting, forward: boolean) => {
        handler.changeSetting(setting.iD, forward, undefined);
        setRevision((revision) => revision + 1);
    };

    const changeOverlay = (setting: Setting, mode: ForwardingMode) => {
        if (mode === "global") {
            handler.changeSettingOverlayed(setting.iD, false);
        } else {
            if (!setting.overlayed) handler.changeSettingOverlayed(setting.iD, true);
            handler.changeSetting(setting.iD, mode === "forward", true);
        }
        setRevision((revision) => revision + 1);
    };

    const changeMode = (setting: Setting, mode: ForwardingMode) => {
        if (overlayId === undefined) {
            changeGlobal(setting, mode === "forward");
        } else {
            changeOverlay(setting, mode);
        }
        setMobileSettingId(undefined);
    };

    const getMode = (setting: Setting): ForwardingMode => {
        if (overlayId !== undefined && !setting.overlayed) return "global";
        return setting.value === true ? "forward" : "suppress";
    };

    const getModeText = (setting: Setting, mode: ForwardingMode) => {
        const effectiveState = t(
            setting.value === true
                ? "settings.mqttForwarding.forward"
                : "settings.mqttForwarding.suppressed",
        );
        if (mode === "global") {
            return t("settings.mqttForwarding.inheritedStatus", { state: effectiveState });
        }
        return mode === "forward"
            ? t("settings.mqttForwarding.forward")
            : t("settings.mqttForwarding.suppressed");
    };

    const getModeIcon = (mode: ForwardingMode) => {
        if (mode === "global") return <GlobalOutlined />;
        if (mode === "forward") return <ArrowRightOutlined />;
        return <StopOutlined />;
    };

    const getModeStyle = (mode: ForwardingMode): CSSProperties => {
        if (mode === "forward") {
            return {
                color: token.colorSuccess,
                background: token.colorSuccessBg,
                borderColor: token.colorSuccessBorder,
            };
        }
        if (mode === "suppress") {
            return {
                color: token.colorError,
                background: token.colorErrorBg,
                borderColor: token.colorErrorBorder,
            };
        }
        return {
            color: token.colorTextSecondary,
            background: token.colorFillTertiary,
            borderColor: token.colorBorderSecondary,
        };
    };

    const availableModes: ForwardingMode[] =
        overlayId === undefined ? ["forward", "suppress"] : ["global", "forward", "suppress"];

    const getChoiceText = (mode: ForwardingMode) => {
        if (mode === "global") return t("settings.mqttForwarding.global");
        return mode === "forward"
            ? t("settings.mqttForwarding.forward")
            : t("settings.mqttForwarding.suppress");
    };

    const getChoiceItems = (setting: Setting) =>
        availableModes.map((mode) => ({
            key: mode,
            icon: getModeIcon(mode),
            label: (
                <div style={{ minWidth: 180 }}>
                    <div>{getChoiceText(mode)}</div>
                    {mode === "global" && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {t("settings.mqttForwarding.effectiveStatus", {
                                state: getModeText(
                                    setting,
                                    setting.value === true ? "forward" : "suppress",
                                ),
                            })}
                        </Typography.Text>
                    )}
                </div>
            ),
            extra: getMode(setting) === mode ? <CheckOutlined /> : undefined,
        }));

    const renderStatusButton = (setting: Setting) => {
        const mode = getMode(setting);
        const button = (
            <Button
                size="small"
                icon={getModeIcon(mode)}
                aria-label={t("settings.mqttForwarding.selectStatus", {
                    setting: getSettingText(setting).label,
                    state: getModeText(setting, mode),
                })}
                style={{
                    ...getModeStyle(mode),
                    maxWidth: "100%",
                    flexShrink: 0,
                }}
                onClick={isMobile ? () => setMobileSettingId(setting.iD) : undefined}
            >
                <span
                    style={{
                        display: "block",
                        maxWidth: isMobile ? 150 : 180,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                    }}
                >
                    {getModeText(setting, mode)}
                </span>
            </Button>
        );

        if (isMobile) return button;
        return (
            <Dropdown
                trigger={["click"]}
                placement="bottomRight"
                menu={{
                    items: getChoiceItems(setting),
                    selectedKeys: [mode],
                    onClick: ({ key }) => changeMode(setting, key as ForwardingMode),
                }}
            >
                {button}
            </Dropdown>
        );
    };

    const renderSetting = (setting: Setting) => {
        const settingText = getSettingText(setting);
        return (
            <div
                key={setting.iD}
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    minWidth: 0,
                    minHeight: isMobile ? 52 : 44,
                    padding: "6px 4px",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Tooltip title={settingText.description} placement="topLeft">
                    <Typography.Text
                        ellipsis={{ tooltip: settingText.label }}
                        style={{ minWidth: 0, flex: 1 }}
                    >
                        {settingText.label}
                    </Typography.Text>
                </Tooltip>
                {renderStatusButton(setting)}
            </div>
        );
    };

    const collapseItems = visibleGroups.map((group) => {
        const groupSuppressed = group.settings.filter((setting) => setting.value !== true).length;
        return {
            key: group.key,
            label: (
                <Space size={8} wrap>
                    <span>{t(group.labelKey)}</span>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        {t("settings.mqttForwarding.rulesCount", {
                            count: group.settings.length,
                        })}
                        {groupSuppressed > 0 &&
                            ` · ${t("settings.mqttForwarding.suppressedCount", {
                                count: groupSuppressed,
                            })}`}
                    </Typography.Text>
                </Space>
            ),
            children: (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: isMobile
                            ? "minmax(0, 1fr)"
                            : "repeat(2, minmax(0, 1fr))",
                        columnGap: 24,
                    }}
                >
                    {group.visibleSettings.map(renderSetting)}
                </div>
            ),
        };
    });

    const renderModeChoice = (setting: Setting, mode: ForwardingMode) => {
        const selected = getMode(setting) === mode;
        return (
            <Button
                key={mode}
                block
                onClick={() => changeMode(setting, mode)}
                aria-pressed={selected}
                style={{
                    height: "auto",
                    minHeight: 52,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 14px",
                    ...(selected
                        ? {
                              color: token.colorPrimary,
                              background: token.colorPrimaryBg,
                              borderColor: token.colorPrimaryBorder,
                          }
                        : undefined),
                }}
            >
                <Space>
                    {getModeIcon(mode)}
                    <span style={{ textAlign: "left" }}>
                        <span style={{ display: "block" }}>{getChoiceText(mode)}</span>
                        {mode === "global" && (
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                {t("settings.mqttForwarding.effectiveStatus", {
                                    state: getModeText(
                                        setting,
                                        setting.value === true ? "forward" : "suppress",
                                    ),
                                })}
                            </Typography.Text>
                        )}
                    </span>
                </Space>
                {selected && <CheckOutlined />}
            </Button>
        );
    };

    return (
        <div style={{ margin: "12px 0 20px", minWidth: 0 }}>
            <Collapse
                items={[
                    {
                        key: "mqtt-forwarding-filters",
                        label: (
                            <Space size={8} wrap>
                                <span>{t("settings.mqttForwarding.title")}</span>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    {t("settings.mqttForwarding.rulesCount", {
                                        count: settings.length,
                                    })}
                                    {suppressedCount > 0 &&
                                        ` · ${t("settings.mqttForwarding.suppressedCount", {
                                            count: suppressedCount,
                                        })}`}
                                </Typography.Text>
                            </Space>
                        ),
                        children: (
                            <Space direction="vertical" size={12} style={{ width: "100%" }}>
                                <Typography.Text type="secondary">
                                    {t("settings.mqttForwarding.description")}
                                </Typography.Text>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: isMobile ? "stretch" : "center",
                                        flexDirection: isMobile ? "column" : "row",
                                        flexWrap: "wrap",
                                        gap: 8,
                                        minWidth: 0,
                                    }}
                                >
                                    <Input.Search
                                        allowClear
                                        value={search}
                                        placeholder={t("settings.mqttForwarding.searchFilters")}
                                        onChange={(event) => setSearch(event.target.value)}
                                        style={{
                                            flex: isMobile ? "none" : "1 1 260px",
                                            width: isMobile ? "100%" : undefined,
                                            minWidth: 0,
                                            maxWidth: 420,
                                        }}
                                    />
                                    <Space size={4} wrap>
                                        {(
                                            [
                                                ["all", "settings.mqttForwarding.filters.all"],
                                                ...(overlayId === undefined
                                                    ? []
                                                    : [
                                                          [
                                                              "overrides",
                                                              "settings.mqttForwarding.filters.overrides",
                                                          ],
                                                      ]),
                                                [
                                                    "suppressed",
                                                    "settings.mqttForwarding.filters.suppressed",
                                                ],
                                            ] as [DisplayFilter, string][]
                                        ).map(([filter, labelKey]) => (
                                            <Button
                                                key={filter}
                                                size="small"
                                                type={
                                                    displayFilter === filter ? "primary" : "default"
                                                }
                                                ghost={displayFilter === filter}
                                                aria-pressed={displayFilter === filter}
                                                onClick={() => setDisplayFilter(filter)}
                                            >
                                                {t(labelKey)}
                                            </Button>
                                        ))}
                                    </Space>
                                </div>
                                {visibleGroups.length > 0 ? (
                                    <Collapse
                                        size="small"
                                        activeKey={activeGroupKeys}
                                        items={collapseItems}
                                        onChange={(keys) => {
                                            if (!filtersActive) {
                                                setExpandedGroups(
                                                    Array.isArray(keys)
                                                        ? keys.map(String)
                                                        : [String(keys)],
                                                );
                                            }
                                        }}
                                    />
                                ) : (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={t("settings.mqttForwarding.noMatches")}
                                    />
                                )}
                            </Space>
                        ),
                    },
                ]}
            />
            <Drawer
                placement="bottom"
                height="auto"
                open={isMobile && mobileSetting !== undefined}
                title={mobileSetting ? getSettingText(mobileSetting).label : undefined}
                onClose={() => setMobileSettingId(undefined)}
                styles={{ body: { paddingTop: 8, paddingBottom: 16 } }}
            >
                {mobileSetting && (
                    <Space direction="vertical" size={8} style={{ width: "100%" }}>
                        <Typography.Text type="secondary">
                            {t("settings.mqttForwarding.effectiveStatus", {
                                state: getModeText(
                                    mobileSetting,
                                    mobileSetting.value === true ? "forward" : "suppress",
                                ),
                            })}
                        </Typography.Text>
                        {availableModes.map((mode) => renderModeChoice(mobileSetting, mode))}
                    </Space>
                )}
            </Drawer>
        </div>
    );
};
