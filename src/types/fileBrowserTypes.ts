import { TonieInfo } from "./tonieTypes";

export interface RecordTafHeader {
    audioId?: any;
    sha1Hash?: any;
    size?: number;
    trackSeconds?: number[];
    valid?: boolean;
}

export interface FileObject {
    uid: string;
    name: string;
    path: string;
}

export interface NativeCollectionSummary {
    source: string;
    contentHash: string;
    chapterCount: number;
    format: "ogg-opus";
    totalSize: number;
    manifestPath: string;
    chapters: NativeCollectionChapter[];
}

export interface NativeCollectionChapter {
    index: number;
    originalName: string;
    sha256: string;
    fileSize: number;
    path: string;
}

export interface TonieplayCollectionSummary {
    source: string;
    contentHash: string;
    version: number;
    contentType: string;
    objectCount: number;
    totalSize: number;
    libraryEntryPath: string;
    manifestPath: string;
    metadata?: { [key: string]: unknown };
    objects: TonieplayCollectionObject[];
}

export interface TonieplayCollectionObject {
    index: number;
    name: string;
    type?: string;
    filename?: string;
    sha256: string;
    fileSize: number;
    contentType: string;
    path: string;
}

export type Record = {
    date: number;
    isDir: boolean;
    name: string;
    tafHeader: RecordTafHeader;
    tonieInfo: TonieInfo;
    entryKind?: "tb2_native_collection" | "tb2_tonieplay_collection";
    nativeCollection?: NativeCollectionSummary;
    tonieplayCollection?: TonieplayCollectionSummary;
};
