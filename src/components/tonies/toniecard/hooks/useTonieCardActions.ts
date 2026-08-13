import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { TeddyCloudApi } from "../../../../api";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { TonieCardProps } from "../../../../types/tonieTypes";

const api = new TeddyCloudApi(defaultAPIConfig());

type V3DownloadResult = {
    success?: boolean;
    sourceAssigned?: boolean;
    source?: string;
    assignmentReason?: string;
    stage?: string;
    message?: string;
};

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
        const path = tonieCard.downloadTriggerUrl;
        if (!path) return;

        const key = "loading" + tonieCard.ruid;
        let v3Result: V3DownloadResult | undefined;

        try {
            addLoadingNotification(
                key,
                t("tonies.messages.downloading"),
                t("tonies.messages.downloadingDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', " "),
            );

            const response = await api.apiGetTeddyCloudApiRaw(path);
            if (tonieCard.downloadTriggerKind === "v3") {
                v3Result = (await response.json()) as V3DownloadResult;
                if (v3Result.success !== true) {
                    const detail = [v3Result.stage, v3Result.message].filter(Boolean).join(": ");
                    throw new Error(detail || "V3 download failed");
                }
            } else {
                await response.blob();
            }
        } catch (error) {
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
        if (v3Result && v3Result.sourceAssigned !== true) {
            notifySuccess(
                t("tonies.messages.downloadedV3CacheOnly"),
                t("tonies.messages.downloadedV3CacheOnlyDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                    reason: v3Result.assignmentReason || "not_assigned",
                }).replace(' "" ', " "),
            );
        } else {
            notifySuccess(
                t("tonies.messages.downloadedFile"),
                t("tonies.messages.downloadedFileDetails", {
                    model: modelTitle,
                    ruid: tonieCard.ruid,
                }).replace(' "" ', " "),
            );
        }

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
    };
};
