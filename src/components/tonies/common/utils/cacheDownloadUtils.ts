/** Translate server reason keys, retaining unknown diagnostics from newer backends. */
export const cacheDownloadReason = (
    reason: string | undefined,
    t: (key: string, options?: Record<string, unknown>) => string,
): string => (reason ? t(`tonies.cacheDownload.reasons.${reason}`, { defaultValue: reason }) : "");
