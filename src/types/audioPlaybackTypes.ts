import { TonieCardProps } from "./tonieTypes";
import { Record } from "./fileBrowserTypes";

export type AudioPlaybackKind = "single_file" | "tb2_native_collection";

export interface AudioPlaybackSource {
    url: string;
    title: string;
}

export interface AudioPlaybackTrack {
    title: string;
    sourceIndex: number;
    startSeconds: number;
}

export interface AudioPlaybackItem {
    id: string;
    kind: AudioPlaybackKind;
    title: string;
    subtitle: string;
    picture: string;
    sources: AudioPlaybackSource[];
    tracks: AudioPlaybackTrack[];
    searchText?: string;
    legacyRecord?: TonieCardProps | Record;
}
