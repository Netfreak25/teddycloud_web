import { Divider, Tabs, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import SettingsDataHandler from "../../../data/SettingsDataHandler";
import { MqttForwardingFilters } from "./MqttForwardingFilters";
import { SettingsOptionItem } from "./SettingsOptionItem";
import {
    BoxGeneration,
    getSettingDependency,
    getSettingsSection,
    isSettingOverlayEligible,
    SettingScope,
    settingsLayout,
} from "./settingsLayout";

type Props = {
    optionIds: string[];
    overlayId?: string;
    boxGeneration?: BoxGeneration;
};

const MQTT_FORWARD_PREFIX = "mqtt_client_upstream.forward.";
const FALLBACK_SECTION_ID = "global.unclassified";

export const SettingsScopeTabs: React.FC<Props> = ({ optionIds, overlayId, boxGeneration }) => {
    const { t } = useTranslation();
    const [, setRevision] = useState(0);
    const handler = SettingsDataHandler.getInstance();

    useEffect(() => {
        const listener = () => setRevision((revision) => revision + 1);
        handler.addListener(listener);
        return () => handler.removeListener(listener);
    }, [handler]);

    const visibleScopes: SettingScope[] =
        overlayId === undefined
            ? ["global", "tb1", "tb2"]
            : boxGeneration === undefined
              ? ["global"]
              : ["global", boxGeneration];

    const sectionOptions = useMemo(() => {
        const result = new Map<string, string[]>();
        const candidateIds = optionIds.filter(
            (optionId) =>
                optionId !== "core.settings_level" &&
                (overlayId === undefined || isSettingOverlayEligible(optionId)),
        );

        candidateIds.forEach((optionId) => {
            const section = getSettingsSection(optionId);
            const sectionId = section?.id ?? FALLBACK_SECTION_ID;
            const current = result.get(sectionId) ?? [];
            current.push(optionId);
            result.set(sectionId, current);
        });

        return result;
    }, [optionIds, overlayId]);

    const isDependencyDisabled = (optionId: string) => {
        const dependency = getSettingDependency(optionId);
        const dependencyApplies =
            dependency?.appliesWhen?.every(
                (condition) => handler.getSetting(condition.setting)?.value === condition.value,
            ) ?? true;
        const enabledWhen = dependency?.enabledWhen ?? true;
        const disabled =
            dependency !== undefined &&
            dependencyApplies &&
            handler.getSetting(dependency.master)?.value !== enabledWhen;

        return disabled;
    };

    const renderSetting = (optionId: string) => {
        const disabled = isDependencyDisabled(optionId);

        return (
            <SettingsOptionItem
                key={optionId}
                noOverlay={overlayId === undefined}
                iD={optionId}
                overlayId={overlayId}
                disabled={disabled}
            />
        );
    };

    const renderSection = (sectionId: string, optionIdsInSection: string[]) => {
        const section = settingsLayout.sections.find((candidate) => candidate.id === sectionId);
        const order = section?.order ?? [];
        const orderedIds = [...optionIdsInSection].sort((left, right) => {
            const leftIndex = order.indexOf(left);
            const rightIndex = order.indexOf(right);
            if (leftIndex === -1 && rightIndex === -1) return 0;
            if (leftIndex === -1) return 1;
            if (rightIndex === -1) return -1;
            return leftIndex - rightIndex;
        });
        const mqttForwardingIds = orderedIds.filter((id) => id.startsWith(MQTT_FORWARD_PREFIX));
        const standardIds = orderedIds.filter((id) => !id.startsWith(MQTT_FORWARD_PREFIX));
        const renderedDependencies = new Set<string>();

        return (
            <section key={sectionId} style={{ width: "100%", minWidth: 0 }}>
                <Divider titlePlacement="start" plain>
                    {section ? t(section.labelKey) : t("settings.scopeSections.unclassified")}
                </Divider>
                {standardIds.map((optionId) => {
                    const dependency = getSettingDependency(optionId);
                    if (dependency?.hideWhenDisabled && isDependencyDisabled(optionId)) {
                        return null;
                    }
                    const showDependencyHeading =
                        dependency !== undefined &&
                        dependency.showHeading !== false &&
                        !renderedDependencies.has(dependency.master);
                    if (dependency !== undefined) renderedDependencies.add(dependency.master);

                    return (
                        <div key={optionId}>
                            {showDependencyHeading && (
                                <Typography.Title level={5} style={{ margin: "8px 0 12px" }}>
                                    {t(dependency.labelKey)}
                                </Typography.Title>
                            )}
                            {renderSetting(optionId)}
                        </div>
                    );
                })}
                {mqttForwardingIds.length > 0 && (
                    <MqttForwardingFilters optionIds={mqttForwardingIds} overlayId={overlayId} />
                )}
            </section>
        );
    };

    const tabItems = visibleScopes.map((scope) => {
        const sections = settingsLayout.sections
            .filter((section) => section.scope === scope)
            .map((section) => ({ section, ids: sectionOptions.get(section.id) ?? [] }))
            .filter(({ ids }) => ids.length > 0);
        const fallbackIds =
            scope === "global" ? (sectionOptions.get(FALLBACK_SECTION_ID) ?? []) : [];

        return {
            key: scope,
            label: scope === "global" ? t("settings.scopeTabs.global") : scope.toUpperCase(),
            children: (
                <div style={{ width: "100%", minWidth: 0, overflow: "hidden" }}>
                    {sections.map(({ section, ids }) => renderSection(section.id, ids))}
                    {fallbackIds.length > 0 && renderSection(FALLBACK_SECTION_ID, fallbackIds)}
                </div>
            ),
        };
    });

    return <Tabs items={tabItems} style={{ width: "100%", minWidth: 0 }} />;
};
