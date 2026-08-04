import SettingsDataHandler from "../../../data/SettingsDataHandler";
import { useTranslation } from "react-i18next";
import { SettingsInputField } from "./SettingsInputField";
import { SettingsInputNumberField } from "./SettingsInputNumberField";
import { SettingsSwitchField } from "./SettingsSwitchField";

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
    const option = SettingsDataHandler.getInstance().getSetting(props.iD);

    const overlayedProp = props.noOverlay ? undefined : option?.overlayed;

    if (option !== undefined) {
        const { type, label, description, readOnly } = option;
        const disabled = readOnly || props.disabled;
        const fallbackLabel = isTb2CertificateSetting(iD) ? removeRedundantTb2Suffix(label) : label;
        const fallbackDescription = isTb2CertificateSetting(iD)
            ? removeRedundantTb2Suffix(description)
            : description;
        const translationId = iD.replaceAll(".", "__");
        const displayLabel = t(`settings.optionText.${translationId}.label`, {
            defaultValue: fallbackLabel,
        });
        const displayDescription = t(`settings.optionText.${translationId}.description`, {
            defaultValue: fallbackDescription,
        });

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
            </div>
        );
    } else {
        console.warn("No option found for iD ", iD);
        return <></>;
    }
};
