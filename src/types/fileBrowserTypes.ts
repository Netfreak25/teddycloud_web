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

export type Record = {
    date: number;
    isDir: boolean;
    name: string;
    tafHeader: RecordTafHeader;
    tonieInfo: TonieInfo;
    entryKind?: "tb2_native_collection";
    nativeCollection?: NativeCollectionSummary;
};
