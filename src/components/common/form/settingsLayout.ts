import layoutDefinition from "./settingsLayout.json";

export type SettingScope = "global" | "tb1" | "tb2";
export type BoxGeneration = Exclude<SettingScope, "global"> | undefined;

export type SettingsLayoutSection = {
    id: string;
    scope: SettingScope;
    labelKey: string;
    ids?: string[];
    prefixes?: string[];
    order?: string[];
};

type SettingDependency = {
    master: string;
    labelKey: string;
    dependents: string[];
};

type SettingsLayoutDefinition = {
    sections: SettingsLayoutSection[];
    overlay: {
        ids: string[];
        prefixes: string[];
    };
    dependencies: SettingDependency[];
};

export const settingsLayout = layoutDefinition as SettingsLayoutDefinition;

const warnedUnknownSettings = new Set<string>();

const matchesSection = (optionId: string, section: SettingsLayoutSection): boolean =>
    (section.ids?.includes(optionId) ?? false) ||
    (section.prefixes?.some((prefix) => optionId.startsWith(prefix)) ?? false);

export const findSettingsSections = (optionId: string): SettingsLayoutSection[] =>
    settingsLayout.sections.filter((section) => matchesSection(optionId, section));

export const getSettingsSection = (optionId: string): SettingsLayoutSection | undefined => {
    const matches = findSettingsSections(optionId);
    if (matches.length > 1) {
        console.warn(
            `Setting '${optionId}' matches multiple settings layout sections: ${matches
                .map((section) => section.id)
                .join(", ")}`,
        );
    }
    if (matches.length === 0 && !warnedUnknownSettings.has(optionId)) {
        warnedUnknownSettings.add(optionId);
        console.warn(`Unknown setting '${optionId}' is displayed in the Global tab.`);
    }
    return matches[0];
};

export const isSettingOverlayEligible = (optionId: string): boolean =>
    settingsLayout.overlay.ids.includes(optionId) ||
    settingsLayout.overlay.prefixes.some((prefix) => optionId.startsWith(prefix));

export const getSettingDependency = (optionId: string): SettingDependency | undefined =>
    settingsLayout.dependencies.find((dependency) => dependency.dependents.includes(optionId));

export const normalizeBoxGeneration = (
    value: boolean | string | number | undefined,
): BoxGeneration => {
    const normalized = String(value ?? "");
    return normalized === "1" ? "tb1" : normalized === "2" ? "tb2" : undefined;
};
