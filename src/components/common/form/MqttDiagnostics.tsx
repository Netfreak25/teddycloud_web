import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Collapse, Form, Space, Switch, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsDataHandler from "../../../data/SettingsDataHandler";
import {
    buildMqttArchiveParts,
    createMqttDiagnosticArchive,
    MQTT_DEBUG_SETTING,
    MqttDiagnosticSession,
    MqttDiagnosticStatus,
    mqttDiagnosticUrl,
    parseMqttDiagnosticStatus,
} from "../../../utils/mqttDiagnostics";

type Props = { overlay: string; active: boolean };

/** The switch is a normal settings draft; status reads never reinitialize the form. */
export const MqttDiagnostics: React.FC<Props> = ({ overlay, active }) => {
    const { t } = useTranslation();
    const handler = SettingsDataHandler.getInstance();
    const [, setRevision] = useState(0);
    const [expanded, setExpanded] = useState(false);
    const [status, setStatus] = useState<MqttDiagnosticStatus>();
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState("");
    const [downloadError, setDownloadError] = useState("");
    const [downloading, setDownloading] = useState("");
    const [progress, setProgress] = useState("");
    const statusRequest = useRef<AbortController | null>(null);
    const downloadRequest = useRef<AbortController | null>(null);
    const setting = handler.getSetting(MQTT_DEBUG_SETTING);
    const savedEnabled = setting?.initialValue === true;
    const enabledDraft = setting?.value === true;
    const pending = enabledDraft !== savedEnabled;

    useEffect(() => {
        const listener = () => setRevision((revision) => revision + 1);
        handler.addListener(listener);
        return () => handler.removeListener(listener);
    }, [handler]);

    const refresh = useCallback(async () => {
        statusRequest.current?.abort();
        const request = new AbortController();
        statusRequest.current = request;
        setLoading(true);
        setLoadError("");
        try {
            const response = await fetch(mqttDiagnosticUrl(overlay), {
                cache: "no-store",
                signal: request.signal,
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const next = parseMqttDiagnosticStatus(await response.json());
            if (!request.signal.aborted) setStatus(next);
        } catch (error) {
            if (!request.signal.aborted) setLoadError(String(error));
        } finally {
            if (!request.signal.aborted) setLoading(false);
        }
    }, [overlay]);

    useEffect(() => {
        if (active && expanded) void refresh();
        return () => {
            statusRequest.current?.abort();
            downloadRequest.current?.abort();
        };
    }, [active, expanded, refresh, savedEnabled]);

    const download = async (session: MqttDiagnosticSession) => {
        const request = new AbortController();
        downloadRequest.current = request;
        setDownloading(session.id);
        setDownloadError("");
        let completed = 0;
        try {
            const parts = buildMqttArchiveParts([session]);
            for (const [index, entries] of parts.entries()) {
                setProgress(t("settings.mqttDebug.part", { part: index + 1, total: parts.length }));
                const blob = await createMqttDiagnosticArchive(
                    overlay,
                    [session],
                    entries,
                    index + 1,
                    parts.length,
                    request.signal,
                );
                request.signal.throwIfAborted();
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement("a");
                anchor.href = url;
                anchor.download = `mqtt-diagnostics-${session.id}-part-${index + 1}-of-${parts.length}.zip`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
                completed++;
            }
        } catch (error) {
            if (!request.signal.aborted) {
                setDownloadError(
                    t("settings.mqttDebug.downloadFailed", { completed, error: String(error) }),
                );
                await refresh();
            }
        } finally {
            setDownloading("");
            setProgress("");
        }
    };

    return (
        <div style={{ marginBottom: 16 }}>
            <Alert
                type="warning"
                showIcon
                title={t("settings.mqttDebug.privacy")}
                style={{ marginBottom: 16 }}
            />
            <Form.Item label={t("settings.mqttDebug.enabled")}>
                <Switch
                    aria-label={t("settings.mqttDebug.enabled")}
                    checked={enabledDraft}
                    disabled={!setting || setting.readOnly}
                    onChange={(value) => {
                        handler.changeSettingOverlayed(MQTT_DEBUG_SETTING, true);
                        handler.changeSetting(MQTT_DEBUG_SETTING, value, true);
                    }}
                />
            </Form.Item>
            <Typography.Paragraph type="secondary">
                {t("settings.mqttDebug.saveHint")}
            </Typography.Paragraph>
            {pending && <Alert type="info" showIcon title={t("settings.mqttDebug.pending")} />}
            <Collapse
                style={{ marginTop: 12 }}
                activeKey={expanded ? ["diagnostics"] : []}
                onChange={(keys) => setExpanded(keys.includes("diagnostics"))}
                items={[
                    {
                        key: "diagnostics",
                        label: t("settings.mqttDebug.title"),
                        children: (
                            <Space orientation="vertical" style={{ width: "100%" }} size="middle">
                                <Button
                                    icon={<ReloadOutlined />}
                                    loading={loading}
                                    onClick={() => void refresh()}
                                >
                                    {t("settings.mqttDebug.refresh")}
                                </Button>
                                {loadError && (
                                    <Alert
                                        type="error"
                                        showIcon
                                        title={t("settings.mqttDebug.loadFailed")}
                                        description={loadError}
                                    />
                                )}
                                {downloadError && (
                                    <Alert type="error" showIcon title={downloadError} />
                                )}
                                {status && (
                                    <>
                                        <Space wrap>
                                            <Tag
                                                color={
                                                    status.state === "error"
                                                        ? "error"
                                                        : status.state === "recording"
                                                          ? "processing"
                                                          : "default"
                                                }
                                            >
                                                {t(`settings.mqttDebug.states.${status.state}`)}
                                            </Tag>
                                            <Typography.Text>
                                                {t("settings.mqttDebug.storage", {
                                                    bytes: status.bytes.toLocaleString(),
                                                })}
                                            </Typography.Text>
                                            <Typography.Text>
                                                {t("settings.mqttDebug.dropped", {
                                                    count: status.droppedEvents,
                                                })}
                                            </Typography.Text>
                                        </Space>
                                        {status.error && (
                                            <Alert type="error" title={status.error} />
                                        )}
                                        <Typography.Text type="secondary">
                                            {t("settings.mqttDebug.snapshotHint")}
                                        </Typography.Text>
                                        {status.sessions.length === 0 && (
                                            <Typography.Text>
                                                {t("settings.mqttDebug.empty")}
                                            </Typography.Text>
                                        )}
                                        {status.sessions.map((session) => (
                                            <div key={session.id} style={{ width: "100%" }}>
                                                <Space wrap>
                                                    <Typography.Text code>
                                                        {session.id}
                                                    </Typography.Text>
                                                    <Typography.Text>
                                                        {session.startedAt}
                                                    </Typography.Text>
                                                    {session.active && (
                                                        <Tag>{t("settings.mqttDebug.active")}</Tag>
                                                    )}
                                                    {session.truncated && (
                                                        <Tag color="warning">
                                                            {t("settings.mqttDebug.truncated")}
                                                        </Tag>
                                                    )}
                                                    <Button
                                                        icon={<DownloadOutlined />}
                                                        loading={downloading === session.id}
                                                        disabled={
                                                            session.files.length === 0 ||
                                                            (downloading !== "" &&
                                                                downloading !== session.id)
                                                        }
                                                        onClick={() => void download(session)}
                                                    >
                                                        {t("settings.mqttDebug.download")}
                                                    </Button>
                                                </Space>
                                                <Typography.Paragraph type="secondary">
                                                    {session.files
                                                        .map(
                                                            (file) =>
                                                                `${file.name} (${file.size.toLocaleString()} B)`,
                                                        )
                                                        .join(" · ")}
                                                </Typography.Paragraph>
                                            </div>
                                        ))}
                                        {progress && <Typography.Text>{progress}</Typography.Text>}
                                    </>
                                )}
                            </Space>
                        ),
                    },
                ]}
            />
        </div>
    );
};
