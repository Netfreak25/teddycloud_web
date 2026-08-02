import { useEffect, useRef, useState } from "react";
import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { useNewBoxesAllowed } from "../../../../hooks/getsettings/useGetSettingNewBoxesAllowed";
import { useTonieboxes } from "../../../../hooks/useTonieboxes";
import { useTonies } from "../../../../hooks/useTonies";

const api = new TeddyCloudApi(defaultAPIConfig());

export const useHomeData = () => {
    const { tonieboxes, loading: loadingTonieboxes, refreshTonieboxes } = useTonieboxes();
    const { value: newBoxesAllowed } = useNewBoxesAllowed();
    const {
        tonies,
        defaultLanguage,
        loading: loadingTonies,
    } = useTonies({
        merged: true,
        shuffle: true,
    });

    const [displayIncidentAlert, setDisplayIncidentAlert] = useState(false);
    const [accessApiEnabled, setAccessApiEnabled] = useState<[string, boolean][]>([]);

    const [activeTab, setActiveTab] = useState(localStorage.getItem("homeActiveTab") ?? "tonies");
    const tonieboxAccessSignature = tonieboxes
        .map((box) => `${box.ID}:${box.boxName}`)
        .sort()
        .join("|");
    const tonieboxesRef = useRef(tonieboxes);
    tonieboxesRef.current = tonieboxes;

    useEffect(() => {
        localStorage.setItem("homeActiveTab", activeTab);
    }, [activeTab]);

    useEffect(() => {
        api.apiGetSecurityMITAlert().then(setDisplayIncidentAlert);
    }, []);

    useEffect(() => {
        const boxes = tonieboxesRef.current;
        if (!newBoxesAllowed || boxes.length === 0) return;

        (async () => {
            const result = await Promise.all(
                boxes.map(async (box) => {
                    const enabled = await api.apiGetTonieboxApiAccess(box.ID);
                    return [box.boxName, enabled] as [string, boolean];
                }),
            );
            setAccessApiEnabled(result);
        })();
    }, [newBoxesAllowed, tonieboxAccessSignature]);

    return {
        tonies,
        tonieboxes,
        refreshTonieboxes,
        displayIncidentAlert,
        loading: loadingTonies || loadingTonieboxes,
        accessApiEnabled,
        newBoxesAllowed,

        defaultLanguage,

        activeTab,
        setActiveTab,
    };
};
