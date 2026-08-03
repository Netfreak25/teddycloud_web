import { Checkbox, Switch } from "antd";
import FormItem from "antd/es/form/FormItem";
import { useField } from "formik";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsDataHandler from "../../../data/SettingsDataHandler";

type SwitchFieldProps = {
    name: string;
    label?: string;
    description?: string;
    disabled?: boolean;
    overlayed?: boolean;
    overlayId?: string;
};

export const SettingsSwitchField: React.FC<SwitchFieldProps> = (props) => {
    const { t } = useTranslation();
    const { name, label, description, disabled, overlayed: initialOverlayed } = props;
    const [field, meta] = useField(name!);
    const [overlayed, setOverlayed] = useState<boolean | undefined>(initialOverlayed); // State to track overlayed boolean

    const [fieldValue, setFieldValue] = useState(
        SettingsDataHandler.getInstance().getSetting(name)?.value,
    );

    const hasFeedback = !!(meta.touched && meta.error);
    const help = meta.touched && meta.error && t(meta.error);
    const validateStatus = meta.touched && meta.error ? "error" : undefined;
    const idListener = useCallback(() => {
        const setting = SettingsDataHandler.getInstance().getSetting(name);
        setFieldValue(setting?.value);
        setOverlayed(initialOverlayed !== undefined ? setting?.overlayed : undefined);
    }, [initialOverlayed, name]);

    useEffect(() => {
        const handler = SettingsDataHandler.getInstance();
        handler.addIdListener(idListener, name);
        return () => handler.removeIdListener(idListener);
    }, [idListener, name]);

    let value = fieldValue as boolean;

    return (
        <FormItem
            help={hasFeedback ? help : undefined}
            validateStatus={validateStatus}
            label={<span style={{ textWrap: "auto", lineHeight: "1.2" }}>{label}</span>}
            tooltip={description}
        >
            <Switch
                {...field}
                checked={value}
                onChange={(value) => {
                    SettingsDataHandler.getInstance().changeSetting(name, value, overlayed);
                    setFieldValue(SettingsDataHandler.getInstance().getSetting(name)?.value);
                }}
                disabled={disabled || (!overlayed && overlayed !== undefined)}
            />
            {overlayed === undefined ? (
                ""
            ) : (
                <Checkbox
                    checked={overlayed}
                    disabled={disabled}
                    style={{ marginLeft: "16px" }}
                    onChange={(changeEventHandler) => {
                        SettingsDataHandler.getInstance().changeSettingOverlayed(
                            name,
                            changeEventHandler.target.checked,
                        );
                        setOverlayed(SettingsDataHandler.getInstance().getSetting(name)?.overlayed);
                    }}
                    key="overlayCheckBox"
                >
                    {t("settings.overlayed")}
                </Checkbox>
            )}
        </FormItem>
    );
};
