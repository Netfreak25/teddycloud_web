import type { TonieboxControlReason, TonieboxRuntime } from "../../../../types/tonieboxTypes";

type ControlRuntime = Pick<TonieboxRuntime, "controls" | "controlReasons">;

/** Explain a backend denial only; never derive permissions from MQTT settings. */
export const getControlReason = (
    runtime: ControlRuntime,
    control: keyof ControlRuntime["controls"],
): TonieboxControlReason | undefined => {
    if (runtime.controls[control]) return undefined;
    const reason = runtime.controlReasons?.[control];
    switch (reason) {
        case "cloud_controlled":
        case "offline":
        case "not_subscribed":
            return reason;
        default:
            // Older backends omit reasons; newer backends may add unknown ones.
            return undefined;
    }
};

/** Shutdown needs STL only when bedtime is not already active. */
export const getShutdownControlReason = (
    runtime: ControlRuntime,
    bedtimeActive: boolean,
): TonieboxControlReason | undefined => {
    if (!runtime.controls.sleep) return getControlReason(runtime, "sleep");
    return !bedtimeActive ? getControlReason(runtime, "bedtime") : undefined;
};
