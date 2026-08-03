import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Grid, Space, Tag, Tooltip, theme } from "antd";
import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    LoadingOutlined,
    LockOutlined,
} from "@ant-design/icons";

import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import { BoxineApi, BoxineForcedApi, TeddyCloudApi } from "../../../api";

import { useTeddyCloud } from "../../../provider/TeddyCloudProvider";

const boxineApi = new BoxineApi(defaultAPIConfig());
const boxineForcedApi = new BoxineForcedApi(defaultAPIConfig());
const teddyCloudApi = new TeddyCloudApi(defaultAPIConfig());
const teddyCloudApiBasePath = defaultAPIConfig().basePath;

type Tb2HttpsState =
    | "disabled"
    | "standby"
    | "armed"
    | "connecting"
    | "tunneling"
    | "online"
    | "error";
type MqttUpstreamState = "disabled" | "standby" | "armed" | "connecting" | "tunneling" | "error";

interface Tb2HttpsStatus {
    enabled: boolean;
    passthrough_enabled: boolean;
    state: Tb2HttpsState;
    hostname: string;
    port: number;
    bytes_box_to_upstream: number;
    bytes_upstream_to_box: number;
    last_attempt: number;
    last_success: number;
    error_code: string;
}

const defaultTb2HttpsStatus: Tb2HttpsStatus = {
    enabled: false,
    passthrough_enabled: false,
    state: "disabled",
    hostname: "tbs2.tonie.cloud",
    port: 443,
    bytes_box_to_upstream: 0,
    bytes_upstream_to_box: 0,
    last_attempt: 0,
    last_success: 0,
    error_code: "",
};

interface MqttUpstreamStatus {
    enabled: boolean;
    passthrough_enabled: boolean;
    state: MqttUpstreamState;
    hostname: string;
    port: number;
    bytes_box_to_upstream: number;
    bytes_upstream_to_box: number;
    last_attempt: number;
    last_success: number;
    error_code: string;
}

const defaultMqttUpstreamStatus: MqttUpstreamStatus = {
    enabled: false,
    passthrough_enabled: false,
    state: "disabled",
    hostname: "ici.tonie.cloud",
    port: 8883,
    bytes_box_to_upstream: 0,
    bytes_upstream_to_box: 0,
    last_attempt: 0,
    last_success: 0,
    error_code: "",
};

const { useToken } = theme;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const statusTooltipZIndex = 2147483100;

