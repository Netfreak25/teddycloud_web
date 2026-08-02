import { Button, Drawer, List, theme } from "antd";
import { CaretRightOutlined } from "@ant-design/icons";
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
    onClose: () => void;
    onSelectChapter: (chapter: number) => void;
};

export const ChapterDrawer = ({
    open,
    title,
    tracks,
    trackSeconds,
    currentChapter,
    playbackEnabled,
    loadingChapter,
    onClose,
    onSelectChapter,
}: ChapterDrawerProps) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();

    return (
        <Drawer
            title={title || t("tonieboxes.live.chapters")}
            open={open}
            onClose={onClose}
            width="min(420px, 100vw)"
        >
            <List
                dataSource={tracks}
                renderItem={(track, index) => (
                    <List.Item
                        style={
                            index === currentChapter
                                ? { background: token.colorPrimaryBg, paddingInline: 12 }
                                : { paddingInline: 12 }
                        }
                        actions={[
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
                        ]}
                    >
                        <List.Item.Meta
                            title={`${index + 1}. ${track || t("tonieboxes.live.chapter", { number: index + 1 })}`}
                            description={
                                trackSeconds?.[index] !== undefined
                                    ? formatPlaybackTime(trackSeconds[index])
                                    : undefined
                            }
                        />
                    </List.Item>
                )}
            />
        </Drawer>
    );
};
