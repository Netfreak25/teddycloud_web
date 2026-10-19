import { TonieCardProps } from "../../types/tonieTypes";
import { resolveTonieDisplayPicture } from "../../components/tonies/common/utils/imagePathUtils";
import {
    buildLibraryFileUrl,
    isNativeCollectionSource,
    loadNativeCollectionFromSource,
    NativeAudio,
    nativeAudioToPlaybackItem,
} from "./nativeCollection";

/** Respect assigned sources; otherwise mirror the original-cache fallback without changing it. */
export const usesNativeTonieAudio = (tonie: TonieCardProps): boolean => {
    if (tonie.source?.trim()) return isNativeCollectionSource(tonie.source);
    const cache = tonie.cacheState;
    if (!cache?.v3Complete || (!cache.v3Source && tonie.playlist?.kind !== "native_collection")) {
        return false;
    }
    const preferred =
        tonie.cachePreference === "auto" || !tonie.cachePreference
            ? cache.preferredOriginalKind
            : tonie.cachePreference;
    return preferred === "v3" || !cache.tafComplete;
};

export const loadTonieNativePlaybackItem = async (
    tonie: TonieCardProps,
    overlay: string,
    fallbackTrackTitle?: (number: number) => string,
) => {
    if (!usesNativeTonieAudio(tonie)) throw new Error("No native audio selected");
    const source = tonie.source?.trim() || tonie.cacheState?.v3Source;
    let audio: NativeAudio;
    if (source) {
        const collection = await loadNativeCollectionFromSource(source, overlay);
        audio = {
            id: collection.contentHash,
            chapters: collection.chapters.map((chapter) => ({
                index: chapter.index,
                url: buildLibraryFileUrl(chapter.path, overlay),
                size: chapter.fileSize,
            })),
        };
    } else {
        const params = new URLSearchParams({ overlay });
        const base = import.meta.env.VITE_APP_TEDDYCLOUD_API_URL || "";
        const response = await fetch(
            `${base}/api/content/native/${encodeURIComponent(tonie.ruid)}?${params}`,
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (
            !Number.isInteger(payload.contentVersion) ||
            !Array.isArray(payload.chapters) ||
            !payload.chapters.length
        ) {
            throw new Error("Invalid native audio response");
        }
        audio = {
            id: `native:${overlay}:${tonie.ruid}:${payload.contentVersion}`,
            chapters: payload.chapters.map(
                (chapter: NativeAudio["chapters"][number], index: number) => {
                    if (
                        chapter.index !== index ||
                        typeof chapter.url !== "string" ||
                        !chapter.url.startsWith("/api/content/native/") ||
                        !Number.isInteger(chapter.size) ||
                        chapter.size < 0
                    ) {
                        throw new Error("Invalid native audio chapter");
                    }
                    return { ...chapter, url: `${base}${chapter.url}` };
                },
            ),
        };
    }
    const tracks = [tonie.playlist?.tracks, tonie.sourceInfo?.tracks, tonie.tonieInfo.tracks].find(
        (titles) =>
            titles?.length === audio.chapters.length && titles.every((title) => title.trim()),
    );
    return nativeAudioToPlaybackItem(audio, {
        title: tonie.playlist?.title || tonie.sourceInfo?.series || tonie.tonieInfo.series,
        subtitle: tonie.sourceInfo?.episode || tonie.tonieInfo.episode,
        picture:
            tonie.sourceInfo?.picture ||
            resolveTonieDisplayPicture(tonie.customImage, tonie.tonieInfo.picture),
        tracks,
        fallbackTrackTitle,
    });
};
