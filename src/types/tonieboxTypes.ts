export type TonieboxImage = {
    id: string;
    name: string;
    img_src: string;
    crop?: number[];
};

export type TonieboxPlaybackStatus = "unknown" | "playing" | "paused" | "stopped";

export type TonieboxRuntimeControls = {
    playback: boolean;
    volume: boolean;
    ping: boolean;
    bedtime: boolean;
};

export type TonieboxPlaybackRuntime = {
    valid: boolean;
    status: TonieboxPlaybackStatus;
    updatedAt: number;
    tonie: string | null;
    ruid: string | null;
    contentVersion: number | null;
    chapter: number | null;
    chapterUntilMs: number | null;
    chapterDuration: string | null;
};

export type TonieboxVolumeRuntime = {
    valid: boolean;
    updatedAt: number;
    level: number | null;
};

export type TonieboxBatteryRuntime = {
    valid: boolean;
    updatedAt: number;
    percent: number | null;
    status: string | null;
};

export type TonieboxHeadphonesRuntime = {
    valid: boolean;
    updatedAt: number;
    speakerOutput: boolean | null;
    connectedCount: number | null;
};

export type TonieboxBedtimeRuntime = {
    valid: boolean;
    updatedAt: number;
    state: string | null;
    duration: number | null;
    defaultDuration: number | null;
    until: string | null;
};

export type TonieboxPongRuntime = {
    valid: boolean;
    updatedAt: number;
    requestId: string | null;
    roundTripMs: number | null;
};

export type TonieboxDiagnosticSnapshot = {
    valid: boolean;
    updatedAt: number;
    truncated: boolean;
    data: unknown;
};

export type TonieboxRuntime = {
    online: boolean;
    lastConnection: number;
    controls: TonieboxRuntimeControls;
    playback: TonieboxPlaybackRuntime;
    volume: TonieboxVolumeRuntime;
    battery: TonieboxBatteryRuntime;
    headphones: TonieboxHeadphonesRuntime;
    bedtime: TonieboxBedtimeRuntime;
    pong: TonieboxPongRuntime;
    diagnostics: {
        setup: TonieboxDiagnosticSnapshot;
        events: TonieboxDiagnosticSnapshot;
        fleet: TonieboxDiagnosticSnapshot;
        alarm: TonieboxDiagnosticSnapshot;
    };
};

export type TonieboxPlaybackAction = "start" | "pause" | "next" | "prev" | "restart";

export type TonieboxPlaybackCommand =
    | { action: TonieboxPlaybackAction }
    | { action: "setPosition"; chapter: number; ms: number };

export type TonieboxCommandResponse = {
    ok: boolean;
    message?: string;
    error?: string;
    requestId?: string;
};

export type TonieboxCardProps = {
    ID: string;
    commonName: string;
    boxName: string;
    boxModel: string;
    runtime?: TonieboxRuntime;
};

export type TonieboxCardsList = {
    boxes: TonieboxCardProps[];
};

export enum BoxVersionsEnum {
    unknown = "UNKNOWN",
    cc3200 = "CC3200",
    cc3235 = "CC3235",
    esp32 = "ESP32",
    tb2 = "TB2",
}
