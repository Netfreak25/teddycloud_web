import { useEffect, useState } from "react";
import { Button, Drawer, Input, List, Space, theme } from "antd";
import { CaretRightOutlined, CloseOutlined, EditOutlined, SaveOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { formatPlaybackTime } from "./formatTime";

type ChapterDrawerProps = {
    open: boolean;
    title?: string;
    tracks: string[];
    trackSeconds?: number[];
    currentChapter: number | null;
    playbackEnabled: boolean;
    loadingChapter?: number;
    editable: boolean;
    onClose: () => void;
    onSelectChapter: (chapter: number) => void;
    onSavePlaylist: (title: string, tracks: string[]) => Promise<boolean>;
};

const PLAYLIST_TEXT_MAX_LENGTH = 200;

export const ChapterDrawer = ({
    open,
    title,
    tracks,
    trackSeconds,
    currentChapter,
    playbackEnabled,
    loadingChapter,
    editable,
    onClose,
    onSelectChapter,
    onSavePlaylist,
}: ChapterDrawerProps) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [draftTitle, setDraftTitle] = useState(title ?? "");
    const [draftTracks, setDraftTracks] = useState(tracks);

    useEffect(() => {
        if (!editing) {
            setDraftTitle(title ?? "");
            setDraftTracks(tracks);
        }
    }, [editing, title, tracks]);

    const startEditing = () => {
        setDraftTitle(title ?? "");
        setDraftTracks(tracks);
        setEditing(true);
    };

    const cancelEditing = () => {
        setEditing(false);
        setDraftTitle(title ?? "");
        setDraftTracks(tracks);
    };

    const savePlaylist = async () => {
        setSaving(true);
        try {
            const saved = await onSavePlaylist(
                draftTitle.trim(),
                draftTracks.map((track) => track.trim()),
            );
            if (saved) setEditing(false);
        } finally {
            setSaving(false);
        }
    };

    const closeDrawer = () => {
        cancelEditing();
        onClose();
    };

    const updateTrack = (index: number, value: string) => {
        setDraftTracks((current) =>
            current.map((track, trackIndex) => (trackIndex === index ? value : track)),
        );
    };

    return (
        <Drawer
            title={title || t("tonieboxes.live.chapters")}
            open={open}
            onClose={closeDrawer}
            width="min(420px, 100vw)"
            extra={
                editable ? (
                    editing ? (
                        <Space>
                            <Button
                                icon={<CloseOutlined />}
                                disabled={saving}
                                onClick={cancelEditing}
                            >
                                {t("tonieboxes.live.cancelPlaylistEdit")}
                            </Button>
                            <Button
                                type="primary"
                                icon={<SaveOutlined />}
                                loading={saving}
                                onClick={() => void savePlaylist()}
                            >
                                {t("tonieboxes.live.savePlaylist")}
                            </Button>
                        </Space>
                    ) : (
                        <Button
                            icon={<EditOutlined />}
                            aria-label={t("tonieboxes.live.editPlaylist")}
                            onClick={startEditing}
                        >
                            {t("tonieboxes.live.editPlaylist")}
                        </Button>
                    )
                ) : undefined
            }
        >
            {editing && (
                <Input
                    value={draftTitle}
                    maxLength={PLAYLIST_TEXT_MAX_LENGTH}
                    placeholder={t("tonieboxes.live.playlistTitle")}
                    aria-label={t("tonieboxes.live.playlistTitle")}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    style={{ marginBottom: 16 }}
                />
            )}
            <List
                dataSource={editing ? draftTracks : tracks}
                renderItem={(track, index) => (
                    <List.Item
                        style={
                            index === currentChapter
                                ? { background: token.colorPrimaryBg, paddingInline: 12 }
                                : { paddingInline: 12 }
                        }
                        actions={
                            editing
                                ? undefined
                                : [
                                      <Button
                                          key="select"
                                          type="text"
                                          icon={<CaretRightOutlined />}
                                          aria-label={t("tonieboxes.live.playChapter", {
                                              number: index + 1,
                                          })}
                                          disabled={!playbackEnabled}
                                          loading={loadingChapter === index}
                                          onClick={() => onSelectChapter(index)}
                                      />,
                                  ]
                        }
                    >
                        <List.Item.Meta
                            title={
                                editing ? (
                                    <Input
                                        value={track}
                                        maxLength={PLAYLIST_TEXT_MAX_LENGTH}
                                        placeholder={t("tonieboxes.live.chapter", {
                                            number: index + 1,
                                        })}
                                        aria-label={t("tonieboxes.live.chapterTitle", {
                                            number: index + 1,
                                        })}
                                        onChange={(event) => updateTrack(index, event.target.value)}
                                    />
                                ) : (
                                    `${index + 1}. ${track || t("tonieboxes.live.chapter", { number: index + 1 })}`
                                )
                            }
                            description={
                                trackSeconds?.[index] !== undefined
                                    ? t("tonieboxes.live.chapterStart", {
                                          time: formatPlaybackTime(trackSeconds[index]),
                                      })
                                    : undefined
                            }
                        />
                    </List.Item>
                )}
            />
        </Drawer>
    );
};
