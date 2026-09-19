import { Collapse, Table } from "antd";
import type { TableColumnsType } from "antd";
import { useTranslation } from "react-i18next";
import type { BoxGeneration } from "./settingsLayout";

type Props = {
    generation: Exclude<BoxGeneration, undefined>;
};

type BehaviourRow = {
    key: string;
    cloud: string;
    cache: string;
    local: string;
    behaviour: string;
};

export const OtaSettingsHelp: React.FC<Props> = ({ generation }) => {
    const { t } = useTranslation();
    const provider = t(`settings.otaHelp.providers.${generation}`);
    const state = (value: "on" | "off" | "either") => t(`settings.otaHelp.states.${value}`);

    const rows: BehaviourRow[] = [
        {
            key: "direct",
            cloud: state("on"),
            cache: state("off"),
            local: state("either"),
            behaviour: t("settings.otaHelp.rows.direct", { provider }),
        },
        {
            key: "cacheOnly",
            cloud: state("on"),
            cache: state("on"),
            local: state("off"),
            behaviour: t("settings.otaHelp.rows.cacheOnly"),
        },
        {
            key: "cacheAndServe",
            cloud: state("on"),
            cache: state("on"),
            local: state("on"),
            behaviour: t("settings.otaHelp.rows.cacheAndServe"),
        },
        {
            key: "offlineLocal",
            cloud: state("off"),
            cache: state("either"),
            local: state("on"),
            behaviour: t("settings.otaHelp.rows.offlineLocal"),
        },
        {
            key: "disabled",
            cloud: state("off"),
            cache: state("either"),
            local: state("off"),
            behaviour: t("settings.otaHelp.rows.disabled"),
        },
    ];

    const columns: TableColumnsType<BehaviourRow> = [
        {
            title: t("settings.otaHelp.columns.cloud"),
            dataIndex: "cloud",
            width: 120,
        },
        {
            title: t("settings.otaHelp.columns.cache"),
            dataIndex: "cache",
            width: 150,
        },
        {
            title: t("settings.otaHelp.columns.local"),
            dataIndex: "local",
            width: 160,
        },
        {
            title: t("settings.otaHelp.columns.behaviour"),
            dataIndex: "behaviour",
        },
    ];

    return (
        <Collapse
            size="small"
            style={{ marginTop: 12 }}
            items={[
                {
                    key: "ota-help",
                    label: t("settings.otaHelp.title"),
                    children: (
                        <>
                            <Table
                                columns={columns}
                                dataSource={rows}
                                pagination={false}
                                size="small"
                                scroll={{ x: 720 }}
                            />
                            <ul style={{ marginBottom: 0, marginTop: 12, paddingInlineStart: 20 }}>
                                <li>{t("settings.otaHelp.notes.cacheOnly")}</li>
                                <li>{t("settings.otaHelp.notes.generation")}</li>
                                <li>{t(`settings.otaHelp.notes.discovery.${generation}`)}</li>
                                <li>{t(`settings.otaHelp.notes.master.${generation}`)}</li>
                                <li>{t("settings.otaHelp.notes.files")}</li>
                            </ul>
                        </>
                    ),
                },
            ]}
        />
    );
};
