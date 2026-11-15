import type { ContentPlaylist, TonieCardProps } from "../../types/tonieTypes";

/** Empty slots remain positional: a missing title must never shift subsequent chapters. */
export const mergeChapterTitles = (count: number, ...sources: (string[] | undefined)[]): string[] =>
    Array.from({ length: count }, (_, index) => {
        for (const source of sources) {
            const title = source?.length === count ? source[index] : undefined;
            if (typeof title === "string" && title.trim()) return title.trim();
        }
        return "";
    });

export const knownDuration = (value: unknown): value is number =>
    typeof value === "number" && Number.isFinite(value) && value >= 0;

/** Sum unrounded values only when every chapter belongs to this known structure. */
export const playlistTotalSeconds = (playlist?: ContentPlaylist): number | undefined => {
    const count = playlist?.chapterCount;
    const durations = playlist?.durations;
    if (!count || durations?.length !== count || !durations.every(knownDuration)) return undefined;
    const total = durations.reduce<number>((sum, duration) => sum + duration!, 0);
    return Number.isFinite(total) ? total : undefined;
};

/** Preserve fractional seconds; null means unknown, not a zero-length chapter. */
export const mergeChapterDurations = (
    count: number,
    ...sources: ((number | null)[] | undefined)[]
): (number | null)[] =>
    Array.from({ length: count }, (_, index) => {
        for (const source of sources) {
            const duration = source?.length === count ? source[index] : undefined;
            if (knownDuration(duration)) return duration;
        }
        return null;
    });

/** Version mismatches must not decorate an older playing version with the active cache's data. */
export const matchingNativePlaylist = (
    playlist?: ContentPlaylist,
    contentVersion?: number | null,
): ContentPlaylist | undefined => {
    if (playlist?.kind !== "native_collection") return undefined;
    if (contentVersion != null && playlist.contentVersion !== contentVersion) return undefined;
    return playlist;
};

/** Figure catalog names are never evidence of a native chapter count. */
export const resolvePlaybackTracks = (
    tonie?: TonieCardProps,
    nativePlayback = false,
    contentVersion?: number | null,
): string[] => {
    const playlist = tonie?.playlist;
    if (playlist) {
        if (
            playlist.kind === "native_collection" &&
            !matchingNativePlaylist(playlist, contentVersion)
        ) {
            return [];
        }
        const count = playlist.chapterCount;
        return typeof count === "number" && Number.isSafeInteger(count) && count >= 0
            ? playlist.kind === "native_collection"
                ? mergeChapterTitles(count, playlist.tracks)
                : Array.from({ length: count }, (_, index) => playlist.tracks[index]?.trim() || "")
            : [];
    }
    if (nativePlayback) return [];
    const sourceTracks = tonie?.sourceInfo?.tracks ?? [];
    const figureTracks = tonie?.tonieInfo?.tracks ?? [];
    if (tonie?.source?.trim()) {
        const count = tonie.trackSeconds.length || sourceTracks.length;
        return Array.from({ length: count }, (_, index) => sourceTracks[index]?.trim() || "");
    }
    const count = Math.max(
        sourceTracks.length,
        figureTracks.length,
        tonie?.trackSeconds.length ?? 0,
    );
    return Array.from(
        { length: count },
        (_, index) => sourceTracks[index]?.trim() || figureTracks[index]?.trim() || "",
    );
};
