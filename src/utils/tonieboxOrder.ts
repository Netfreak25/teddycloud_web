import { arrayMove } from "@dnd-kit/sortable";

const STORAGE_KEY_PREFIX = "teddycloud.tonieboxOrder:v1:";

/** Keep browser-local orders separate for each effective API base, including proxy paths. */
export const getTonieboxOrderStorageKey = (apiBase: string, pageOrigin: string): string => {
    const url = new URL(apiBase || pageOrigin, `${pageOrigin}/`);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return STORAGE_KEY_PREFIX + url.href.replace(/\/+$/, "");
};

/** Malformed or obsolete local preferences must never prevent loading the live box list. */
export const parseTonieboxOrder = (raw: string | null): string[] => {
    try {
        const value: unknown = JSON.parse(raw || "[]");
        return Array.isArray(value)
            ? [
                  ...new Set(
                      value.filter((id): id is string => typeof id === "string" && !!id.trim()),
                  ),
              ]
            : [];
    } catch {
        // Stored preferences are optional; malformed JSON uses the current API order.
        return [];
    }
};

/** Sort current API objects, keeping unsaved boxes in API order and all live references intact. */
export const orderTonieboxes = <T extends { ID: string }>(boxes: T[], order: string[]): T[] => {
    const rank = (box: T) => (order.includes(box.ID) ? order.indexOf(box.ID) : order.length);
    return [...boxes].sort((a, b) => rank(a) - rank(b));
};

/** Move one live box in the effective order; cancelled, stale and unchanged drops are no-ops. */
export const moveTonieboxOrder = (ids: string[], active: string, over: string): string[] | null => {
    const from = ids.indexOf(active);
    const to = ids.indexOf(over);
    return from < 0 || to < 0 || from === to ? null : arrayMove(ids, from, to);
};
