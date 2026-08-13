import { useEffect, useState, useRef, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "antd";
import { ExportOutlined, ImportOutlined } from "@ant-design/icons";

import { TonieCardProps } from "../../types/tonieTypes";
import { naturalCompare } from "../../utils/helper";

import BreadcrumbWrapper, {
    StyledContent,
    StyledLayout,
    StyledSider,
} from "../../components/common/StyledComponents";
import { ToniesSubNav } from "../../components/tonies/ToniesSubNav";
import { useTonieboxContent } from "../../hooks/useTonieboxContent";
import { TeddyAudioPlayer } from "../../components/tonies/teddyaudioplayer/TeddyAudioPlayer";
import LoadingSpinner from "../../components/common/elements/LoadingSpinner";
import { useTonies } from "../../hooks/useTonies";
import { useAudioContext } from "../../provider/AudioProvider";
import { AudioPlaybackItem } from "../../types/audioPlaybackTypes";
import { Record } from "../../types/fileBrowserTypes";
import {
    isNativeCollectionRecord,
    nativeCollectionToPlaybackItem,
} from "../../utils/audio/nativeCollection";
import { tonieToPlaybackItem } from "../../utils/audio/playbackItem";

type TeddyAudioPlayerPageProps = {
    standalone?: boolean;
};

export const TeddyAudioPlayerPage: React.FC<TeddyAudioPlayerPageProps> = ({
    standalone = false,
}) => {
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const tonieRuid = searchParams.get("ruid");
    const contentHash = searchParams.get("contentHash");
    const startChapter = Number(searchParams.get("chapter")) || 0;
    const startPosition = Number(searchParams.get("position")) || 0;
    const linkOverlay = searchParams.get("overlay");

    const { t } = useTranslation();
    const { playPlaybackItem } = useAudioContext();
    const { overlay } = useTonieboxContent(linkOverlay);

    const contentRef = useRef<HTMLDivElement>(null);

    const [currentPlayPosition, setCurrentPlayPosition] = useState<number | undefined>(0);
    const [currentItem, setCurrentItem] = useState<AudioPlaybackItem>();
    const [currentChapter, setCurrentChapter] = useState(startChapter);
    const [nativeRecords, setNativeRecords] = useState<Record[]>([]);
    const [nativeLoading, setNativeLoading] = useState(true);
    const [playerKey, setPlayerKey] = useState(0);

    const openStandalone = () => {
        if (currentItem) {
            const params = new URLSearchParams();
            if (currentItem.kind === "tb2_native_collection") {
                params.set("contentHash", currentItem.id);
                params.set("chapter", currentChapter.toString());
            } else {
                params.set("ruid", currentItem.id);
            }
            params.set("position", (currentPlayPosition ?? 0).toString());
            if (overlay) params.set("overlay", overlay);
            window.open(`../audioplayer?${params.toString()}`, "_blank");
        } else {
            window.open("../audioplayer", "_blank");
        }
        navigate("/");
    };

    const sortTonies = (a: TonieCardProps, b: TonieCardProps) => {
        const seriesA = a.sourceInfo?.series || a.tonieInfo.series || "Unknown";
        const seriesB = b.sourceInfo?.series || b.tonieInfo.series || "Unknown";
        const bySeries = naturalCompare(seriesA, seriesB);
        if (bySeries !== 0) return bySeries;
        const episodeA = a.sourceInfo?.episode || a.tonieInfo.episode || "";
        const episodeB = b.sourceInfo?.episode || b.tonieInfo.episode || "";
        return naturalCompare(episodeA, episodeB);
    };

    const { tonies, loading } = useTonies({
        overlay: overlay ?? "",
        merged: false,
        sort: sortTonies,
        filter: "tag",
    });

    const playableTonieCards = useMemo(() => {
        const seen = new Set<string>();
        return tonies.filter((tonie) => {
            if (tonie.source.startsWith("lib://by/contentHash/")) return false;
            const isPlayable = tonie.valid || tonie.source.startsWith("http");
            if (!isPlayable) return false;

            const key = tonie.source;
            if (seen.has(key)) return false;

            seen.add(key);
            return true;
        });
    }, [tonies]);

    useEffect(() => {
        let cancelled = false;
        setNativeLoading(true);
        const params = new URLSearchParams({ path: "by/contentHash", special: "library" });
        if (overlay) params.set("overlay", overlay);
        fetch(`${import.meta.env.VITE_APP_TEDDYCLOUD_API_URL}/api/fileIndexV2?${params.toString()}`)
            .then((response) => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json();
            })
            .then((payload) => {
                if (!cancelled) {
                    setNativeRecords(
                        ((payload.files || []) as Record[]).filter(isNativeCollectionRecord),
                    );
                }
            })
            .catch(() => {
                if (!cancelled) setNativeRecords([]);
            })
            .finally(() => {
                if (!cancelled) setNativeLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [overlay]);

    const playbackItems = useMemo(() => {
        const standardItems = playableTonieCards.map(tonieToPlaybackItem);
        const nativeItems = nativeRecords.map((record) => {
            const collection = record.nativeCollection!;
            const source = `lib://by/contentHash/${collection.contentHash}/library-entry.json`;
            const assigned = tonies.find((tonie) => tonie.source === source);
            const title =
                record.tonieInfo?.series ||
                assigned?.playlist?.title ||
                assigned?.sourceInfo?.series ||
                assigned?.tonieInfo.series;
            const subtitle =
                record.tonieInfo?.episode ||
                assigned?.sourceInfo?.episode ||
                assigned?.tonieInfo.episode;
            const libraryPicture = record.tonieInfo?.picture;
            const picture =
                (libraryPicture && !libraryPicture.endsWith("img_unknown.png")
                    ? libraryPicture
                    : undefined) ||
                assigned?.sourceInfo?.picture ||
                assigned?.tonieInfo.picture;
            const tracks = [
                record.tonieInfo?.tracks,
                assigned?.playlist?.tracks,
                assigned?.sourceInfo?.tracks,
                assigned?.tonieInfo.tracks,
            ].find(
                (candidate) =>
                    candidate?.length === collection.chapterCount &&
                    candidate.every((track) => track.trim().length > 0),
            );
            return nativeCollectionToPlaybackItem(collection, overlay, {
                title,
                subtitle,
                picture,
                tracks,
                fallbackTrackTitle: (number) => t("tonieboxes.live.chapter", { number }),
            });
        });
        const seen = new Set<string>();
        return [...standardItems, ...nativeItems].filter((item) => {
            const key = `${item.kind}:${item.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, [nativeRecords, overlay, playableTonieCards, tonies]);

    useEffect(() => {
        const item = contentHash
            ? playbackItems.find(
                  (candidate) =>
                      candidate.kind === "tb2_native_collection" && candidate.id === contentHash,
              )
            : playbackItems.find((candidate) => candidate.id === tonieRuid);
        if (item) {
            setCurrentItem(item);
            setCurrentPlayPosition(startPosition);
            setCurrentChapter(contentHash ? startChapter : 0);
            setPlayerKey((prev) => prev + 1);
            navigate(location.pathname, { replace: true });
        }
    }, [
        contentHash,
        location.pathname,
        navigate,
        playbackItems,
        startChapter,
        startPosition,
        tonieRuid,
    ]);

    const teddyAudioPlayerContent = (
        <StyledContent
            ref={contentRef}
            style={{
                height: "100%",
                overflowX: "hidden",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h1>{t("tonies.teddyaudioplayer.title")}</h1>
                <div style={{ display: "flex", gap: 8 }}>
                    {currentItem && !standalone && (
                        <ImportOutlined
                            title={t("tonies.teddyaudioplayer.continueInFooterAudioPlayer")}
                            onClick={() => {
                                playPlaybackItem(
                                    currentItem,
                                    currentItem.tracks.findIndex(
                                        (track) => track.sourceIndex === currentChapter,
                                    ),
                                    currentPlayPosition,
                                );
                                setCurrentItem(undefined);
                                setCurrentPlayPosition(0);
                                setPlayerKey((prev) => prev + 1);
                            }}
                        />
                    )}
                    {!standalone && (
                        <Button
                            title={t("tonies.teddyaudioplayer.openStandalone")}
                            type="text"
                            icon={<ExportOutlined />}
                            onClick={openStandalone}
                        />
                    )}
                </div>
            </div>

            {loading || nativeLoading ? (
                <LoadingSpinner />
            ) : (
                <TeddyAudioPlayer
                    key={playerKey}
                    playbackItems={playbackItems}
                    preselectedItem={currentItem}
                    preselectedPlayPosition={currentPlayPosition}
                    preselectedChapter={currentChapter}
                    onItemChange={(item) => setCurrentItem(item)}
                    onPlayPositionChange={(pos) => setCurrentPlayPosition(pos)}
                    onChapterChange={setCurrentChapter}
                />
            )}
        </StyledContent>
    );

    return standalone ? (
        <>
            <style>
                {`
                    .ant-layout-header,
                    .ant-breadcrumb,
                    .additional-footer-padding, 
                    .ant-layout-footer  {
                        display: none !important;
                    }
                `}
            </style>
            <BreadcrumbWrapper
                items={[
                    { title: <Link to="/">{t("home.navigationTitle")}</Link> },
                    { title: t("tonies.teddyaudioplayer.standaloneTitle") },
                ]}
            />
            {teddyAudioPlayerContent}
        </>
    ) : (
        <>
            <StyledSider>
                <ToniesSubNav />
            </StyledSider>
            <StyledLayout>
                <BreadcrumbWrapper
                    items={[
                        { title: <Link to="/">{t("home.navigationTitle")}</Link> },
                        { title: <Link to="/tonies">{t("tonies.navigationTitle")}</Link> },
                        { title: t("tonies.teddyaudioplayer.navigationTitle") },
                    ]}
                />
                {teddyAudioPlayerContent}
            </StyledLayout>
        </>
    );
};
