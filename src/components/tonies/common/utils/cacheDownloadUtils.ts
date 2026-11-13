import type { V3RefreshTarget } from "../../../../types/tonieTypes";

/** Only accepted, unfinished targets need status polling. */
export const isV3RefreshPending = (target: V3RefreshTarget): boolean =>
    target.accepted && (target.state === "queued" || target.state === "running");

/** Translate server reason keys, retaining unknown diagnostics from newer backends. */
export const cacheDownloadReason = (
    reason: string | undefined,
    t: (key: string, options?: Record<string, unknown>) => string,
): string => (reason ? t(`tonies.cacheDownload.reasons.${reason}`, { defaultValue: reason }) : "");
