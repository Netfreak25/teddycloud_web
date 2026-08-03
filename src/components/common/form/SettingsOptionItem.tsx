import SettingsDataHandler from "../../../data/SettingsDataHandler";
import { SettingsInputField } from "./SettingsInputField";
import { SettingsInputNumberField } from "./SettingsInputNumberField";
import { SettingsSwitchField } from "./SettingsSwitchField";

interface SettingsOptionItem {
    iD: string;
    noOverlay?: boolean;
    overlayId?: string;
    disabled?: boolean;
}

export const SettingsOptionItem: React.FC<SettingsOptionItem> = (props) => {
    const { iD } = props;
    const option = SettingsDataHandler.getInstance().getSetting(props.iD);

    const overlayedProp = props.noOverlay ? undefined : option?.overlayed;

    if (option !== undefined) {
        const { type, label, description, readOnly } = option;
        const disabled = readOnly || props.disabled;

        return (
            <div key={iD}>
                {type === "bool" && (
                    <SettingsSwitchField
                        name={iD}
                        label={label}
                        description={description}
                        disabled={disabled}
                        overlayed={overlayedProp}
                        overlayId={props.overlayId}
                    />
                )}
                {type === "int" && (
                    <SettingsInputNumberField
                        name={iD}
                        label={label}
                        description={description}
                        overlayed={overlayedProp}
                        overlayId={props.overlayId}
                        disabled={disabled}
                    />
                )}
                {type === "uint" && (
                    <SettingsInputNumberField
                        name={iD}
                        label={label}
                        description={description}
                        overlayed={overlayedProp}
                        overlayId={props.overlayId}
                        disabled={disabled}
                    />
                )}
                {type === "string" && (
                    <SettingsInputField
                        name={iD}
                        label={label}
                        description={description}
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
