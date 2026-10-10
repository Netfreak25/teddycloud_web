import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { useTeddyCloud } from "../../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { TeddyCloudPlugin } from "../../plugincard/PluginCard";
import {
    DEFAULT_PLUGIN_LIST_STATE,
    filterPluginList,
    normalizePluginListState,
    paginatePlugins,
} from "../pluginListState";

const api = new TeddyCloudApi(defaultAPIConfig());
const STORAGE_KEY = "pluginListState";

export const usePluginList = () => {
    const { t } = useTranslation();
    const { addNotification, plugins, fetchPlugins } = useTeddyCloud();

    const [isVisibleHelpModal, setIsVisibleHelpModal] = useState(false);
    const [pluginIdForDeletion, setPluginIdForDeletion] = useState<string>("");
    const [isConfirmDeleteModalOpen, setIsConfirmDeleteModalOpen] = useState(false);

    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [hiddenOnly, setHiddenOnly] = useState(false);
    const [page, setPage] = useState(1);
    const [storageUnavailable, setStorageUnavailable] = useState(false);
    const [{ pageSize, showAll }, setPreferences] = useState(() => {
        try {
            return normalizePluginListState(
                JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"),
            );
        } catch (error) {
            console.warn("Could not read plugin list preferences; using defaults", error);
            return DEFAULT_PLUGIN_LIST_STATE;
        }
    });

    useEffect(() => {
        if (storageUnavailable) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ pageSize, showAll }));
        } catch (error) {
            console.warn("Could not save plugin list preferences", error);
            setStorageUnavailable(true);
        }
    }, [pageSize, showAll, storageUnavailable]);

    const allSections = useMemo(
        () =>
            Array.from(
                new Set(
                    plugins.map(
                        (p: any) => p.teddyCloudSection || t("community.plugins.filter.unknown"),
                    ),
                ),
            ),
        [plugins, t],
    );

    const [activeSectionFilters, setActiveSectionFilters] = useState<string[]>(allSections);

    useEffect(() => {
        setActiveSectionFilters(allSections);
    }, [allSections]);

    const pluginCountBySection = useMemo(
        () =>
            (plugins as TeddyCloudPlugin[]).reduce<Record<string, number>>((acc, plugin) => {
                const section = plugin.teddyCloudSection || t("community.plugins.filter.unknown");
                acc[section] = (acc[section] || 0) + 1;
                return acc;
            }, {}),
        [plugins, t],
    );

    const filteredPlugins = useMemo(
        () =>
            filterPluginList(
                plugins as TeddyCloudPlugin[],
                activeSectionFilters,
                hiddenOnly,
                t("community.plugins.filter.unknown"),
            ),
        [plugins, activeSectionFilters, hiddenOnly, t],
    );
    const hiddenPluginCount = plugins.filter((plugin) => plugin.hideInNav === true).length;
    const { items: visiblePlugins, currentPage } = paginatePlugins(
        filteredPlugins,
        page,
        pageSize,
        showAll,
    );

    useEffect(() => {
        setPage(currentPage);
    }, [currentPage]);

    const toggleSectionFilter = (section: string, checked: boolean) => {
        setPage(1);
        setActiveSectionFilters((prev) =>
            checked ? [...prev, section] : prev.filter((s) => s !== section),
        );
    };

    const toggleHiddenFilter = (checked: boolean) => {
        setHiddenOnly(checked);
        setPage(1);
    };

    const changePage = (current: number, size: number) => {
        setPage(size === pageSize ? current : 1);
        setPreferences({ pageSize: size, showAll: false });
    };

    const toggleShowAll = () => {
        setPreferences({ pageSize, showAll: !showAll });
        setPage(1);
    };

    const openHelp = () => setIsVisibleHelpModal(true);
    const closeHelp = () => setIsVisibleHelpModal(false);

    const openUpload = () => setIsUploadModalOpen(true);
    const closeUpload = () => {
        setFile(null);
        setIsUploadModalOpen(false);
    };

    const handleUpload = async () => {
        if (!file) {
            addNotification(
                NotificationTypeEnum.Warning,
                t("community.plugins.upload.warningUploadingPlugin"),
                t("community.plugins.upload.warningUploadingPluginDetails"),
                t("community.plugins.title"),
            );
            return;
        }

        const formData = new FormData();
        formData.append("file", file);
        setUploading(true);

        try {
            const response = await api.apiPostTeddyCloudFormDataRaw(
                `/api/plugins/upload`,
                formData,
            );

            if (!response.ok) throw new Error(response.statusText);
            addNotification(
                NotificationTypeEnum.Success,
                t("community.plugins.upload.successUploadingPlugin"),
                t("community.plugins.upload.successUploadingPluginDetails", {
                    filename: file.name,
                }),
                t("community.plugins.title"),
            );
            setFile(null);
            closeUpload();
            fetchPlugins();
        } catch (error: any) {
            addNotification(
                NotificationTypeEnum.Error,
                t("community.plugins.upload.errorUploadingPlugin"),
                t("community.plugins.upload.errorUploadingPluginDetails", {
                    filename: file.name,
                }) + error,
                t("community.plugins.title"),
            );
        } finally {
            setUploading(false);
        }
    };

    const handleConfirmDelete = async () => {
        try {
            const response = await api.apiPostTeddyCloudRaw(
                `/api/plugins/delete/${pluginIdForDeletion}`,
            );

            if (!response.ok) throw new Error(response.statusText);
            addNotification(
                NotificationTypeEnum.Success,
                t("community.plugins.deletion.successDeletingPlugin"),
                t("community.plugins.deletion.successDeletingPluginDetails", {
                    filename: pluginIdForDeletion,
                }),
                t("community.plugins.title"),
            );
            setFile(null);
            closeUpload();
            fetchPlugins();
        } catch (error: any) {
            addNotification(
                NotificationTypeEnum.Error,
                t("community.plugins.deletion.errorDeletingPlugin"),
                t("community.plugins.deletion.errorDeletingPluginDetails", {
                    filename: pluginIdForDeletion,
                }) + error,
                t("community.plugins.title"),
            );
        }
        setIsConfirmDeleteModalOpen(false);
    };

    const handleCancelDelete = () => {
        setIsConfirmDeleteModalOpen(false);
    };

    const requestDelete = (pluginId: string) => {
        setPluginIdForDeletion(pluginId);
        setIsConfirmDeleteModalOpen(true);
    };

    return {
        // data
        plugins: plugins as TeddyCloudPlugin[],
        filteredPlugins,
        visiblePlugins,
        hiddenOnly,
        hiddenPluginCount,
        pageSize,
        showAll,
        currentPage,
        storageUnavailable,
        allSections,
        activeSectionFilters,
        pluginCountBySection,

        // filters
        toggleSectionFilter,
        toggleHiddenFilter,
        changePage,
        toggleShowAll,

        // help modal
        isVisibleHelpModal,
        openHelp,
        closeHelp,

        // upload modal
        isUploadModalOpen,
        openUpload,
        closeUpload,
        file,
        setFile,
        uploading,
        handleUpload,

        // delete dialog
        isConfirmDeleteModalOpen,
        pluginIdForDeletion,
        requestDelete,
        handleConfirmDelete,
        handleCancelDelete,
    };
};
