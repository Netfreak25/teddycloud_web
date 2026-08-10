import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Button,
    Divider,
    Flex,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Slider,
    Space,
    Switch,
    Tag,
    theme,
    Tooltip,
    Typography,
} from "antd";
import { useNavigate } from "react-router-dom";
import {
    CaretRightOutlined,
    CustomerServiceOutlined,
    MoonOutlined,
    PauseOutlined,
    PoweroffOutlined,
    ReloadOutlined,
    SoundOutlined,
    StepBackwardOutlined,
    StepForwardOutlined,
    ThunderboltOutlined,
    UnorderedListOutlined,
} from "@ant-design/icons";

import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { useTeddyCloud } from "../../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import {
    TonieboxBedtimeCommand,
    TonieboxPlaybackAction,
    TonieboxRuntime,
} from "../../../../types/tonieboxTypes";
import { TonieCardProps } from "../../../../types/tonieTypes";
import { ChapterDrawer } from "./ChapterDrawer";
import { formatPlaybackTime } from "./formatTime";

const api = new TeddyCloudApi(defaultAPIConfig());
const VOLUME_MIN = 0;
const VOLUME_MAX = 10;
const CONTROL_SIZE = 36;
const BEDTIME_MINUTES_MIN = 5;
const BEDTIME_MINUTES_MAX = 24 * 60;
const BEDTIME_MINUTES_DEFAULT = 30;
const ALARM_VOLUME_DEFAULT = 50;

const resolveTapEditRoute = (editTarget?: string): string | undefined => {
    const target = editTarget?.trim();
    if (!target || !target.toLowerCase().startsWith("lib://")) return undefined;

    const relativeTarget = target.slice("lib://".length).replace(/^\/+/, "");
    const separator = relativeTarget.lastIndexOf("/");
    const directory = separator >= 0 ? relativeTarget.slice(0, separator) : "";
    const filename = separator >= 0 ? relativeTarget.slice(separator + 1) : relativeTarget;
    if (!filename.toLowerCase().endsWith(".tap")) return undefined;

    const params = new URLSearchParams();
    if (directory) params.set("path", directory);
    params.set("editTap", filename);
    return `/tonies/library?${params.toString()}`;
};

const resolvePlaybackTracks = (tonie?: TonieCardProps): string[] => {
    const sourceTracks = tonie?.sourceInfo?.tracks ?? [];
    const assignedTracks = tonie?.tonieInfo.tracks ?? [];

    if (tonie?.playlist?.kind === "tap") {
        return Array.from({ length: tonie.playlist.chapterCount }, (_, index) => {
            return tonie.playlist?.tracks[index]?.trim() || "";
        });
    }

    if (tonie?.playlist?.kind === "direct_taf" || tonie?.playlist?.editable) {
        return Array.from({ length: tonie.playlist.chapterCount }, (_, index) => {
            return tonie.playlist?.tracks[index]?.trim() || "";
        });
    }

    if (tonie?.source?.trim()) {
        const trackCount = tonie.trackSeconds.length || sourceTracks.length;
        return Array.from({ length: trackCount }, (_, index) => {
            return sourceTracks[index]?.trim() || "";
        });
    }

    const trackCount = Math.max(
        sourceTracks.length,
        assignedTracks.length,
        tonie?.trackSeconds.length ?? 0,
    );

    return Array.from({ length: trackCount }, (_, index) => {
        return sourceTracks[index]?.trim() || assignedTracks[index]?.trim() || "";
    });
};

type TonieboxLiveControlsProps = {
    overlay: string;
    runtime: TonieboxRuntime;
    tonie?: TonieCardProps;
    readOnly: boolean;
    onRefresh?: () => Promise<void>;
    onTonieRefresh?: () => Promise<void>;
};

