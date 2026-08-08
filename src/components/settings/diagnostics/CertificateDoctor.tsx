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
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import {
    CertificateDoctorCheck,
    CertificateDoctorOverlay,
    CertificateDoctorReport,
    CertificateDoctorRole,
    CertificateDoctorSeverity,
    isCertificateDoctorReport,
    normalizeCertificateDoctorReport,
    normalizeCertificateDoctorSeverity,
} from "../../../types/certificateDiagnosticsTypes";

const { Text } = Typography;
const API_PATH = "/api/diagnostics/certificates";

const statusColor: Record<CertificateDoctorSeverity, string> = {
    ok: "success",
    warning: "warning",
    error: "error",
    info: "processing",
};

const severityRank: Record<CertificateDoctorSeverity, number> = {
    info: 0,
    ok: 1,
    warning: 2,
    error: 3,
};

type DiagnosticEntry = {
    id?: number;
    code?: string;
    severity: CertificateDoctorSeverity;
    scope?: string;
    path?: string;
    message: string;
};

type DiagnosticGroup = {
    key: string;
    scope: string;
    path: string;
    severity: CertificateDoctorSeverity;
    entries: DiagnosticEntry[];
    counts: Record<CertificateDoctorSeverity, number>;
};

const entryScope = (entry: DiagnosticEntry): string => {
    if (entry.scope) return entry.scope;
    const separator = entry.message.indexOf(": ");
    return separator >= 0 ? entry.message.slice(0, separator) : "General";
};

const entryDetails = (entry: DiagnosticEntry): string => {
    const scope = entryScope(entry);
    const prefix = `${scope}: `;
    return entry.message.startsWith(prefix) ? entry.message.slice(prefix.length) : entry.message;
};

