import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { TeddyCloudApi } from "../../../../api";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { TonieCardProps } from "../../../../types/tonieTypes";
import { cacheDownloadReason } from "../../common/utils/cacheDownloadUtils";

const api = new TeddyCloudApi(defaultAPIConfig());

type UseTonieCardActionsParams = {
    tonieCard: TonieCardProps;
    overlay: string;
    modelTitle: string;
    t: (key: string, options?: Record<string, unknown>) => string;
    addNotification: (
        type: NotificationTypeEnum,
        title: string,
        description: string,
        context?: string,
    ) => void;
    addLoadingNotification: (key: string, title: string, description?: string) => void;
    closeLoadingNotification: (key: string) => void;
    fetchUpdatedTonieCard: () => Promise<void>;
};

export const useTonieCardActions = ({
    tonieCard,
    overlay,
    modelTitle,
    t,
    addNotification,
    addLoadingNotification,
    closeLoadingNotification,
    fetchUpdatedTonieCard,
}: UseTonieCardActionsParams) => {
    const [submitted, setSubmitted] = useState(false);
    const statuses = Object.values(tonieCard.cacheState?.download || {});
    const active = statuses.some(({ state }) => state === "queued" || state === "running");
    const downloadPending = submitted || active;
    const refreshRef = useRef(fetchUpdatedTonieCard);
    refreshRef.current = fetchUpdatedTonieCard;
    useEffect(() => {
        if (statuses.length && !active) setSubmitted(false);
    }, [tonieCard.cacheState?.download, active]);
    useEffect(() => {
        if (!downloadPending) return;
        let refreshing = false;
        const timer = window.setInterval(async () => {
            if (refreshing) return;
            refreshing = true;
            try {
                await refreshRef.current();
            } finally {
                refreshing = false;
            }
        }, 1500);
        return () => window.clearInterval(timer);
    }, [downloadPending]);
    const notifySuccess = (message: string, description: string) => {
        addNotification(NotificationTypeEnum.Success, message, description, t("tonies.title"));
    };

    const notifyError = (message: string, description: string, error?: unknown) => {
        addNotification(
            NotificationTypeEnum.Error,
            message,
            `${description}${error ?? ""}`,
            t("tonies.title"),
        );
    };

    const handleLiveClick = async () => {
        try {
            const nextLive = !tonieCard.live;
            await api.apiPostTeddyCloudContentJson(tonieCard.ruid, "live=" + nextLive, overlay);

            if (nextLive) {
                notifySuccess(
                    t("tonies.messages.liveEnabled"),
                    t("tonies.messages.liveEnabledDetails", {
                        model: modelTitle,
                        ruid: tonieCard.ruid,
                    }).replace(' "" ', " "),
                );
            } else {
                notifySuccess(
                    t("tonies.messages.liveDisabled"),
                    t("tonies.messages.liveDisabledDetails", {
                        model: modelTitle,
                        ruid: tonieCard.ruid,
                    }).replace(' "" ', " "),
                );
            }

            await fetchUpdatedTonieCard();
        } catch (error) {
            notifyError(
                t("tonies.messages.couldNotChangeLiveFlag"),
                t("tonies.messages.couldNotChangeLiveFlagDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', ""),
                error,
            );
        }
    };

    const handleNoCloudClick = async () => {
        try {
            const nextNoCloud = !tonieCard.nocloud;
            await api.apiPostTeddyCloudContentJson(
                tonieCard.ruid,
                "nocloud=" + nextNoCloud,
                overlay,
            );

            if (nextNoCloud) {
                notifySuccess(
                    t("tonies.messages.cloudAccessBlocked"),
                    t("tonies.messages.cloudAccessBlockedDetails", {
                        model: modelTitle,
                        ruid: tonieCard.ruid,
                    }).replace(' "" ', " "),
                );
            } else {
                notifySuccess(
                    t("tonies.messages.cloudAccessEnabled"),
                    t("tonies.messages.cloudAccessEnabledDetails", {
                        model: modelTitle,
                        ruid: tonieCard.ruid,
                    }).replace(' "" ', " "),
                );
            }

            await fetchUpdatedTonieCard();
        } catch (error) {
            notifyError(
                t("tonies.messages.couldNotChangeCloudFlag"),
                t("tonies.messages.couldNotChangeCloudFlagDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', ""),
                error,
            );
        }
    };

    const handleBackgroundDownload = async () => {
        if (!tonieCard.downloadTriggerUrl || downloadPending) return;

        const key = "loading" + tonieCard.ruid;
        setSubmitted(true);
        try {
            addLoadingNotification(
                key,
                t("tonies.messages.downloading"),
                t("tonies.messages.downloadingDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', " "),
            );

            // System audio retains its existing endpoint; the worker accepts only content tags.
            const systemTonie = tonieCard.ruid.startsWith("0000000");
            const response = systemTonie
                ? await api.apiGetTeddyCloudApiRaw(tonieCard.downloadTriggerUrl)
                : await api.apiPostTeddyCloudRaw(
                      `/api/content/cache/${encodeURIComponent(tonieCard.ruid)}`,
                      "",
                      overlay,
                  );
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(
                    cacheDownloadReason(result.error, t) ||
                        result.message ||
                        `HTTP ${response.status}`,
                );
            }
            if (systemTonie) {
                await response.blob();
                setSubmitted(false);
                notifySuccess(
                    t("tonies.messages.downloadedFile"),
                    t("tonies.messages.downloadedFileDetails", {
                        model: modelTitle,
                        ruid: tonieCard.ruid,
                    }),
                );
            } else {
                notifySuccess(
                    t("tonies.cacheDownload.accepted"),
                    t("tonies.cacheDownload.acceptedDetails"),
                );
            }
        } catch (error) {
            setSubmitted(false);
            closeLoadingNotification(key);
            notifyError(
                t("tonies.messages.errorDuringDownload"),
                t("tonies.messages.errorDuringDownloadDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', ""),
                error,
            );
            return;
        }

        closeLoadingNotification(key);
        try {
            await fetchUpdatedTonieCard();
        } catch (error) {
            notifyError(
                t("tonies.messages.errorFetchingUpdatedCard"),
                t("tonies.messages.errorFetchingUpdatedCardDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }),
                error,
            );
        }
    };

    return {
        handleLiveClick,
        handleNoCloudClick,
        handleBackgroundDownload,
        downloadPending,
    };
};
import { useEffect, useRef, useState } from "react";
