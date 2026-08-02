import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { TeddyCloudApi } from "../api";
import { defaultAPIConfig } from "../config/defaultApiConfig";
import { TonieboxCardProps } from "../types/tonieboxTypes";
import { useTeddyCloud } from "../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../types/teddyCloudNotificationTypes";

const api = new TeddyCloudApi(defaultAPIConfig());
const TONIEBOX_POLL_INTERVAL_MS = 2000;

export const useTonieboxes = () => {
    const { t } = useTranslation();
    const { addNotification } = useTeddyCloud();

    const [tonieboxes, setTonieboxes] = useState<TonieboxCardProps[]>([]);
    const [loading, setLoading] = useState(true);
    const errorReported = useRef(false);

    const refreshTonieboxes = useCallback(async () => {
        try {
            const data = await api.apiGetTonieboxesIndex();
            setTonieboxes(data);
            errorReported.current = false;
        } catch (error) {
            if (!errorReported.current) {
                errorReported.current = true;
                addNotification(
                    NotificationTypeEnum.Error,
                    t("tonieboxes.errorFetchingTonieboxes"),
                    t("tonieboxes.errorFetchingTonieboxes") + ": " + error,
                    t("tonieboxes.navigationTitle"),
                );
            }
        } finally {
            setLoading(false);
        }
    }, [addNotification, t]);

    useEffect(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let disposed = false;

        const schedule = () => {
            if (!disposed && document.visibilityState === "visible") {
                timer = setTimeout(run, TONIEBOX_POLL_INTERVAL_MS);
            }
        };

        const run = async () => {
            await refreshTonieboxes();
            schedule();
        };

        const handleVisibilityChange = () => {
            if (timer) {
                clearTimeout(timer);
                timer = undefined;
            }
            if (document.visibilityState === "visible") {
                void run();
            }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        void run();

        return () => {
            disposed = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [refreshTonieboxes]);

    return { tonieboxes, loading, refreshTonieboxes };
};
