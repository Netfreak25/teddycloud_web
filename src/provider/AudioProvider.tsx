import React, { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "antd";

import logoImg from "../assets/logo.png";

import { Record } from "../types/fileBrowserTypes";
import { TonieCardProps } from "../types/tonieTypes";
import { supportsOggOpus } from "../utils/browser/browserUtils";
import { AudioPlaybackItem } from "../types/audioPlaybackTypes";

type TonieCardTAFRecord = TonieCardProps | Record;

interface AudioContextType {
    playAudio: (
        url: string,
        meta?: any,
        tonieCardOrTAFRecord?: TonieCardTAFRecord,
        startTime?: number,
    ) => void;
    playPlaybackItem: (item: AudioPlaybackItem, trackIndex?: number, position?: number) => void;
    selectPlaybackTrack: (trackIndex: number) => void;
    playPreviousTrack: () => void;
    playNextTrack: () => void;
    playbackItem: AudioPlaybackItem | undefined;
    currentSourceIndex: number;
    songImage: string;
    songArtist: string;
    songTitle: string;
    songTracks: number[];
    tonieCardOrTAFRecord: TonieCardTAFRecord | undefined;
}

interface AudioProviderProps {
    children: React.ReactNode;
}

const AudioContext = React.createContext<AudioContextType | undefined>(undefined);

export const useAudioContext = () => {
    const context = useContext(AudioContext);
    if (!context) {
        throw new Error("useAudioContext must be used within an AudioProvider");
    }
    return context;
};

const extractFilename = (url: string) => {
    // Remove query parameters if any
    const urlWithoutParams = url.split("?")[0];
    // Extract the filename from the URL
    const parts = urlWithoutParams.split("/");
    return parts[parts.length - 1];
};

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
    const { t } = useTranslation();
    const [songImage, setSongImage] = useState<string>("");
    const [songArtist, setSongArtist] = useState<string>("");
    const [songTitle, setSongTitle] = useState<string>("");
    const [songTracks, setSongTracks] = useState<number[]>([]);
    const [tonieCardOrTAFRecord, setTonieCardOrTAFRecord] = useState<
        TonieCardTAFRecord | undefined
    >();
    const [playbackItem, setPlaybackItem] = useState<AudioPlaybackItem>();
    const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
    const playbackItemRef = useRef<AudioPlaybackItem | undefined>(undefined);
    const currentSourceIndexRef = useRef(0);

    const loadSource = useCallback((sourceIndex: number, position: number, autoplay: boolean) => {
        const item = playbackItemRef.current;
        const source = item?.sources[sourceIndex];
        const globalAudio = document.getElementById("globalAudioPlayer") as HTMLAudioElement | null;
        if (!item || !source || !globalAudio) return;

        let sourceElement = globalAudio.querySelector("source");
        if (!sourceElement) {
            sourceElement = document.createElement("source");
            globalAudio.appendChild(sourceElement);
        }
        sourceElement.type =
            source.url.includes("ogg=true") || source.url.split("?")[0].endsWith(".opus")
                ? "audio/ogg"
                : "";
        sourceElement.src = source.url.replace("+", "%2B").replace("#", "%23");
        currentSourceIndexRef.current = sourceIndex;
        setCurrentSourceIndex(sourceIndex);
        globalAudio.load();
        const startPlayback = () => {
            globalAudio.currentTime = position;
            if (autoplay) void globalAudio.play();
        };
        if (globalAudio.readyState >= HTMLMediaElement.HAVE_METADATA) startPlayback();
        else globalAudio.addEventListener("loadedmetadata", startPlayback, { once: true });
    }, []);

    const playPlaybackItem = useCallback(
        (item: AudioPlaybackItem, trackIndex = 0, position = 0) => {
            const track = item.tracks[trackIndex] || {
                sourceIndex: 0,
                startSeconds: 0,
                title: item.title,
            };
            const source = item.sources[track.sourceIndex];
            if (!source) return;
            if (
                (source.url.includes("ogg=true") || source.url.split("?")[0].endsWith(".opus")) &&
                !supportsOggOpus()
            ) {
                Modal.error({
                    title: t("audio.errorNoOggOpusSupport"),
                    content: t("audio.errorNoOggOpusSupportByApple"),
                    okText: t("audio.errorConfirm"),
                });
                return;
            }

            playbackItemRef.current = item;
            setPlaybackItem(item);
            setSongImage(item.picture);
            setSongArtist(item.subtitle);
            setSongTitle(item.title);
            setSongTracks(
                item.tracks
                    .filter((candidate) => candidate.sourceIndex === track.sourceIndex)
                    .map((candidate) => candidate.startSeconds),
            );
            setTonieCardOrTAFRecord(item.legacyRecord);
            loadSource(track.sourceIndex, position || track.startSeconds, true);
        },
        [loadSource, t],
    );

    const selectPlaybackTrack = useCallback(
        (trackIndex: number) => {
            const item = playbackItemRef.current;
            const track = item?.tracks[trackIndex];
            const audio = document.getElementById("globalAudioPlayer") as HTMLAudioElement | null;
            if (!item || !track || !audio) return;
            if (track.sourceIndex === currentSourceIndexRef.current) {
                audio.currentTime = track.startSeconds;
                void audio.play();
            } else {
                loadSource(track.sourceIndex, track.startSeconds, true);
            }
        },
        [loadSource],
    );

    const currentTrackIndex = useCallback(() => {
        const item = playbackItemRef.current;
        const audio = document.getElementById("globalAudioPlayer") as HTMLAudioElement | null;
        if (!item || !audio) return -1;
        let selected = -1;
        item.tracks.forEach((track, index) => {
            if (
                track.sourceIndex === currentSourceIndexRef.current &&
                track.startSeconds <= audio.currentTime
            ) {
                selected = index;
            }
        });
        return selected;
    }, []);

    const playPreviousTrack = useCallback(() => {
        const audio = document.getElementById("globalAudioPlayer") as HTMLAudioElement | null;
        const index = currentTrackIndex();
        if (!audio || index < 0) return;
        selectPlaybackTrack(audio.currentTime > 3 ? index : Math.max(0, index - 1));
    }, [currentTrackIndex, selectPlaybackTrack]);

    const playNextTrack = useCallback(() => {
        const item = playbackItemRef.current;
        const index = currentTrackIndex();
        if (!item || index < 0 || index + 1 >= item.tracks.length) return;
        selectPlaybackTrack(index + 1);
    }, [currentTrackIndex, selectPlaybackTrack]);

    useEffect(() => {
        const audio = document.getElementById("globalAudioPlayer") as HTMLAudioElement | null;
        if (!audio) return;
        const handleEnded = () => {
            const item = playbackItemRef.current;
            if (!item || item.kind !== "tb2_native_collection") return;
            const nextSource = currentSourceIndexRef.current + 1;
            if (nextSource < item.sources.length) loadSource(nextSource, 0, true);
        };
        audio.addEventListener("ended", handleEnded);
        return () => audio.removeEventListener("ended", handleEnded);
    }, [loadSource]);

    const playAudio = (
        url: string,
        meta?: any,
        tonieCardOrTAFRecord?: TonieCardTAFRecord,
        startTime?: number,
    ) => {
        console.log("Play audio: " + url);

        const pattern = /\/....04E0\?|(\?ogg)/;
        const matches = pattern.test(url);

        if (matches && !supportsOggOpus()) {
            Modal.error({
                title: t("audio.errorNoOggOpusSupport"),
                content: t("audio.errorNoOggOpusSupportByApple"),
                okText: t("audio.errorConfirm"),
            });
        } else {
            const globalAudio = document.getElementById("globalAudioPlayer") as HTMLAudioElement;

            let sourceElement = globalAudio.querySelector("source");
            if (!sourceElement) {
                sourceElement = document.createElement("source");
                if (matches) {
                    // if it's an ogg, we have to set the type!
                    sourceElement.type = "audio/ogg";
                }
                globalAudio.appendChild(sourceElement);
            }

            if (sourceElement.src != url) {
                // encodeUri (here or earlier) does not work, but this "dumb" replace does...
                sourceElement.src = url.replace("+", "%2B").replace("#", "%23");
                globalAudio.load();
            }
            if (meta) {
                setSongImage(meta.picture);
                setSongArtist(
                    meta.series || meta.episode
                        ? meta.series
                        : extractFilename(
                              decodeURI(url).replace("500304E0", t("audio.unknownSource")),
                          ),
                );
                setSongTitle(meta.episode);
            } else {
                setSongImage(decodeURI(url).includes(".taf?") ? "/img_unknown.png" : logoImg);
                setSongArtist("");
                setSongTitle(extractFilename(decodeURI(url)));
            }
            if (tonieCardOrTAFRecord) {
                setTonieCardOrTAFRecord(tonieCardOrTAFRecord);

                // Assign trackSeconds array or default to [0] if not present
                const trackSeconds =
                    "trackSeconds" in tonieCardOrTAFRecord
                        ? tonieCardOrTAFRecord.trackSeconds || [0]
                        : "tafHeader" in tonieCardOrTAFRecord &&
                            tonieCardOrTAFRecord.tafHeader?.trackSeconds
                          ? tonieCardOrTAFRecord.tafHeader.trackSeconds
                          : [0];
                setSongTracks(trackSeconds);
            } else {
                setSongTracks([]);
                setTonieCardOrTAFRecord(undefined);
            }

            if (startTime) {
                globalAudio.currentTime = startTime;
            }
            const title = meta?.episode || extractFilename(decodeURI(url));
            const subtitle = meta?.series || "";
            const trackTitles =
                (tonieCardOrTAFRecord &&
                    ("sourceInfo" in tonieCardOrTAFRecord && tonieCardOrTAFRecord.sourceInfo
                        ? tonieCardOrTAFRecord.sourceInfo.tracks
                        : tonieCardOrTAFRecord.tonieInfo?.tracks)) ||
                [];
            const starts = (tonieCardOrTAFRecord &&
                ("trackSeconds" in tonieCardOrTAFRecord
                    ? tonieCardOrTAFRecord.trackSeconds
                    : tonieCardOrTAFRecord.tafHeader?.trackSeconds)) || [0];
            const item: AudioPlaybackItem = {
                id: url,
                kind: "single_file",
                title,
                subtitle,
                picture:
                    meta?.picture ||
                    (decodeURI(url).includes(".taf?") ? "/img_unknown.png" : logoImg),
                sources: [{ url, title }],
                tracks: starts.map((start, index) => ({
                    title: trackTitles[index] || `Chapter ${index + 1}`,
                    sourceIndex: 0,
                    startSeconds: start,
                })),
                legacyRecord: tonieCardOrTAFRecord,
            };
            playbackItemRef.current = item;
            currentSourceIndexRef.current = 0;
            setPlaybackItem(item);
            setCurrentSourceIndex(0);
            globalAudio.play();
        }
    };

    return (
        <AudioContext.Provider
            value={{
                playAudio,
                playPlaybackItem,
                selectPlaybackTrack,
                playPreviousTrack,
                playNextTrack,
                playbackItem,
                currentSourceIndex,
                songImage,
                songArtist,
                songTitle,
                songTracks,
                tonieCardOrTAFRecord: tonieCardOrTAFRecord,
            }}
        >
            {children}
        </AudioContext.Provider>
    );
};
