import SettingsDataHandler from "../../../data/SettingsDataHandler";
import { useTranslation } from "react-i18next";
import { Typography } from "antd";
import { SettingsInputField } from "./SettingsInputField";
import { SettingsInputNumberField } from "./SettingsInputNumberField";
import { SettingsSwitchField } from "./SettingsSwitchField";
import { getTb2SettingAccess } from "../../../utils/tb2SettingsAuthority";

interface SettingsOptionItem {
    iD: string;
    noOverlay?: boolean;
    overlayId?: string;
    disabled?: boolean;
}

const isTb2CertificateSetting = (settingId: string): boolean =>
    settingId === "core.certdir_tb2" ||
    settingId.startsWith("core.server_cert_tb2.") ||
    settingId.startsWith("core.client_cert_tb2.");

const removeRedundantTb2Suffix = (value: string): string => value.replace(/\s*\(TB2\)\s*$/, "");

export const SettingsOptionItem: React.FC<SettingsOptionItem> = (props) => {
    const { t } = useTranslation();
    const { iD } = props;
    const handler = SettingsDataHandler.getInstance();
    const option = handler.getSetting(props.iD);

    const overlayedProp = props.noOverlay ? undefined : option?.overlayed;

    if (option !== undefined) {
        const { type, label, description } = option;
        const access = getTb2SettingAccess(option, (id) => handler.getSetting(id));
        const disabled = access.disabled || props.disabled;
        const fallbackLabel = isTb2CertificateSetting(iD) ? removeRedundantTb2Suffix(label) : label;
        const fallbackDescription = isTb2CertificateSetting(iD)
            ? removeRedundantTb2Suffix(description)
            : description;
        const translationId = iD.replaceAll(".", "__");
        const displayLabel = t(`settings.optionText.${translationId}.label`, {
            defaultValue: fallbackLabel,
        });
        const translatedDescription = t(`settings.optionText.${translationId}.description`, {
            defaultValue: fallbackDescription,
        });
        const displayDescription = access.cloudManaged
            ? `${translatedDescription} ${t("settings.cloudAuthority.locked")} ${t(
                  `settings.cloudAuthority.state.${access.cloudSettingsState}`,
              )}`
            : translatedDescription;

        return (
            <div key={iD}>
                {type === "bool" && (
                    <SettingsSwitchField
                        name={iD}
                        label={displayLabel}
                        description={displayDescription}
                        disabled={disabled}
                        overlayed={overlayedProp}
                        overlayId={props.overlayId}
                    />
                )}
                {type === "int" && (
                    <SettingsInputNumberField
                        name={iD}
                        label={displayLabel}
                        description={displayDescription}
                        overlayed={overlayedProp}
                        overlayId={props.overlayId}
                        disabled={disabled}
                    />
                )}
                {type === "uint" && (
                    <SettingsInputNumberField
                        name={iD}
                        label={displayLabel}
                        description={displayDescription}
                        overlayed={overlayedProp}
                        overlayId={props.overlayId}
                        disabled={disabled}
                    />
                )}
                {type === "string" && (
                    <SettingsInputField
                        name={iD}
                        label={displayLabel}
                        description={displayDescription}
                        overlayed={props.noOverlay ? undefined : option?.overlayed}
                        overlayId={props.overlayId}
                        disabled={disabled}
                    />
                )}
                {access.cloudManaged && (
                    <Typography.Paragraph
                        type="secondary"
                        style={{ marginTop: -16, marginBottom: 16, fontSize: 12 }}
                    >
                        {t(`settings.cloudAuthority.state.${access.cloudSettingsState}`)}
                    </Typography.Paragraph>
                )}
            </div>
        );
    } else {
        console.warn("No option found for iD ", iD);
        return <></>;
    }
};