const entryPath = (entry: DiagnosticEntry): string => {
    if (entry.path) return entry.path;
    const match = entry.message.match(/(?:\/teddycloud\/|(?:certs|config)\/)[^\s,;)\]]+/);
    if (match) return match[0].replace(/["']+$/, "");
    const scope = entryScope(entry);
    return scope.startsWith("Inventory ") ? `certs/${scope.slice("Inventory ".length)}` : "";
};

const groupChecks = (
    checks: CertificateDoctorCheck[],
    pathByScope: Map<string, string>,
): DiagnosticGroup[] => {
    const groups = new Map<string, DiagnosticGroup>();
    checks.forEach((check) => {
        const entry: DiagnosticEntry = {
            ...check,
            severity: normalizeCertificateDoctorSeverity(check.severity),
        };
        const scope = entryScope(entry);
        const path = entryPath(entry) || pathByScope.get(scope) || "";
        const key = `${scope}\u0000${path}`;
        let group = groups.get(key);
        if (!group) {
            group = {
                key,
                scope,
                path,
                severity: "info",
                entries: [],
                counts: { ok: 0, warning: 0, error: 0, info: 0 },
            };
            groups.set(key, group);
        }
        group.entries.push(entry);
        group.counts[entry.severity] += 1;
        if (severityRank[entry.severity] > severityRank[group.severity]) {
            group.severity = entry.severity;
        }
    });
    return Array.from(groups.values()).sort(
        (left, right) =>
            severityRank[right.severity] - severityRank[left.severity] ||
            left.scope.localeCompare(right.scope),
    );
};

const EllipsisText: React.FC<{ value: string }> = ({ value }) =>
    value ? (
        <Tooltip title={value}>
            <Text ellipsis style={{ maxWidth: 280 }}>
                {value}
            </Text>
        </Tooltip>
    ) : (
        <Text type="secondary">-</Text>
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
            setReport(normalizeCertificateDoctorReport(payload));
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

    const statusTag = (value: unknown) => {
        const status = normalizeCertificateDoctorSeverity(value);
        return <Tag color={statusColor[status]}>{t(`settings.diagnostics.status.${status}`)}</Tag>;
    };

    const detailGroups = useMemo(() => {
        if (!report) return [];
        const pathByScope = new Map<string, string>();
        report.roles.forEach((role) => role.path && pathByScope.set(role.label, role.path));
        report.overlays.forEach((overlay) => {
            if (overlay.path) pathByScope.set(`Overlay ${overlay.id}`, overlay.path);
        });
        return groupChecks(report.checks, pathByScope);
    }, [report]);

    const detailSummary = (group: DiagnosticGroup) =>
        t("settings.diagnostics.detailSummary", {
            ok: group.counts.ok,
            warnings: group.counts.warning,
            errors: group.counts.error,
            info: group.counts.info,
        });

    const renderCheckList = (entries: DiagnosticEntry[]) => (
        <List
            size="small"
            dataSource={entries}
            renderItem={(entry) => (
                <List.Item>
                    <Space align="start" style={{ width: "100%" }}>
                        {statusTag(entry.severity)}
                        <Text>{entryDetails(entry)}</Text>
                    </Space>
                </List.Item>
            )}
        />
    );

    const renderDetailGroup = (group: DiagnosticGroup) => {
        const problems = group.entries.filter(
            (entry) => entry.severity === "error" || entry.severity === "warning",
        );
        const information = group.entries.filter((entry) => entry.severity === "info");
        const successful = group.entries.filter((entry) => entry.severity === "ok");
        const secondaryItems = [
            information.length
                ? {
                      key: "information",
                      label: `${t("settings.diagnostics.detailSections.information")} (${information.length})`,
                      children: renderCheckList(information),
                  }
                : undefined,
            successful.length
                ? {
                      key: "successful",
                      label: `${t("settings.diagnostics.detailSections.successful")} (${successful.length})`,
                      children: renderCheckList(successful),
                  }
                : undefined,
        ].filter((item): item is NonNullable<typeof item> => item !== undefined);

        return (
            <Space direction="vertical" size="small" style={{ width: "100%" }}>
                {problems.length > 0 && (
                    <div>
                        <Text strong>
                            {t("settings.diagnostics.detailSections.problems")} ({problems.length})
                        </Text>
                        {renderCheckList(problems)}
                    </div>
                )}
                {secondaryItems.length > 0 && (
                    <Collapse ghost size="small" items={secondaryItems} />
                )}
            </Space>
        );
    };

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
                                            <Space
                                                direction="vertical"
                                                size={4}
                                                style={{ width: "100%" }}
                                            >
                                                <Space wrap align="center">
                                                    {statusTag(finding.severity)}
                                                    <Text strong>{entryScope(finding)}</Text>
                                                </Space>
                                                <Text>{entryDetails(finding)}</Text>
                                                <Space size={4} wrap>
                                                    <Text type="secondary">
                                                        {t("settings.diagnostics.columns.path")}:
                                                    </Text>
                                                    {entryPath(finding) ? (
                                                        <EllipsisText value={entryPath(finding)} />
                                                    ) : (
                                                        <Text type="secondary">
                                                            {t(
                                                                "settings.diagnostics.pathUnavailable",
                                                            )}
                                                        </Text>
                                                    )}
                                                </Space>
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

                        <Card title={t("settings.diagnostics.detailsTitle")} size="small">
                            <Collapse
                                size="small"
                                items={detailGroups.map((group) => ({
                                    key: group.key,
                                    label: (
                                        <div
                                            style={{
                                                display: "flex",
                                                justifyContent: "space-between",
                                                alignItems: "center",
                                                gap: 12,
                                                flexWrap: "wrap",
                                                width: "100%",
                                            }}
                                        >
                                            <Space wrap>
                                                {statusTag(group.severity)}
                                                <Text strong>{group.scope}</Text>
                                                <Text type="secondary">{detailSummary(group)}</Text>
                                            </Space>
                                            {group.path && <EllipsisText value={group.path} />}
                                        </div>
                                    ),
                                    children: renderDetailGroup(group),
                                }))}
                            />
                        </Card>
                    </>
                )
            )}
        </Space>
    );
};
