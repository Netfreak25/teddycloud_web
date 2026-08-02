import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Space, Tag, Tooltip, theme } from "antd";
import { CheckCircleOutlined, CloseCircleOutlined, LockOutlined } from "@ant-design/icons";

import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import { BoxineApi, BoxineForcedApi, TeddyCloudApi } from "../../../api";

import { HiddenDesktop, HiddenMobile } from "../StyledComponents";
import { useTeddyCloud } from "../../../provider/TeddyCloudProvider";

const boxineApi = new BoxineApi(defaultAPIConfig());
const boxineForcedApi = new BoxineForcedApi(defaultAPIConfig());
const teddyCloudApi = new TeddyCloudApi(defaultAPIConfig());
const defaultTb2CloudHostname = "tbs2.tonie.cloud";

const { useToken } = theme;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const ServerStatus = () => {
    const { t } = useTranslation();
    const { token } = useToken();
    const { fetchCloudStatus, setToniesCloudAvailable } = useTeddyCloud();

    const [boxineStatus, setBoxineStatus] = useState(false);
    const [boxineEnabledStatus, setBoxineEnabledStatus] = useState(true);
    const [tb2CloudEnabledStatus, setTb2CloudEnabledStatus] = useState(false);
    const [tb2CloudHostname, setTb2CloudHostname] = useState(defaultTb2CloudHostname);
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

    const fetchTb2CloudPlaceholderStatus = useCallback(async () => {
        try {
            const [enabledResponse, hostnameResponse] = await Promise.all([
                teddyCloudApi.apiGetTeddyCloudSettingRaw("cloud.tb2_enabled"),
                teddyCloudApi.apiGetTeddyCloudSettingRaw("cloud.remote_hostname_tb2"),
            ]);
            const [enabledText, hostnameText] = await Promise.all([
                enabledResponse.text(),
                hostnameResponse.text(),
            ]);

            setTb2CloudEnabledStatus(enabledText.trim().toLowerCase() === "true");
            setTb2CloudHostname(hostnameText.trim() || defaultTb2CloudHostname);
        } catch {
            setTb2CloudEnabledStatus(false);
            setTb2CloudHostname(defaultTb2CloudHostname);
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

        await fetchTb2CloudPlaceholderStatus();
        await fetchTeddyStatus();

        if (isEnabled) {
            await fetchBoxineStatusWithRetries();
        }
    }, [
        fetchBoxineEnabledStatus,
        fetchTb2CloudPlaceholderStatus,
        fetchTeddyStatus,
        fetchBoxineStatusWithRetries,
    ]);

    useEffect(() => {
        fetchCloudStatusUsingTimeRequests();
    }, [fetchCloudStatusUsingTimeRequests, fetchCloudStatus]);

    useEffect(() => {
        setToniesCloudAvailable(boxineStatus);
    }, [boxineStatus, setToniesCloudAvailable]);

    const boxineBgColor = boxineEnabledStatus ? (boxineStatus ? "#87d068" : "#f50") : "#faad14";

    const tb2CloudBgColor = tb2CloudEnabledStatus ? "#f50" : "#faad14";

    const teddyBgColor = teddyStatus ? "#87d068" : "#f50";

    const commonTagStyle: React.CSSProperties = {
        cursor: "help",
        border: 0,
        color: token.colorTextLightSolid,
    };

    return (
        <Space>
            <Tooltip
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
                    <HiddenDesktop>B</HiddenDesktop>
                    <HiddenMobile>Boxine</HiddenMobile>
                </Tag>
            </Tooltip>

            <Tooltip
                title={t(
                    tb2CloudEnabledStatus
                        ? "server.tb2CloudStatusOffline"
                        : "server.tb2CloudUnavailable",
                    { hostname: tb2CloudHostname },
                )}
            >
                <Tag
                    icon={tb2CloudEnabledStatus ? <CloseCircleOutlined /> : <LockOutlined />}
                    style={{
                        ...commonTagStyle,
                        color: "#001529",
                        backgroundColor: tb2CloudBgColor,
                    }}
                >
                    <HiddenDesktop>TB2</HiddenDesktop>
                    <HiddenMobile>TB2 Cloud</HiddenMobile>
                </Tag>
            </Tooltip>

            <Tooltip
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
                        marginRight: 8,
                    }}
                >
                    <HiddenDesktop>TC</HiddenDesktop>
                    <HiddenMobile>TeddyCloud</HiddenMobile>
                </Tag>
            </Tooltip>
        </Space>
    );
};
