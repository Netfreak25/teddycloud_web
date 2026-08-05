import React from "react";
import { Modal, Divider, Flex } from "antd";
import { PlayCircleOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";

import { AudioPlaybackItem } from "../../../../types/audioPlaybackTypes";

interface TracklistModalProps {
    open: boolean;
    playbackItem: AudioPlaybackItem;
    onClose: () => void;
    onSelectTrack: (trackIndex: number) => void;
    getContainer: () => HTMLElement;
}

const TracklistModal: React.FC<TracklistModalProps> = ({
    open,
    playbackItem,
    onClose,
    onSelectTrack,
    getContainer,
}) => {
    const { t } = useTranslation();

    const title =
        [playbackItem.title, playbackItem.subtitle].filter(Boolean).join(" - ") ||
        t("tonies.teddyaudioplayer.unknown");
    const tracks = playbackItem.tracks;

    return (
        <Modal
            title={title}
            open={open}
            onCancel={onClose}
            footer={null}
            getContainer={getContainer}
        >
            {tracks.length ? (
                <Flex vertical gap={4}>
                    {tracks.map((track, index) => (
                        <div key={index}>
                            <div style={{ display: "flex", gap: 16, textAlign: "left" }}>
                                <PlayCircleOutlined onClick={() => onSelectTrack(index)} />

                                <div>
                                    {index + 1}. {track.title}
                                </div>
                            </div>
                            {index < tracks.length - 1 && <Divider style={{ margin: "8px 0" }} />}
                        </div>
                    ))}
                </Flex>
            ) : (
                <p>{t("tonies.teddyaudioplayer.noTracks")}</p>
            )}
        </Modal>
    );
};

export default TracklistModal;