export const ServerStatus = () => {
    const { t } = useTranslation();
    const { token } = useToken();
    const screens = Grid.useBreakpoint();
    const compactMobileLayout = screens.md !== true;
    const { fetchCloudStatus, setToniesCloudAvailable } = useTeddyCloud();

    const [boxineStatus, setBoxineStatus] = useState(false);
    const [boxineEnabledStatus, setBoxineEnabledStatus] = useState(true);
    const [tb2HttpsStatus, setTb2HttpsStatus] = useState<Tb2HttpsStatus>(defaultTb2HttpsStatus);
    const [mqttUpstreamStatus, setMqttUpstreamStatus] =
        useState<MqttUpstreamStatus>(defaultMqttUpstreamStatus);
    const [teddyStatus, setTeddyStatus] = useState(false);

    const fetchBoxineEnabledStatus = useCallback(async (): Promise<boolean> => {
        try {
            const response = await teddyCloudApi.apiGetTeddyCloudSettingRaw("cloud.enabled");
            const text = (await response.text()).trim().toLowerCase();
            const enabled = text === "true";

            setBoxineEnabledStatus(enabled);
            if (!enabled) {
                setBoxineStatus(false);
            }

            return enabled;
        } catch {
            console.log("Something went wrong getting cloud.enabled.");
            setBoxineEnabledStatus(false);
            setBoxineStatus(false);
            return false;
        }
    }, []);

    const fetchTb2HttpsStatus = useCallback(async () => {
        try {
            const response = await fetch(`${teddyCloudApiBasePath}/api/tb2-https-upstream/status`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            setTb2HttpsStatus((await response.json()) as Tb2HttpsStatus);
        } catch {
            setTb2HttpsStatus((current) => ({
                ...current,
                state: current.enabled ? "error" : "disabled",
                error_code: "status_unavailable",
            }));
        }
    }, []);

    const fetchMqttUpstreamStatus = useCallback(async () => {
        try {
            const response = await fetch(
                `${teddyCloudApiBasePath}/api/mqtt-client-upstream/status`,
            );
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            setMqttUpstreamStatus((await response.json()) as MqttUpstreamStatus);
        } catch {
            setMqttUpstreamStatus((current) => ({
                ...current,
                state: current.enabled ? "error" : "disabled",
                error_code: "status_unavailable",
            }));
        }
    }, []);

    const fetchTeddyStatus = useCallback(async () => {
        try {
            const timeRequest = (await boxineApi.v1TimeGet()) as string;
            setTeddyStatus(timeRequest.length === 10);
        } catch {
            setTeddyStatus(false);
        }
    }, []);

    const fetchBoxineStatusWithRetries = useCallback(async () => {
        const maxRetries = 10;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const timeRequest = (await boxineForcedApi.reverseV1TimeGet()) as string;
                if (timeRequest.length === 10) {
                    setBoxineStatus(true);
                    return;
                }
            } catch {
                setBoxineStatus(false);
                if (attempt < maxRetries - 1) {
                    await delay(500);
                }
            }
        }
    }, []);

    const fetchCloudStatusUsingTimeRequests = useCallback(async () => {
        const isEnabled = await fetchBoxineEnabledStatus();

        await fetchTb2HttpsStatus();
        await fetchMqttUpstreamStatus();
        await fetchTeddyStatus();

        if (isEnabled) {
            await fetchBoxineStatusWithRetries();
        }
    }, [
        fetchBoxineEnabledStatus,
        fetchTb2HttpsStatus,
        fetchMqttUpstreamStatus,
        fetchTeddyStatus,
        fetchBoxineStatusWithRetries,
    ]);

    useEffect(() => {
        fetchCloudStatusUsingTimeRequests();
    }, [fetchCloudStatusUsingTimeRequests, fetchCloudStatus]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            fetchTb2HttpsStatus();
            fetchMqttUpstreamStatus();
        }, 5000);
        return () => window.clearInterval(interval);
    }, [fetchMqttUpstreamStatus, fetchTb2HttpsStatus]);

    useEffect(() => {
        setToniesCloudAvailable(boxineStatus);
    }, [boxineStatus, setToniesCloudAvailable]);

    const boxineBgColor = boxineEnabledStatus ? (boxineStatus ? "#87d068" : "#f50") : "#faad14";

    const tb2HttpsBgColor =
        tb2HttpsStatus.state === "online" || tb2HttpsStatus.state === "tunneling"
            ? "#87d068"
            : tb2HttpsStatus.state === "error"
              ? "#f50"
              : "#faad14";

    const tb2HttpsIcon =
        tb2HttpsStatus.state === "disabled" ? (
            <LockOutlined />
        ) : tb2HttpsStatus.state === "connecting" || tb2HttpsStatus.state === "armed" ? (
            <LoadingOutlined spin={tb2HttpsStatus.state === "connecting"} />
        ) : tb2HttpsStatus.state === "online" || tb2HttpsStatus.state === "tunneling" ? (
            <CheckCircleOutlined />
        ) : (
            <CloseCircleOutlined />
        );

    const mqttUpstreamBgColor =
        mqttUpstreamStatus.state === "tunneling"
            ? "#87d068"
            : mqttUpstreamStatus.state === "error"
              ? "#f50"
              : "#faad14";

    const mqttUpstreamIcon =
        mqttUpstreamStatus.state === "tunneling" ? (
            <CheckCircleOutlined />
        ) : mqttUpstreamStatus.state === "error" ? (
            <CloseCircleOutlined />
        ) : mqttUpstreamStatus.state === "connecting" || mqttUpstreamStatus.state === "armed" ? (
            <LoadingOutlined spin={mqttUpstreamStatus.state === "connecting"} />
        ) : (
            <LockOutlined />
        );

    const teddyBgColor = teddyStatus ? "#87d068" : "#f50";

    const commonTagStyle: React.CSSProperties = {
        cursor: "help",
        border: 0,
        color: token.colorTextLightSolid,
        paddingInline: compactMobileLayout ? 5 : undefined,
    };

    const upstreamSegmentStyle: React.CSSProperties = {
        ...commonTagStyle,
        marginInlineEnd: 0,
    };

    return (
        <Space size={compactMobileLayout ? 2 : 4}>
            <Tooltip
                zIndex={statusTooltipZIndex}
                title={
                    boxineEnabledStatus
                        ? boxineStatus
                            ? t("server.boxineStatusOnline")
                            : t("server.boxineStatusOffline")
                        : t("server.boxineDisabled")
                }
            >
                <Tag
                    icon={
                        boxineEnabledStatus ? (
                            boxineStatus ? (
                                <CheckCircleOutlined />
                            ) : (
                                <CloseCircleOutlined />
                            )
                        ) : (
                            <LockOutlined />
                        )
                    }
                    style={{
                        ...commonTagStyle,
                        color: "#001529",
                        backgroundColor: boxineBgColor,
                    }}
                >
                    BOX
                </Tag>
            </Tooltip>

            <span style={{ display: "inline-flex" }} aria-label="TB2 upstream status">
                <Tooltip
                    zIndex={statusTooltipZIndex}
                    title={t(`server.mqttUpstreamStatus.${mqttUpstreamStatus.state}`, {
                        hostname: mqttUpstreamStatus.hostname,
                        port: mqttUpstreamStatus.port,
                        errorCode: mqttUpstreamStatus.error_code || "-",
                    })}
                >
                    <Tag
                        icon={mqttUpstreamIcon}
                        style={{
                            ...upstreamSegmentStyle,
                            color: "#001529",
                            backgroundColor: mqttUpstreamBgColor,
                            borderStartEndRadius: 0,
                            borderEndEndRadius: 0,
                        }}
                    >
                        ICI
                    </Tag>
                </Tooltip>

                <Tooltip
                    zIndex={statusTooltipZIndex}
                    title={t(`server.tb2HttpsStatus.${tb2HttpsStatus.state}`, {
                        hostname: tb2HttpsStatus.hostname,
                        port: tb2HttpsStatus.port,
                        errorCode: tb2HttpsStatus.error_code || "-",
                    })}
                >
                    <Tag
                        icon={tb2HttpsIcon}
                        style={{
                            ...upstreamSegmentStyle,
                            color: "#001529",
                            backgroundColor: tb2HttpsBgColor,
                            borderStartStartRadius: 0,
                            borderEndStartRadius: 0,
                        }}
                    >
                        {compactMobileLayout ? "TON" : "TONIES"}
                    </Tag>
                </Tooltip>
            </span>

            <Tooltip
                zIndex={statusTooltipZIndex}
                title={
                    teddyStatus
                        ? t("server.teddycloudStatusOnline")
                        : t("server.teddycloudStatusOffline")
                }
            >
                <Tag
                    icon={teddyStatus ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                    style={{
                        ...commonTagStyle,
                        backgroundColor: teddyBgColor,
                        color: "#001529",
                        marginRight: compactMobileLayout ? 4 : 8,
                    }}
                >
                    TC
                </Tag>
            </Tooltip>
        </Space>
    );
};
