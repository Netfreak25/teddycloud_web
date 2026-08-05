import { AudioPlaybackItem } from "../../types/audioPlaybackTypes";
import { TonieCardProps } from "../../types/tonieTypes";

export const tonieToPlaybackItem = (tonie: TonieCardProps): AudioPlaybackItem => {
    const title = tonie.sourceInfo?.series || tonie.tonieInfo.series || "Unknown";
    const subtitle = tonie.sourceInfo?.episode || tonie.tonieInfo.episode || "";
    const picture = tonie.sourceInfo?.picture || tonie.tonieInfo.picture || "/img_unknown.png";
    const url = tonie.valid
        ? import.meta.env.VITE_APP_TEDDYCLOUD_API_URL + tonie.audioUrl
        : tonie.source;
    const titles = tonie.sourceInfo?.tracks || tonie.tonieInfo.tracks || [];
    const starts = tonie.trackSeconds?.length ? tonie.trackSeconds : [0];

    return {
        id: tonie.ruid,
        kind: "single_file",
        title,
        subtitle,
        picture,
        sources: [{ url, title: subtitle || title }],
        tracks: starts.map((startSeconds, index) => ({
            title: titles[index] || `Chapter ${index + 1}`,
            sourceIndex: 0,
            startSeconds,
        })),
        searchText: [title, subtitle, ...titles].join(" "),
        legacyRecord: tonie,
    };
};
