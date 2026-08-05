import JSZip from "jszip";
import { NativeCollectionSummary, Record } from "../../types/fileBrowserTypes";
import { AudioPlaybackItem } from "../../types/audioPlaybackTypes";

const apiBase = () => import.meta.env.VITE_APP_TEDDYCLOUD_API_URL || "";

export const buildLibraryFileUrl = (path: string, overlay = "") => {
    const encodedPath = path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
    const params = new URLSearchParams({ special: "library" });
    if (overlay) params.set("overlay", overlay);
    return `${apiBase()}/content/${encodedPath}?${params.toString()}`;
};

export const nativeCollectionToPlaybackItem = (
    collection: NativeCollectionSummary,
    overlay = "",
    metadata?: { title?: string; subtitle?: string; picture?: string },
): AudioPlaybackItem => ({
    id: collection.contentHash,
    kind: "tb2_native_collection",
    title: metadata?.title || `TB2 ${collection.contentHash.slice(0, 12)}`,
    subtitle: metadata?.subtitle || "Ogg/Opus",
    picture: metadata?.picture || "/img_unknown.png",
    sources: collection.chapters.map((chapter, index) => ({
        url: buildLibraryFileUrl(chapter.path, overlay),
        title: chapter.originalName || `Chapter ${index + 1}`,
    })),
    tracks: collection.chapters.map((chapter, index) => ({
        title: chapter.originalName || `Chapter ${index + 1}`,
        sourceIndex: index,
        startSeconds: 0,
    })),
    searchText: [
        collection.contentHash,
        ...collection.chapters.map((chapter) => chapter.originalName),
    ].join(" "),
});

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
