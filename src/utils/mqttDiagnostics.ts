import JSZip from "jszip";
import { defaultAPIConfig } from "../config/defaultApiConfig";

export const MQTT_DEBUG_SETTING = "mqtt_server.debug_enabled";
export const MQTT_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;
const MANIFEST_RESERVE_BYTES = 64 * 1024;
const SAFE_IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const API_PATH = "/api/diagnostics/mqtt";

export interface MqttDiagnosticFile {
    name: string;
    size: number;
}

export interface MqttDiagnosticSession {
    id: string;
    startedAt: string;
    active: boolean;
    truncated: boolean;
    files: MqttDiagnosticFile[];
}

export interface MqttDiagnosticStatus {
    enabled: boolean;
    state: "disabled" | "armed" | "recording" | "error";
    error: string;
    bytes: number;
    droppedEvents: number;
    sessions: MqttDiagnosticSession[];
}

export interface MqttArchiveEntry extends MqttDiagnosticFile {
    session: string;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);
const isByteCount = (value: unknown): value is number =>
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const isIdentifier = (value: unknown): value is string =>
    typeof value === "string" && SAFE_IDENTIFIER.test(value) && value !== "." && value !== "..";

/** Reject malformed metadata before using it for paths, sizes or download snapshots. */
export const parseMqttDiagnosticStatus = (value: unknown): MqttDiagnosticStatus => {
    if (
        !isObject(value) ||
        typeof value.enabled !== "boolean" ||
        typeof value.state !== "string" ||
        !["disabled", "armed", "recording", "error"].includes(value.state) ||
        typeof value.error !== "string" ||
        !isByteCount(value.bytes) ||
        !isByteCount(value.droppedEvents) ||
        !Array.isArray(value.sessions)
    ) {
        throw new Error("Invalid MQTT diagnostics status");
    }
    const sessionIds = new Set<string>();
    for (const session of value.sessions) {
        if (
            !isObject(session) ||
            !isIdentifier(session.id) ||
            sessionIds.has(session.id) ||
            typeof session.startedAt !== "string" ||
            typeof session.active !== "boolean" ||
            typeof session.truncated !== "boolean" ||
            !Array.isArray(session.files)
        ) {
            throw new Error("Invalid MQTT diagnostic session");
        }
        sessionIds.add(session.id);
        const names = new Set<string>();
        for (const file of session.files) {
            if (
                !isObject(file) ||
                !isIdentifier(file.name) ||
                names.has(file.name) ||
                !isByteCount(file.size)
            ) {
                throw new Error("Invalid MQTT diagnostic file");
            }
            names.add(file.name);
        }
    }
    return value as unknown as MqttDiagnosticStatus;
};

export const mqttDiagnosticUrl = (overlay: string, file?: MqttArchiveEntry): string => {
    const query = new URLSearchParams({ overlay });
    if (file) {
        query.set("session", file.session);
        query.set("file", file.name);
        query.set("length", String(file.size));
    }
    return `${defaultAPIConfig().basePath.replace(/\/$/, "")}${API_PATH}${file ? "/file" : ""}?${query}`;
};

/** Stable grouping bounds each archive's input, including its manifest, to 64 MiB. */
export const buildMqttArchiveParts = (sessions: MqttDiagnosticSession[]): MqttArchiveEntry[][] => {
    const entries = sessions
        .flatMap((session) => session.files.map((file) => ({ ...file, session: session.id })))
        .sort((left, right) => {
            const a = `${left.session}/${left.name}`;
            const b = `${right.session}/${right.name}`;
            return a < b ? -1 : a > b ? 1 : 0;
        });
    const parts: MqttArchiveEntry[][] = [];
    let bytes = 0;
    for (const entry of entries) {
        if (
            !isByteCount(entry.size) ||
            entry.size > MQTT_ARCHIVE_MAX_BYTES - MANIFEST_RESERVE_BYTES
        )
            throw new Error(`MQTT diagnostic file exceeds the archive limit: ${entry.name}`);
        if (
            parts.length === 0 ||
            bytes + entry.size > MQTT_ARCHIVE_MAX_BYTES - MANIFEST_RESERVE_BYTES
        ) {
            parts.push([]);
            bytes = 0;
        }
        parts[parts.length - 1].push(entry);
        bytes += entry.size;
    }
    return parts;
};

/** Download exact prefixes from one status snapshot; never silently accept rotated files. */
export const createMqttDiagnosticArchive = async (
    overlay: string,
    sessions: MqttDiagnosticSession[],
    entries: MqttArchiveEntry[],
    part: number,
    totalParts: number,
    signal?: AbortSignal,
): Promise<Blob> => {
    const manifest = JSON.stringify(
        {
            format: "teddycloud-mqtt-diagnostics-v1",
            overlay,
            part,
            totalParts,
            snapshot: true,
            sessions: sessions
                .filter((session) => entries.some((entry) => entry.session === session.id))
                .map(({ files, ...session }) => session),
            files: entries,
        },
        null,
        2,
    );
    if (
        new TextEncoder().encode(manifest).length > MANIFEST_RESERVE_BYTES ||
        entries.reduce((sum, entry) => sum + entry.size, 0) >
            MQTT_ARCHIVE_MAX_BYTES - MANIFEST_RESERVE_BYTES
    ) {
        throw new Error("MQTT diagnostic archive exceeds the input limit");
    }
    const zip = new JSZip();
    zip.file("manifest.json", manifest);
    for (const entry of entries) {
        const response = await fetch(mqttDiagnosticUrl(overlay, entry), {
            cache: "no-store",
            signal,
        });
        if (!response.ok)
            throw new Error(`HTTP ${response.status}: ${entry.session}/${entry.name}`);
        const body = await response.arrayBuffer();
        if (body.byteLength !== entry.size)
            throw new Error(`Incomplete MQTT diagnostic snapshot: ${entry.session}/${entry.name}`);
        zip.file(`${entry.session}/${entry.name}`, body);
    }
    signal?.throwIfAborted();
    return zip.generateAsync({ type: "blob", compression: "STORE" });
};