export const TonieboxLiveControls = ({
    overlay,
    runtime,
    tonie,
    readOnly,
    onRefresh,
    onTonieRefresh,
}: TonieboxLiveControlsProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { token } = theme.useToken();
    const { addNotification } = useTeddyCloud();
    const [chapterDrawerOpen, setChapterDrawerOpen] = useState(false);
    const [bedtimeModalOpen, setBedtimeModalOpen] = useState(false);
    const [commandInFlight, setCommandInFlight] = useState<string>();
    const [volume, setVolume] = useState(runtime.volume.level ?? VOLUME_MIN);
    const [bedtimeMinutes, setBedtimeMinutes] = useState(BEDTIME_MINUTES_DEFAULT);
    const [oneTimeAlarm, setOneTimeAlarm] = useState(false);
    const [alarmTone, setAlarmTone] = useState("");
    const [alarmVolume, setAlarmVolume] = useState(ALARM_VOLUME_DEFAULT);
    const [morningLight, setMorningLight] = useState(true);
    const [now, setNow] = useState(Date.now());

    const playback = runtime.playback;
    const hasActivePlayback = playback.valid && playback.tonie !== null;
    const commandPending = commandInFlight !== undefined;
    const tracks = useMemo(() => resolvePlaybackTracks(tonie), [tonie]);
    const chapterIndex = playback.chapter;
    const chapterNumber = chapterIndex === null ? undefined : chapterIndex + 1;
    const currentTrack =
        chapterIndex !== null
            ? tracks[chapterIndex] || t("tonieboxes.live.chapter", { number: chapterIndex + 1 })
            : undefined;
    const playbackEnabled =
        !readOnly && runtime.online && runtime.controls.playback && playback.valid;
    const volumeEnabled =
        !readOnly &&
        runtime.online &&
        runtime.controls.volume &&
        runtime.volume.valid &&
        runtime.volume.level !== null;
    const bedtimeState = runtime.bedtime.state?.toLowerCase();
    const bedtimeActive = bedtimeState === "active" || bedtimeState === "on";
    const bedtimeControlEnabled =
        !readOnly && runtime.online && runtime.controls.bedtime && !commandPending;
    const sleepControlEnabled =
        !readOnly && runtime.online && bedtimeActive && runtime.controls.sleep && !commandPending;
    const shutdownControlEnabled =
        !readOnly &&
        runtime.online &&
        runtime.controls.sleep &&
        (bedtimeActive || runtime.controls.bedtime) &&
        !commandPending;

    const middleAction: TonieboxPlaybackAction | undefined =
        playback.status === "playing"
            ? "pause"
            : playback.status === "paused" || playback.status === "stopped"
              ? "start"
              : undefined;

    const remainingSeconds = useMemo(() => {
        if (playback.chapterUntilMs === null) return undefined;
        return Math.max(0, Math.ceil((playback.chapterUntilMs - now) / 1000));
    }, [now, playback.chapterUntilMs]);

    useEffect(() => {
        if (runtime.volume.valid && runtime.volume.level !== null) {
            setVolume(runtime.volume.level);
        }
    }, [runtime.volume.level, runtime.volume.valid]);

    useEffect(() => {
        if (playback.status !== "playing" || playback.chapterUntilMs === null) return;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [playback.chapterUntilMs, playback.status]);

    const reportCommandError = (error: unknown) => {
        addNotification(
            NotificationTypeEnum.Error,
            t("tonieboxes.live.commandFailed"),
            `${t("tonieboxes.live.commandFailedDetails")}: ${String(error)}`,
            t("tonieboxes.navigationTitle"),
        );
    };

    const refreshAfterCommand = async () => {
        if (onRefresh) await onRefresh();
    };

    const sendPlayback = async (action: TonieboxPlaybackAction) => {
        setCommandInFlight(action);
        try {
            await api.apiControlTonieboxPlayback(overlay, { action });
            await refreshAfterCommand();
        } catch (error) {
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const selectChapter = async (index: number) => {
        setCommandInFlight(`chapter-${index}`);
        try {
            await api.apiControlTonieboxPlayback(overlay, {
                action: "setPosition",
                chapter: index,
                ms: 0,
            });
            setChapterDrawerOpen(false);
            await refreshAfterCommand();
        } catch (error) {
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const changeVolume = async (level: number) => {
        setCommandInFlight("volume");
        try {
            await api.apiControlTonieboxVolume(overlay, level);
            await refreshAfterCommand();
        } catch (error) {
            setVolume(runtime.volume.level ?? VOLUME_MIN);
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const openBedtimeControls = () => {
        const durationSeconds =
            runtime.bedtime.duration ??
            runtime.bedtime.defaultDuration ??
            BEDTIME_MINUTES_DEFAULT * 60;
        setBedtimeMinutes(
            Math.min(
                BEDTIME_MINUTES_MAX,
                Math.max(BEDTIME_MINUTES_MIN, Math.ceil(durationSeconds / 60)),
            ),
        );
        setBedtimeModalOpen(true);
    };

    const startBedtime = async () => {
        const command: TonieboxBedtimeCommand = {
            state: "on",
            duration: bedtimeMinutes * 60,
            ...(oneTimeAlarm
                ? {
                      oneTimeAlarm: true,
                      alarm: {
                          tone: alarmTone.trim(),
                          volume: alarmVolume,
                          morningLight,
                      },
                  }
                : {}),
        };

        setCommandInFlight("bedtime-on");
        try {
            await api.apiControlTonieboxBedtime(overlay, command);
            setBedtimeModalOpen(false);
            await refreshAfterCommand();
        } catch (error) {
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const stopBedtime = async () => {
        setCommandInFlight("bedtime-off");
        try {
            await api.apiControlTonieboxBedtime(overlay, { state: "off" });
            setBedtimeModalOpen(false);
            await refreshAfterCommand();
        } catch (error) {
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const sleepNow = async () => {
        setCommandInFlight("sleep");
        try {
            await api.apiSleepToniebox(overlay);
            setBedtimeModalOpen(false);
            await refreshAfterCommand();
        } catch (error) {
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const shutdownNow = async () => {
        setCommandInFlight("shutdown");
        try {
            await api.apiShutdownToniebox(overlay);
            await refreshAfterCommand();
        } catch (error) {
            reportCommandError(error);
        } finally {
            setCommandInFlight(undefined);
        }
    };

    const savePlaylist = async (title: string, playlistTracks: string[]) => {
        if (!tonie?.ruid) return false;

        try {
            await api.apiSaveContentPlaylist(tonie.ruid, overlay, {
                title,
                tracks: playlistTracks,
            });
            if (onTonieRefresh) await onTonieRefresh();
            addNotification(
                NotificationTypeEnum.Success,
                t("tonieboxes.live.playlistSaved"),
                t("tonieboxes.live.playlistSavedDetails"),
                t("tonieboxes.navigationTitle"),
            );
            return true;
        } catch (error) {
            addNotification(
                NotificationTypeEnum.Error,
                t("tonieboxes.live.playlistSaveFailed"),
                `${t("tonieboxes.live.playlistSaveFailedDetails")}: ${String(error)}`,
                t("tonieboxes.navigationTitle"),
            );
            return false;
        }
    };

    const tapPlaylist = tonie?.playlist?.kind === "tap" ? tonie.playlist : undefined;
    const tapEditRoute = resolveTapEditRoute(tapPlaylist?.editTarget);
    const editTap = () => {
        if (!tapEditRoute) return;
        setChapterDrawerOpen(false);
        navigate(tapEditRoute);
    };

    const controlButtonStyle = { width: CONTROL_SIZE, height: CONTROL_SIZE };
    const customContent = Boolean(tonie?.source?.trim());
    const series = customContent
        ? tonie?.playlist?.title?.trim() || t("tonieboxes.live.customContent")
        : tonie?.tonieInfo.series || t("tonieboxes.live.unknownTonie");
    const episode = customContent ? undefined : tonie?.tonieInfo.episode;
    const chapterLabel =
        chapterNumber === undefined
            ? undefined
            : tracks.length > 0
              ? `${chapterNumber}/${tracks.length}`
              : chapterNumber.toString();
    const bedtimeTooltip = runtime.bedtime.valid
        ? [
              runtime.bedtime.state,
              runtime.bedtime.duration !== null
                  ? t("tonieboxes.live.bedtimeDuration", {
                        minutes: Math.ceil(runtime.bedtime.duration / 60),
                    })
                  : undefined,
              runtime.bedtime.until
                  ? t("tonieboxes.live.bedtimeUntil", { time: runtime.bedtime.until })
                  : undefined,
          ]
              .filter(Boolean)
              .join(" - ")
        : t("tonieboxes.live.bedtimeUnknown");

    return (
        <div
            style={{
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                marginTop: 4,
                paddingTop: 14,
            }}
        >
            {(runtime.battery.valid ||
                runtime.headphones.valid ||
                runtime.bedtime.valid ||
                runtime.controls.bedtime ||
                runtime.controls.sleep ||
                runtime.online) && (
                <Flex align="center" gap={12} style={{ marginBottom: hasActivePlayback ? 10 : 0 }}>
                    {runtime.battery.valid && (
                        <Tooltip title={runtime.battery.status || t("tonieboxes.live.battery")}>
                            <Space size={4}>
                                <ThunderboltOutlined />
                                {runtime.battery.percent !== null && (
                                    <Typography.Text>{runtime.battery.percent}%</Typography.Text>
                                )}
                            </Space>
                        </Tooltip>
                    )}
                    {runtime.headphones.valid && (
                        <Tooltip
                            title={t("tonieboxes.live.headphonesConnected", {
                                count: runtime.headphones.connectedCount ?? 0,
                            })}
                        >
                            <CustomerServiceOutlined
                                style={{
                                    color:
                                        (runtime.headphones.connectedCount ?? 0) > 0
                                            ? token.colorPrimary
                                            : token.colorTextSecondary,
                                }}
                            />
                        </Tooltip>
                    )}
                    <Tooltip title={bedtimeTooltip}>
                        <span style={{ marginLeft: "auto" }}>
                            <Button
                                aria-label={t("tonieboxes.live.bedtime")}
                                type="text"
                                icon={<MoonOutlined />}
                                style={{
                                    ...controlButtonStyle,
                                    color: bedtimeActive ? token.colorWarning : undefined,
                                }}
                                disabled={
                                    readOnly ||
                                    !runtime.online ||
                                    (!runtime.controls.bedtime && !runtime.controls.sleep)
                                }
                                onClick={openBedtimeControls}
                            />
                        </span>
                    </Tooltip>
                    {runtime.online && (
                        <Popconfirm
                            title={t("tonieboxes.live.shutdownConfirmTitle")}
                            description={t("tonieboxes.live.shutdownConfirmDescription")}
                            okText={t("tonieboxes.live.shutdownConfirmAction")}
                            cancelText={t("tonieboxes.live.bedtimeCancel")}
                            okButtonProps={{ danger: true }}
                            disabled={!shutdownControlEnabled}
                            onConfirm={shutdownNow}
                        >
                            <Tooltip
                                title={
                                    shutdownControlEnabled
                                        ? t("tonieboxes.live.shutdown")
                                        : t("tonieboxes.live.shutdownUnavailable")
                                }
                            >
                                <span>
                                    <Button
                                        aria-label={t("tonieboxes.live.shutdown")}
                                        type="text"
                                        danger
                                        icon={<PoweroffOutlined />}
                                        style={controlButtonStyle}
                                        disabled={!shutdownControlEnabled}
                                        loading={commandInFlight === "shutdown"}
                                    />
                                </span>
                            </Tooltip>
                        </Popconfirm>
                    )}
                </Flex>
            )}
            {hasActivePlayback && (
                <>
                    <Flex align="center" gap={12} style={{ minHeight: 64 }}>
                        {tonie?.tonieInfo.picture ? (
                            <img
                                src={tonie.tonieInfo.picture}
                                alt=""
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: token.borderRadius,
                                    objectFit: "contain",
                                    flex: "0 0 64px",
                                }}
                            />
                        ) : (
                            <div
                                aria-hidden="true"
                                style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: token.borderRadius,
                                    background: token.colorFillSecondary,
                                    flex: "0 0 64px",
                                }}
                            />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <Typography.Text type="secondary" ellipsis style={{ display: "block" }}>
                                {series}
                            </Typography.Text>
                            {tapPlaylist?.shuffleMode !== undefined && (
                                <Tag bordered={false} style={{ marginInlineEnd: 0, marginTop: 2 }}>
                                    {t(
                                        `tonieboxes.live.shuffleModes.${
                                            ["ordered", "all", "one"][tapPlaylist.shuffleMode]
                                        }`,
                                    )}
                                </Tag>
                            )}
                            {episode && (
                                <Typography.Text strong ellipsis style={{ display: "block" }}>
                                    {episode}
                                </Typography.Text>
                            )}
                            {currentTrack && (
                                <Typography.Text ellipsis style={{ display: "block" }}>
                                    {currentTrack}
                                </Typography.Text>
                            )}
                        </div>
                        <div style={{ textAlign: "right", flex: "0 0 auto" }}>
                            {chapterLabel && <Typography.Text>{chapterLabel}</Typography.Text>}
                            {remainingSeconds !== undefined && (
                                <Typography.Text type="secondary" style={{ display: "block" }}>
                                    -{formatPlaybackTime(remainingSeconds)}
                                </Typography.Text>
                            )}
                        </div>
                    </Flex>

                    <Flex justify="space-between" align="center" gap={4} style={{ marginTop: 12 }}>
                        <Tooltip title={t("tonieboxes.live.restart")}>
                            <Button
                                aria-label={t("tonieboxes.live.restart")}
                                type="text"
                                icon={<ReloadOutlined />}
                                style={controlButtonStyle}
                                disabled={!playbackEnabled || commandPending}
                                loading={commandInFlight === "restart"}
                                onClick={() => void sendPlayback("restart")}
                            />
                        </Tooltip>
                        <Tooltip title={t("tonieboxes.live.previous")}>
                            <Button
                                aria-label={t("tonieboxes.live.previous")}
                                type="text"
                                icon={<StepBackwardOutlined />}
                                style={controlButtonStyle}
                                disabled={!playbackEnabled || commandPending}
                                loading={commandInFlight === "prev"}
                                onClick={() => void sendPlayback("prev")}
                            />
                        </Tooltip>
                        <Tooltip
                            title={
                                middleAction
                                    ? t(`tonieboxes.live.${middleAction}`)
                                    : t("tonieboxes.live.playbackUnknown")
                            }
                        >
                            <Button
                                aria-label={
                                    middleAction
                                        ? t(`tonieboxes.live.${middleAction}`)
                                        : t("tonieboxes.live.playbackUnknown")
                                }
                                shape="circle"
                                icon={
                                    middleAction === "pause" ? (
                                        <PauseOutlined />
                                    ) : (
                                        <CaretRightOutlined />
                                    )
                                }
                                style={controlButtonStyle}
                                disabled={!playbackEnabled || !middleAction || commandPending}
                                loading={Boolean(middleAction && commandInFlight === middleAction)}
                                onClick={() => middleAction && void sendPlayback(middleAction)}
                            />
                        </Tooltip>
                        <Tooltip title={t("tonieboxes.live.next")}>
                            <Button
                                aria-label={t("tonieboxes.live.next")}
                                type="text"
                                icon={<StepForwardOutlined />}
                                style={controlButtonStyle}
                                disabled={!playbackEnabled || commandPending}
                                loading={commandInFlight === "next"}
                                onClick={() => void sendPlayback("next")}
                            />
                        </Tooltip>
                        <Tooltip title={t("tonieboxes.live.chapters")}>
                            <Button
                                aria-label={t("tonieboxes.live.chapters")}
                                type="text"
                                icon={<UnorderedListOutlined />}
                                style={controlButtonStyle}
                                disabled={tracks.length === 0 || commandPending}
                                onClick={() => setChapterDrawerOpen(true)}
                            />
                        </Tooltip>
                    </Flex>

                    <Space.Compact block style={{ marginTop: 10, alignItems: "center" }}>
                        <SoundOutlined
                            style={{ width: CONTROL_SIZE, color: token.colorTextSecondary }}
                        />
                        <Slider
                            aria-label={t("tonieboxes.live.volume")}
                            min={VOLUME_MIN}
                            max={VOLUME_MAX}
                            value={volume}
                            disabled={!volumeEnabled || commandPending}
                            onChange={setVolume}
                            onChangeComplete={(level) => void changeVolume(level)}
                            style={{ flex: 1, marginInline: 8 }}
                        />
                    </Space.Compact>
                </>
            )}

            <ChapterDrawer
                open={chapterDrawerOpen}
                title={series}
                editableTitle={customContent ? tonie?.playlist?.title : undefined}
                tracks={tracks}
                trackDurations={tonie?.playlist?.durations}
                currentChapter={chapterIndex}
                playbackEnabled={playbackEnabled && !commandPending}
                loadingChapter={
                    commandInFlight?.startsWith("chapter-")
                        ? Number(commandInFlight.substring("chapter-".length))
                        : undefined
                }
                editable={
                    !readOnly && (Boolean(tonie?.playlist?.editable) || Boolean(tapEditRoute))
                }
                onEditExternal={tapEditRoute ? editTap : undefined}
                onClose={() => setChapterDrawerOpen(false)}
                onSelectChapter={(index) => void selectChapter(index)}
                onSavePlaylist={savePlaylist}
            />

            <Modal
                open={bedtimeModalOpen}
                title={t("tonieboxes.live.bedtimeControl")}
                onCancel={() => setBedtimeModalOpen(false)}
                width={440}
                footer={
                    <Flex wrap gap={8} justify="flex-end">
                        <Button onClick={() => setBedtimeModalOpen(false)}>
                            {t("tonieboxes.live.bedtimeCancel")}
                        </Button>
                        {bedtimeActive && (
                            <Button
                                danger
                                disabled={!bedtimeControlEnabled}
                                loading={commandInFlight === "bedtime-off"}
                                onClick={() => void stopBedtime()}
                            >
                                {t("tonieboxes.live.bedtimeStop")}
                            </Button>
                        )}
                        {bedtimeActive && runtime.controls.sleep && (
                            <Button
                                icon={<PoweroffOutlined />}
                                disabled={!sleepControlEnabled}
                                loading={commandInFlight === "sleep"}
                                onClick={() => void sleepNow()}
                            >
                                {t("tonieboxes.live.sleepNow")}
                            </Button>
                        )}
                        <Button
                            type="primary"
                            disabled={
                                !bedtimeControlEnabled ||
                                (oneTimeAlarm && alarmTone.trim().length === 0)
                            }
                            loading={commandInFlight === "bedtime-on"}
                            onClick={() => void startBedtime()}
                        >
                            {bedtimeActive
                                ? t("tonieboxes.live.bedtimeUpdate")
                                : t("tonieboxes.live.bedtimeStart")}
                        </Button>
                    </Flex>
                }
            >
                <Flex vertical gap={8}>
                    <Typography.Text>{t("tonieboxes.live.bedtimeDurationLabel")}</Typography.Text>
                    <InputNumber
                        min={BEDTIME_MINUTES_MIN}
                        max={BEDTIME_MINUTES_MAX}
                        precision={0}
                        value={bedtimeMinutes}
                        addonAfter={t("tonieboxes.live.minutes")}
                        disabled={!bedtimeControlEnabled}
                        onChange={(value) =>
                            setBedtimeMinutes(
                                value === null
                                    ? BEDTIME_MINUTES_DEFAULT
                                    : Math.min(
                                          BEDTIME_MINUTES_MAX,
                                          Math.max(BEDTIME_MINUTES_MIN, Math.round(value)),
                                      ),
                            )
                        }
                        style={{ width: "100%" }}
                    />
                    <Typography.Text type="secondary">
                        {t("tonieboxes.live.bedtimeDurationHint")}
                    </Typography.Text>

                    <Divider style={{ marginBlock: 12 }} />

                    <Flex align="center" justify="space-between" gap={16}>
                        <div>
                            <Typography.Text>{t("tonieboxes.live.oneTimeAlarm")}</Typography.Text>
                            <Typography.Text type="secondary" style={{ display: "block" }}>
                                {t("tonieboxes.live.oneTimeAlarmHint")}
                            </Typography.Text>
                        </div>
                        <Switch
                            checked={oneTimeAlarm}
                            disabled={!bedtimeControlEnabled}
                            onChange={setOneTimeAlarm}
                        />
                    </Flex>

                    {oneTimeAlarm && (
                        <Flex vertical gap={8} style={{ marginTop: 8 }}>
                            <Typography.Text>{t("tonieboxes.live.alarmTone")}</Typography.Text>
                            <Input
                                value={alarmTone}
                                placeholder={t("tonieboxes.live.alarmTonePlaceholder")}
                                disabled={!bedtimeControlEnabled}
                                onChange={(event) => setAlarmTone(event.target.value)}
                            />
                            <Typography.Text>{t("tonieboxes.live.alarmVolume")}</Typography.Text>
                            <InputNumber
                                min={0}
                                max={100}
                                value={alarmVolume}
                                disabled={!bedtimeControlEnabled}
                                onChange={(value) => setAlarmVolume(value ?? ALARM_VOLUME_DEFAULT)}
                                style={{ width: "100%" }}
                            />
                            <Flex align="center" justify="space-between" gap={16}>
                                <Typography.Text>
                                    {t("tonieboxes.live.morningLight")}
                                </Typography.Text>
                                <Switch
                                    checked={morningLight}
                                    disabled={!bedtimeControlEnabled}
                                    onChange={setMorningLight}
                                />
                            </Flex>
                        </Flex>
                    )}

                    {bedtimeActive && (
                        <Typography.Text type="secondary" style={{ marginTop: 8 }}>
                            {t("tonieboxes.live.sleepHint")}
                        </Typography.Text>
                    )}
                </Flex>
            </Modal>
        </div>
    );
};
