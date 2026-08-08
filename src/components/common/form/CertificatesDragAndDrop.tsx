import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Upload, UploadFile } from "antd";
import type { UploadProps } from "antd";

import { InboxOutlined } from "@ant-design/icons";

import { ApiUploadCertPostRequest, ResponseError, TeddyCloudApi } from "../../../api";
import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import { useTeddyCloud } from "../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../types/teddyCloudNotificationTypes";

const api = new TeddyCloudApi(defaultAPIConfig());

interface CertificateDragNDropProps {
    overlay?: string;
    generation?: "tb1" | "tb2";
    disabled?: boolean;
    confirmationScope?: string;
}

type CustomRequestOptions = Parameters<NonNullable<UploadProps["customRequest"]>>[0];

export const CertificateDragNDrop: React.FC<CertificateDragNDropProps> = ({
    overlay,
    generation,
    disabled = false,
    confirmationScope,
}) => {
    const { t } = useTranslation();
    const { addNotification, setFetchCloudStatus } = useTeddyCloud();
    const overwriteApproved = useRef(false);
    const overwriteConfirmation = useRef<Promise<boolean> | null>(null);

    useEffect(() => {
        overwriteApproved.current = false;
        overwriteConfirmation.current = null;
    }, [confirmationScope, generation]);

    const navigationTitle = overlay
        ? t("tonieboxes.navigationTitle")
        : t("settings.navigationTitle");

    const triggerWriteConfig = async () => {
        try {
            await api.apiTriggerWriteConfigGet();
        } catch (e) {
            addNotification(
                NotificationTypeEnum.Error,
                t("settings.errorWhileSavingConfig"),
                t("settings.errorWhileSavingConfigDetails") + e,
                navigationTitle,
            );
        }
    };

    const confirmOverwrite = () => {
        if (overwriteConfirmation.current === null) {
            overwriteConfirmation.current = new Promise<boolean>((resolve) => {
                Modal.confirm({
                    title: t("settings.certificates.overwriteTitle"),
                    content: t("settings.certificates.overwriteDescription"),
                    okText: t("settings.certificates.overwriteConfirm"),
                    cancelText: t("settings.certificates.overwriteCancel"),
                    onOk: () => resolve(true),
                    onCancel: () => resolve(false),
                });
            });
        }
        return overwriteConfirmation.current;
    };

    const upload = async (payload: ApiUploadCertPostRequest, overwrite: boolean) => {
        await api.apiUploadCertPost(payload, overlay, generation, overwrite);
    };

    const handleUpload = async (file: UploadFile<unknown>): Promise<boolean> => {
        const blob = file as unknown as Blob;

        const payload: ApiUploadCertPostRequest = {
            filename: [blob],
        };

        try {
            try {
                await upload(payload, overwriteApproved.current);
            } catch (error) {
                if (!(error instanceof ResponseError) || error.response.status !== 409) {
                    throw error;
                }

                const approved = await confirmOverwrite();
                if (!approved) {
                    return false;
                }
                overwriteApproved.current = true;
                await upload(payload, true);
            }
            await triggerWriteConfig();

            addNotification(
                NotificationTypeEnum.Success,
                t("settings.certificates.uploadSuccessful"),
                t("settings.certificates.uploadSuccessfulDetails", {
                    filename: file.name,
                }),
                navigationTitle,
            );
            setFetchCloudStatus((prev) => !prev);
            return true;
        } catch (err) {
            addNotification(
                NotificationTypeEnum.Error,
                t("settings.certificates.uploadFailed"),
                t("settings.certificates.uploadFailedDetails", {
                    filename: file.name,
                }) +
                    ": " +
                    err,
                navigationTitle,
            );
            throw err;
        }
    };

    const props = {
        name: "file",
        multiple: true,
        beforeUpload: (file: UploadFile<unknown>) => {
            if (file.type !== "application/x-x509-ca-cert" && !file.name.endsWith(".der")) {
                addNotification(
                    NotificationTypeEnum.Error,
                    t("settings.certificates.uploadFailed"),
                    t("settings.certificates.uploadFailedDetails", {
                        filename: file.name,
                    }) +
                        ": " +
                        t("settings.certificates.invalidFileType"),
                    navigationTitle,
                );
                return Upload.LIST_IGNORE;
            }
            return true;
        },
        customRequest: async (options: CustomRequestOptions) => {
            const { onSuccess, onError, file } = options;
            try {
                const uploaded = await handleUpload(file as UploadFile<unknown>);
                if (uploaded) {
                    onSuccess && onSuccess("OK");
                } else {
                    onError && onError(new Error("Certificate overwrite cancelled"));
                }
            } catch (error) {
                onError && onError(error as Error);
            }
        },
        disabled,
    };

    return (
        <Upload.Dragger {...props}>
            <p className="ant-upload-drag-icon">
                <InboxOutlined />
            </p>
            <p className="ant-upload-text">{t("settings.certificates.uploadText")}</p>
            <p className="ant-upload-hint">{t("settings.certificates.uploadHint")}</p>
        </Upload.Dragger>
    );
};
