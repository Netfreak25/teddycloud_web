import JSZip from "jszip";
import {
    NativeCollectionSummary,
    Record,
    TonieplayCollectionSummary,
} from "../../types/fileBrowserTypes";
import { AudioPlaybackItem } from "../../types/audioPlaybackTypes";

const apiBase = () => import.meta.env.VITE_APP_TEDDYCLOUD_API_URL || "";

const NATIVE_COLLECTION_SOURCE_PATTERN =
    /^lib:\/\/(by\/contentHash\/([0-9a-f]{64})\/library-entry\.json)$/i;

export const buildLibraryFileUrl = (path: string, overlay = "") => {
    const encodedPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    const params = new URLSearchParams({ special: "library" });
    if (overlay) params.set("overlay", overlay);
    return `${apiBase()}/content/${encodedPath}?${params.toString()}`;
};

export const isNativeCollectionSource = (source: string) =>
    NATIVE_COLLECTION_SOURCE_PATTERN.test(source);

export const loadNativeCollectionFromSource = async (
    source: string,
    overlay = "",
): Promise<NativeCollectionSummary> => {
    const match = NATIVE_COLLECTION_SOURCE_PATTERN.exec(source);
    if (!match) throw new Error(`Invalid native collection source: ${source}`);

    const [, manifestPath, sourceHash] = match;
    const response = await fetch(buildLibraryFileUrl(manifestPath, overlay));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${manifestPath}`);

    const manifest = (await response.json()) as {
        format?: unknown;
        contentHash?: unknown;
        chapters?: unknown;
    };
    if (
        manifest.format !== "ogg-opus" ||
        typeof manifest.contentHash !== "string" ||
        manifest.contentHash.toLowerCase() !== sourceHash.toLowerCase() ||
        !Array.isArray(manifest.chapters)
    ) {
        throw new Error(`Invalid native collection manifest: ${manifestPath}`);
    }

    const collectionRoot = manifestPath.slice(0, manifestPath.lastIndexOf("/"));
    const chapters = manifest.chapters.map((value, expectedIndex) => {
        const chapter = value as {
            index?: unknown;
            originalName?: unknown;
            sha256?: unknown;
            fileSize?: unknown;
            path?: unknown;
        };
        if (
            chapter.index !== expectedIndex ||
            typeof chapter.originalName !== "string" ||
            typeof chapter.sha256 !== "string" ||
            !/^[0-9a-f]{64}$/i.test(chapter.sha256) ||
            typeof chapter.fileSize !== "number" ||
            !Number.isInteger(chapter.fileSize) ||
            chapter.fileSize < 0 ||
            typeof chapter.path !== "string" ||
            !/^chapters\/[^/]+\.opus$/i.test(chapter.path)
        ) {
            throw new Error(`Invalid chapter ${expectedIndex} in ${manifestPath}`);
        }
        return {
            index: expectedIndex,
            originalName: chapter.originalName,
            sha256: chapter.sha256,
            fileSize: chapter.fileSize,
            path: `${collectionRoot}/${chapter.path}`,
        };
    });

    return {
        source,
        contentHash: manifest.contentHash,
        chapterCount: chapters.length,
        format: "ogg-opus",
        totalSize: chapters.reduce((sum, chapter) => sum + chapter.fileSize, 0),
        manifestPath,
        chapters,
    };
};

export const nativeCollectionToPlaybackItem = (
    collection: NativeCollectionSummary,
    overlay = "",
    metadata?: {
        title?: string;
        subtitle?: string;
        picture?: string;
        tracks?: string[];
        fallbackTrackTitle?: (number: number) => string;
    },
): AudioPlaybackItem => {
    const metadataTracks =
        metadata?.tracks?.length === collection.chapterCount &&
        metadata.tracks.every((title) => title.trim().length > 0)
            ? metadata.tracks.map((title) => title.trim())
            : undefined;
    const trackTitles = collection.chapters.map(
        (_chapter, index) =>
            metadataTracks?.[index] ||
            metadata?.fallbackTrackTitle?.(index + 1) ||
            `Chapter ${index + 1}`,
    );

    return {
        id: collection.contentHash,
        kind: "tb2_native_collection",
        title: metadata?.title || `TB2 ${collection.contentHash.slice(0, 12)}`,
        subtitle: metadata?.subtitle || "Ogg/Opus",
        picture: metadata?.picture || "/img_unknown.png",
        sources: collection.chapters.map((chapter, index) => ({
            url: buildLibraryFileUrl(chapter.path, overlay),
            title: trackTitles[index],
        })),
        tracks: trackTitles.map((title, index) => ({
            title,
            sourceIndex: index,
            startSeconds: 0,
        })),
        searchText: [
            collection.contentHash,
            metadata?.title,
            metadata?.subtitle,
            ...trackTitles,
            ...collection.chapters.map((chapter) => chapter.originalName),
        ]
            .filter(Boolean)
            .join(" "),
    };
};

const fetchLibraryFile = async (path: string, overlay: string) => {
    const response = await fetch(buildLibraryFileUrl(path, overlay));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
    return response.blob();
};

export const downloadNativeCollectionZip = async (
    collection: NativeCollectionSummary,
    overlay = "",
) => {
    const zip = new JSZip();
    const root = zip.folder(collection.contentHash);
    if (!root) throw new Error("Could not create ZIP folder");

    root.file("library-entry.json", await fetchLibraryFile(collection.manifestPath, overlay), {
        compression: "STORE",
    });
    const chapters = root.folder("chapters");
    if (!chapters) throw new Error("Could not create ZIP chapter folder");
    for (const chapter of collection.chapters) {
        const name = chapter.path.split("/").pop();
        if (!name) throw new Error(`Invalid chapter path: ${chapter.path}`);
        chapters.file(name, await fetchLibraryFile(chapter.path, overlay), {
            compression: "STORE",
        });
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tb2-content-${collection.contentHash}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
};

export const isNativeCollectionRecord = (
    record: Record,
): record is Record & { nativeCollection: NativeCollectionSummary } =>
    record.entryKind === "tb2_native_collection" && !!record.nativeCollection;

export const tonieplayCollectionDisplayName = (
    collection: TonieplayCollectionSummary,
): string | undefined => {
    const title = collection.metadata?.title;
    if (typeof title === "string" && title.trim()) return title.trim();

    const name = collection.metadata?.name;
    return typeof name === "string" && name.trim() ? name.trim() : undefined;
};

export const downloadTonieplayCollectionZip = async (
    collection: TonieplayCollectionSummary,
    overlay = "",
) => {
    const zip = new JSZip();
    const root = zip.folder(collection.contentHash);
    if (!root) throw new Error("Could not create ZIP folder");

    root.file("library-entry.json", await fetchLibraryFile(collection.libraryEntryPath, overlay), {
        compression: "STORE",
    });
    root.file("content-meta.json", await fetchLibraryFile(collection.manifestPath, overlay), {
        compression: "STORE",
    });
    const objects = root.folder("objects");
    if (!objects) throw new Error("Could not create ZIP object folder");
    for (const object of collection.objects) {
        const name = object.path.split("/").pop();
        if (!name) throw new Error(`Invalid object path: ${object.path}`);
        objects.file(name, await fetchLibraryFile(object.path, overlay), {
            compression: "STORE",
        });
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tb2-tonieplay-${collection.contentHash}.zip`;
    anchor.click();
    URL.revokeObjectURL(url);
};

export const isTonieplayCollectionRecord = (
    record: Record,
): record is Record & { tonieplayCollection: TonieplayCollectionSummary } =>
    record.entryKind === "tb2_tonieplay_collection" && !!record.tonieplayCollection;
