const STORAGE_KEY_PREFIX = "teddycloud.tonieboxOrder:v1:";

/** Keep browser-local orders separate for each effective API base, including proxy paths. */
export const getTonieboxOrderStorageKey = (apiBase: string, pageOrigin: string): string => {
    const url = new URL(apiBase || pageOrigin, `${pageOrigin}/`);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return STORAGE_KEY_PREFIX + url.href.replace(/\/+$/, "");
};

/** Malformed or obsolete local preferences must never prevent loading the live box list. */
export const parseTonieboxOrder = (raw: string | null): string[] => {
    if (raw === null) return [];
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        // Stored preferences are optional; malformed JSON uses the current API order.
        return [];
    }
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((id): id is string => typeof id === "string" && !!id.trim()))];
};

/** Sort current API objects, keeping unsaved boxes in API order and all live references intact. */
export const orderTonieboxes = <T extends { ID: string }>(boxes: T[], order: string[]): T[] => {
    const positions = new Map<string, number>();
    order.forEach((id, index) => {
        if (!positions.has(id)) positions.set(id, index);
    });
    return [...boxes].sort(
        (left, right) =>
            (positions.get(left.ID) ?? order.length) - (positions.get(right.ID) ?? order.length),
    );
};

/** Move one live box in the effective order; cancelled, stale and unchanged drops are no-ops. */
export const moveTonieboxOrder = (
    boxes: { ID: string }[],
    order: string[],
    activeId: string,
    overId: string,
): string[] | null => {
    const ids = orderTonieboxes(boxes, order).map((box) => box.ID);
    const from = ids.indexOf(activeId);
    const to = ids.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return null;
    ids.splice(from, 1);
    ids.splice(to, 0, activeId);
    return ids;
};
