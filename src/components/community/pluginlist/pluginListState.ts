export const PLUGIN_PAGE_SIZES = [6, 12, 24, 48];
export const DEFAULT_PLUGIN_LIST_STATE = { pageSize: 12, showAll: false };

/** Keep browser preferences limited to supported values, including older stored data. */
export function normalizePluginListState(value: unknown) {
    const state = value as Partial<typeof DEFAULT_PLUGIN_LIST_STATE> | null;
    return {
        pageSize:
            typeof state?.pageSize === "number" && PLUGIN_PAGE_SIZES.includes(state.pageSize)
                ? state.pageSize
                : DEFAULT_PLUGIN_LIST_STATE.pageSize,
        showAll: state?.showAll === true,
    };
}

/** The hidden-only filter narrows the existing category selection; it never replaces it. */
export function filterPluginList<T extends { teddyCloudSection?: string; hideInNav?: boolean }>(
    plugins: T[],
    sections: string[],
    hiddenOnly: boolean,
    unknownSection: string,
) {
    return plugins.filter(
        (plugin) =>
            sections.includes(plugin.teddyCloudSection || unknownSection) &&
            (!hiddenOnly || plugin.hideInNav === true),
    );
}

/** Clamp the page before slicing so deleting the last item never leaves a blank page. */
export function paginatePlugins<T>(plugins: T[], page: number, pageSize: number, showAll: boolean) {
    const currentPage = Math.max(1, Math.min(page, Math.ceil(plugins.length / pageSize)));
    return {
        currentPage,
        items: showAll
            ? plugins
            : plugins.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    };
}
