export type TonieInfo = {
    series: string;
    episode: string;
    language: string;
    model: string;
    picture: string;
    tracks: string[];
};

export type ContentPlaylist = {
    kind: "direct_taf" | "native_collection" | "tap";
    editable: boolean;
    chapterCount: number;
    title: string;
    tracks: string[];
    durations: number[];
    contentVersion?: number;
    shuffleMode?: 0 | 1 | 2;
    editTarget?: string;
};

export type ContentPlaylistUpdate = Pick<ContentPlaylist, "title" | "tracks">;

export type TonieCardProps = {
    uid: string;
    ruid: string;
    type: string;
    valid: boolean;
    exists: boolean;
    claimed: boolean;
    hide: boolean;
    live: boolean;
    nocloud: boolean;
    hasCloudAuth: boolean;
    source: string;
    cachePreference?: "auto" | "taf" | "v3";
    cacheState?: {
        tafComplete: boolean;
        v3Complete: boolean;
        v3ContentVersion?: number;
    };
    audioUrl: string;
    downloadTriggerUrl: string;
    tonieInfo: TonieInfo;
    sourceInfo: TonieInfo;
    playlist?: ContentPlaylist;
    trackSeconds: number[];
    marked?: boolean;
    onToggleMark?: (ruid: string) => void;
};

export type TagTonieCard = {
    tagInfo: TonieCardProps;
};

export type TagTonieCardsList = {
    tags: TonieCardProps[];
};
