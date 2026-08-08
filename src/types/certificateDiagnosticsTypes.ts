export type CertificateDoctorSeverity = "ok" | "warning" | "error" | "info";

export type CertificateDoctorSummary = {
    roles: number;
    ok: number;
    warnings: number;
    errors: number;
};

export type CertificateDoctorRole = {
    id: string;
    label: string;
    active: boolean;
    status: CertificateDoctorSeverity;
    generation: string;
    cn: string;
    path: string;
};

export type CertificateDoctorOverlay = {
    id: string;
    boxId: string;
    configuredGeneration: string;
    selectedGeneration: string;
    identitySource: "shared" | "override" | "unknown";
    status: CertificateDoctorSeverity;
    cn: string;
    path: string;
};

export type CertificateDoctorFinding = {
    severity: CertificateDoctorSeverity;
    code: string;
    scope?: string;
    path?: string;
    message: string;
};

export type CertificateDoctorCheck = {
    id: number;
    severity: CertificateDoctorSeverity;
    scope?: string;
    path?: string;
    message: string;
};

export type CertificateDoctorReport = {
    schemaVersion: 1;
    result: "ok" | "warning" | "error";
    summary: CertificateDoctorSummary;
    roles: CertificateDoctorRole[];
    overlays: CertificateDoctorOverlay[];
    findings: CertificateDoctorFinding[];
    checks: CertificateDoctorCheck[];
};

const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

export const normalizeCertificateDoctorSeverity = (value: unknown): CertificateDoctorSeverity => {
    switch (String(value).toLowerCase()) {
        case "ok":
            return "ok";
        case "warn":
        case "warning":
            return "warning";
        case "error":
            return "error";
        default:
            return "info";
    }
};

export const normalizeCertificateDoctorReport = (
    report: CertificateDoctorReport,
): CertificateDoctorReport => ({
    ...report,
    roles: report.roles.map((role) => ({
        ...role,
        status: normalizeCertificateDoctorSeverity(role.status),
    })),
    overlays: report.overlays.map((overlay) => ({
        ...overlay,
        status: normalizeCertificateDoctorSeverity(overlay.status),
    })),
    findings: report.findings.map((finding) => ({
        ...finding,
        severity: normalizeCertificateDoctorSeverity(finding.severity),
    })),
    checks: report.checks.map((check) => ({
        ...check,
        severity: normalizeCertificateDoctorSeverity(check.severity),
    })),
});

export const isCertificateDoctorReport = (value: unknown): value is CertificateDoctorReport => {
    if (!value || typeof value !== "object") return false;
    const report = value as Partial<CertificateDoctorReport>;
    return (
        report.schemaVersion === 1 &&
        !!report.summary &&
        typeof report.summary.roles === "number" &&
        typeof report.summary.ok === "number" &&
        typeof report.summary.warnings === "number" &&
        typeof report.summary.errors === "number" &&
        isArray(report.roles) &&
        isArray(report.overlays) &&
        isArray(report.findings) &&
        isArray(report.checks)
    );
};
