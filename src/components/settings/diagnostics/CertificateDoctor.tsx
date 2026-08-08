import {
    CheckCircleOutlined,
    CloseCircleOutlined,
    ReloadOutlined,
    SafetyCertificateOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import {
    Alert,
    Button,
    Card,
    Col,
    Collapse,
    List,
    Row,
    Space,
    Spin,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import {
    CertificateDoctorCheck,
    CertificateDoctorOverlay,
    CertificateDoctorReport,
    CertificateDoctorRole,
    CertificateDoctorSeverity,
    isCertificateDoctorReport,
} from "../../../types/certificateDiagnosticsTypes";

const { Text } = Typography;
const API_PATH = "/api/diagnostics/certificates";

const statusColor: Record<CertificateDoctorSeverity, string> = {
    ok: "success",
    warning: "warning",
    error: "error",
    info: "processing",
};

const EllipsisText: React.FC<{ value: string }> = ({ value }) =>
    value ? (
        <Tooltip title={value}>
            <Text ellipsis style={{ maxWidth: 280 }}>
                {value}
            </Text>
        </Tooltip>
    ) : (
        <Text type="secondary">—</Text>
    );

export const CertificateDoctor: React.FC = () => {
    const { t } = useTranslation();
    const [report, setReport] = useState<CertificateDoctorReport>();
    const [loading, setLoading] = useState(false);
    const [errorKey, setErrorKey] = useState<string>();
    const controllerRef = useRef<AbortController | undefined>(undefined);

    const loadReport = useCallback(async () => {
        if (controllerRef.current) return;
        const controller = new AbortController();
        controllerRef.current = controller;
        setLoading(true);
        setErrorKey(undefined);
        try {
            const response = await fetch(`${defaultAPIConfig().basePath}${API_PATH}`, {
                signal: controller.signal,
            });
            const payload = (await response.json()) as unknown;
            if (!response.ok) {
                const apiError = payload as { error?: string };
                throw new Error(
                    apiError.error === "doctor_unavailable" ? "doctorUnavailable" : "requestFailed",
                );
            }
            if (!isCertificateDoctorReport(payload)) {
                throw new Error(
                    (payload as { schemaVersion?: unknown })?.schemaVersion !== 1
                        ? "schemaUnsupported"
                        : "responseInvalid",
                );
            }
            setReport(payload);
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;
            setErrorKey(error instanceof Error ? error.message : "requestFailed");
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = undefined;
                setLoading(false);
            }
        }
    }, []);

    useEffect(() => {
        void loadReport();
        return () => controllerRef.current?.abort();
    }, [loadReport]);

    const statusTag = (status: CertificateDoctorSeverity) => (
        <Tag color={statusColor[status]}>{t(`settings.diagnostics.status.${status}`)}</Tag>
    );

    const roleColumns: ColumnsType<CertificateDoctorRole> = [
        { title: t("settings.diagnostics.columns.role"), dataIndex: "label", key: "label" },
        {
            title: t("settings.diagnostics.columns.status"),
            dataIndex: "status",
            key: "status",
            render: statusTag,
        },
        {
            title: t("settings.diagnostics.columns.active"),
            dataIndex: "active",
            key: "active",
            render: (active: boolean) =>
                t(`settings.diagnostics.activity.${active ? "active" : "inactive"}`),
        },
        {
            title: t("settings.diagnostics.columns.generation"),
            dataIndex: "generation",
            key: "generation",
        },
        {
            title: t("settings.diagnostics.columns.cn"),
            dataIndex: "cn",
            key: "cn",
            render: (value: string) => <EllipsisText value={value} />,
        },
        {
            title: t("settings.diagnostics.columns.path"),
            dataIndex: "path",
            key: "path",
            render: (value: string) => <EllipsisText value={value} />,
        },
    ];

    const overlayColumns: ColumnsType<CertificateDoctorOverlay> = [
        { title: t("settings.diagnostics.columns.box"), dataIndex: "boxId", key: "boxId" },
        {
            title: t("settings.diagnostics.columns.generation"),
            dataIndex: "selectedGeneration",
            key: "selectedGeneration",
        },
        {
            title: t("settings.diagnostics.columns.identity"),
            dataIndex: "identitySource",
            key: "identitySource",
            render: (source: CertificateDoctorOverlay["identitySource"]) =>
                t(`settings.diagnostics.identity.${source}`),
        },
        {
            title: t("settings.diagnostics.columns.status"),
            dataIndex: "status",
            key: "status",
            render: statusTag,
        },
        {
            title: t("settings.diagnostics.columns.cn"),
            dataIndex: "cn",
            key: "cn",
            render: (value: string) => <EllipsisText value={value} />,
        },
        {
            title: t("settings.diagnostics.columns.path"),
            dataIndex: "path",
            key: "path",
            render: (value: string) => <EllipsisText value={value} />,
        },
    ];

    const checkColumns: ColumnsType<CertificateDoctorCheck> = [
        {
            title: t("settings.diagnostics.columns.status"),
            dataIndex: "severity",
            key: "severity",
            width: 120,
            render: statusTag,
        },
        {
            title: t("settings.diagnostics.columns.details"),
            dataIndex: "message",
            key: "message",
        },
    ];

    return (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Row justify="space-between" align="middle" gutter={[12, 12]}>
                <Col>
                    <h1 style={{ margin: 0 }}>{t("settings.diagnostics.title")}</h1>
                </Col>
                <Col>
                    <Button
                        type="primary"
                        icon={<ReloadOutlined />}
                        loading={loading}
                        disabled={loading}
                        onClick={() => void loadReport()}
                    >
                        {t("settings.diagnostics.refresh")}
                    </Button>
                </Col>
            </Row>

            <Alert
                type="info"
                showIcon
                title={t("settings.diagnostics.readOnlyTitle")}
                description={t("settings.diagnostics.readOnlyDescription")}
            />

            {errorKey && (
                <Alert
                    type="error"
                    showIcon
                    title={t("settings.diagnostics.loadFailed")}
                    description={t(`settings.diagnostics.errors.${errorKey}`)}
                    action={
                        <Button size="small" onClick={() => void loadReport()} disabled={loading}>
                            {t("settings.diagnostics.retry")}
                        </Button>
                    }
                />
            )}

            {loading && !report ? (
                <div style={{ padding: 48, textAlign: "center" }}>
                    <Spin tip={t("settings.diagnostics.loading")} size="large" />
                </div>
            ) : (
                report && (
                    <>
                        <Row gutter={[12, 12]}>
                            <Col xs={12} lg={6}>
                                <Card size="small">
                                    <Statistic
                                        title={t("settings.diagnostics.summary.roles")}
                                        value={report.summary.roles}
                                        prefix={<SafetyCertificateOutlined />}
                                    />
                                </Card>
                            </Col>
                            <Col xs={12} lg={6}>
                                <Card size="small">
                                    <Statistic
                                        title={t("settings.diagnostics.summary.ok")}
                                        value={report.summary.ok}
                                        valueStyle={{ color: "#389e0d" }}
                                        prefix={<CheckCircleOutlined />}
                                    />
                                </Card>
                            </Col>
                            <Col xs={12} lg={6}>
                                <Card size="small">
                                    <Statistic
                                        title={t("settings.diagnostics.summary.warnings")}
                                        value={report.summary.warnings}
                                        valueStyle={{ color: "#d48806" }}
                                        prefix={<WarningOutlined />}
                                    />
                                </Card>
                            </Col>
                            <Col xs={12} lg={6}>
                                <Card size="small">
                                    <Statistic
                                        title={t("settings.diagnostics.summary.errors")}
                                        value={report.summary.errors}
                                        valueStyle={{ color: "#cf1322" }}
                                        prefix={<CloseCircleOutlined />}
                                    />
                                </Card>
                            </Col>
                        </Row>

                        <Card title={t("settings.diagnostics.rolesTitle")} size="small">
                            <Table
                                rowKey="id"
                                columns={roleColumns}
                                dataSource={report.roles}
                                pagination={false}
                                size="small"
                                scroll={{ x: 900 }}
                            />
                        </Card>

                        <Card title={t("settings.diagnostics.overlaysTitle")} size="small">
                            {report.overlays.length ? (
                                <Table
                                    rowKey="id"
                                    columns={overlayColumns}
                                    dataSource={report.overlays}
                                    pagination={false}
                                    size="small"
                                    scroll={{ x: 850 }}
                                />
                            ) : (
                                <Text type="secondary">{t("settings.diagnostics.noOverlays")}</Text>
                            )}
                        </Card>

                        <Card title={t("settings.diagnostics.findingsTitle")} size="small">
                            {report.findings.length ? (
                                <List
                                    dataSource={report.findings}
                                    renderItem={(finding) => (
                                        <List.Item>
                                            <Space align="start">
                                                {statusTag(finding.severity)}
                                                <Text>{finding.message}</Text>
                                            </Space>
                                        </List.Item>
                                    )}
                                />
                            ) : (
                                <Alert
                                    type="success"
                                    showIcon
                                    title={t("settings.diagnostics.noFindings")}
                                />
                            )}
                        </Card>

                        <Collapse
                            items={[
                                {
                                    key: "details",
                                    label: t("settings.diagnostics.detailsTitle"),
                                    children: (
                                        <Table
                                            rowKey="id"
                                            columns={checkColumns}
                                            dataSource={report.checks}
                                            pagination={{ pageSize: 25, hideOnSinglePage: true }}
                                            size="small"
                                            scroll={{ x: 700 }}
                                        />
                                    ),
                                },
                            ]}
                        />
                    </>
                )
            )}
        </Space>
    );
};
