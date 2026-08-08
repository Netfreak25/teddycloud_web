import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Modal, Radio, Space, Typography } from "antd";
import { useTranslation } from "react-i18next";

import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { useTeddyCloud } from "../../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { CertificateDragNDrop } from "../../../common/form/CertificatesDragAndDrop";

const api = new TeddyCloudApi(defaultAPIConfig());
const { Paragraph, Text } = Typography;

type CertificateGeneration = "tb1" | "tb2";

interface CertificatesModalProps {
    open: boolean;
    tonieboxName?: string;
    overlayId?: string;
    recommendedGeneration?: CertificateGeneration;
    onOk: () => void;
    onCancel: () => void;
}

const appendBoxId = (basePath: string, overlayId?: string) => {
    if (!basePath || !overlayId) return basePath;

    const separator = basePath.includes("\\") ? "\\" : "/";
    return `${basePath.replace(/[\\/]+$/, "")}${separator}${overlayId.toLowerCase()}`;
};

export const CertificatesModal: React.FC<CertificatesModalProps> = ({
    open,
    tonieboxName,
    overlayId,
    recommendedGeneration,
    onOk,
    onCancel,
}) => {
    const { t } = useTranslation();
    const { addNotification } = useTeddyCloud();
    const [generation, setGeneration] = useState<CertificateGeneration | undefined>();
    const [certDirectories, setCertDirectories] = useState({ tb1: "", tb2: "" });
    const [loading, setLoading] = useState(false);
    const [savingGeneration, setSavingGeneration] = useState(false);

    useEffect(() => {
        if (!open) return;

        let cancelled = false;
        setLoading(true);

        const readSetting = async (setting: string, overlay?: string) => {
            const response = await api.apiGetTeddyCloudSettingRaw(setting, overlay);
            return (await response.text()).trim();
        };

        Promise.all([
            readSetting("core.certdir"),
            readSetting("core.certdir_tb2"),
            overlayId ? readSetting("toniebox.boxGeneration", overlayId) : Promise.resolve("1"),
        ])
            .then(([tb1Directory, tb2Directory, generationValue]) => {
                if (cancelled) return;
                setCertDirectories({ tb1: tb1Directory, tb2: tb2Directory });
                setGeneration(
                    generationValue === "2" ? "tb2" : generationValue === "1" ? "tb1" : undefined,
                );
            })
            .catch((error) => {
                if (cancelled) return;
                addNotification(
                    NotificationTypeEnum.Error,
                    t("settings.errorWhileSavingConfig"),
                    String(error),
                    t("tonieboxes.navigationTitle"),
                );
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [addNotification, open, overlayId, t]);

    const targetPath = useMemo(() => {
        if (!generation) return "";
        return appendBoxId(certDirectories[generation], overlayId);
    }, [certDirectories, generation, overlayId]);

    const updateGeneration = async (nextGeneration: CertificateGeneration) => {
        if (!overlayId || nextGeneration === generation || savingGeneration) return;

        const previousGeneration = generation;
        setGeneration(nextGeneration);
        setSavingGeneration(true);
        try {
            await api.apiPostTeddyCloudSetting(
                "toniebox.boxGeneration",
                nextGeneration === "tb2" ? 2 : 1,
                overlayId,
            );
            await api.apiTriggerWriteConfigGet();
        } catch (error) {
            setGeneration(previousGeneration);
            addNotification(
                NotificationTypeEnum.Error,
                t("settings.errorWhileSavingConfig"),
                t("settings.errorWhileSavingConfigDetails") + error,
                t("tonieboxes.navigationTitle"),
            );
        } finally {
            setSavingGeneration(false);
        }
    };

    const recommendTb2 =
        overlayId !== undefined && recommendedGeneration === "tb2" && generation !== "tb2";
    const uploadDisabled = loading || savingGeneration || generation === undefined;

    return (
        <Modal
            title={t("tonieboxes.uploadTonieboxCertificatesModal.uploadTonieboxCertificates", {
                name: tonieboxName ? ' "' + tonieboxName + '"' : "",
            })}
            open={open}
            onOk={onOk}
            onCancel={onCancel}
            okButtonProps={{ disabled: savingGeneration }}
        >
            {overlayId && (
                <Space direction="vertical" size="middle" style={{ width: "100%" }}>
                    <div>
                        <Text strong>
                            {t("tonieboxes.uploadTonieboxCertificatesModal.boxType")}
                        </Text>
                        <br />
                        <Radio.Group
                            value={generation}
                            disabled={loading || savingGeneration}
                            onChange={(event) =>
                                void updateGeneration(event.target.value as CertificateGeneration)
                            }
                            optionType="button"
                            buttonStyle="solid"
                            options={[
                                { label: "TB1", value: "tb1" },
                                { label: "TB2", value: "tb2" },
                            ]}
                        />
                    </div>

                    {recommendTb2 && (
                        <Alert
                            type="info"
                            showIcon
                            title={t("tonieboxes.uploadTonieboxCertificatesModal.tb2Recommended")}
                            description={t(
                                "tonieboxes.uploadTonieboxCertificatesModal.tb2RecommendedDescription",
                            )}
                            action={
                                <Button
                                    size="small"
                                    type="primary"
                                    disabled={savingGeneration}
                                    onClick={() => void updateGeneration("tb2")}
                                >
                                    {t("tonieboxes.uploadTonieboxCertificatesModal.useTb2")}
                                </Button>
                            }
                        />
                    )}
                </Space>
            )}

            <Paragraph style={{ marginTop: 16 }}>
                {targetPath && (
                    <>
                        {t("tonieboxes.uploadTonieboxCertificatesModal.uploadPath")}{" "}
                        <i>{targetPath}</i>
                    </>
                )}
            </Paragraph>

            <CertificateDragNDrop
                overlay={overlayId}
                generation={generation}
                disabled={uploadDisabled}
                confirmationScope={`${open}:${generation ?? "unknown"}`}
            />
        </Modal>
    );
};
