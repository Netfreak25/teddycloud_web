import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Upload, type InputRef, type TreeSelectProps, type UploadProps } from "antd";
import type { DragEndEvent } from "@dnd-kit/core";
import { PointerSensor, useSensor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { TeddyCloudApi } from "../../../../api";
import { defaultAPIConfig } from "../../../../config/defaultApiConfig";
import { MAX_FILES } from "../../../../constants/numbers";
import { useTeddyCloud } from "../../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../../types/teddyCloudNotificationTypes";
import { MyUploadFile, upload as encoderUpload } from "../../../../utils/audio/audioEncoder";
import {
    isInputValid,
    INVALID_NAME_CHARS_DISPLAY as invalidCharactersAsString,
} from "../../../../utils/validation/fieldInputValidator";
import { ffmpegSupportedExtensions } from "../../../../utils/files/ffmpegSupportedExtensions";
import { createQueryString } from "../../../../utils/browser/queryParams";
import { encodeBrowserAudio } from "../../../../utils/audio/wasmEncoder";
import {
    encoderChapterTitle,
    encoderUsesBrowser,
    LEGACY_ENCODER_CAPABILITIES,
    parseEncoderCapabilities,
    type EncoderFormat,
} from "../../../../utils/audio/encoderProtocol";
import {
    inspectEncoderInputs,
    supportsBrowserEncoding,
    type EncoderPreflight,
} from "../../../../utils/audio/encoderPreflight";
import { useDirectoryTree } from "../../common/hooks/useDirectoryTree";

const api = new TeddyCloudApi(defaultAPIConfig());
const apiBase = defaultAPIConfig().basePath;

async function encoderRequest(path: string, init?: RequestInit) {
    const response = await fetch(`${apiBase}${path}`, init);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    return response;
}

export const useEncoder = () => {
    const { t } = useTranslation();
    const { addNotification, addLoadingNotification, closeLoadingNotification } = useTeddyCloud();

    const [debugPCMObjects, setDebugPCMObjects] = useState(false);
    const [tafFrontendPreference, setUseFrontendEncoding] = useState(false);
    const [useFrontendEncodingSetting, setUseFrontendEncodingSetting] = useState(false);
    const [bitrate, setBitrate] = useState(96);
    const [outputFormat, setOutputFormat] = useState<EncoderFormat>("taf");
    const useFrontendEncoding = encoderUsesBrowser(outputFormat, tafFrontendPreference);
    const [capabilities, setCapabilities] = useState(LEGACY_ENCODER_CAPABILITIES);
    const [capabilitiesLoading, setCapabilitiesLoading] = useState(true);
    const [preflight, setPreflight] = useState<EncoderPreflight>();
    const [preflightLoading, setPreflightLoading] = useState(false);
    const [nativeSource, setNativeSource] = useState("");
    const encodingAbort = useRef<AbortController | null>(null);

    const [fileList, setFileList] = useState<MyUploadFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [tafFilename, setTafFilename] = useState("");

    const [isCreateDirectoryModalOpen, setCreateDirectoryModalOpen] = useState(false);
    const [createDirectoryPath, setCreateDirectoryPath] = useState<string>("");
    const [rebuildList, setRebuildList] = useState<boolean>(false);

    const [hasInvalidChars, setHasInvalidChars] = useState(false);

    const inputRef = useRef<InputRef>(null);

    // -------------------------------------------------
    // Initial Settings + Tree preload
    // -------------------------------------------------

    useEffect(() => {
        const fetchDebugPCM = async () => {
            try {
                const response = await api.apiGetTeddyCloudSettingRaw(
                    "debug.web.pcm_encode_console_url",
                );
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                setDebugPCMObjects(data.toString() === "true");
            } catch (error) {
                console.error("Error fetching debug.web.pcm_encode_console_url: ", error);
            }
        };

        const fetchUseFrontendSetting = async () => {
            try {
                const response = await api.apiGetTeddyCloudSettingRaw("encode.use_frontend");
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                const useFrontend = data.toString() === "true";
                setUseFrontendEncodingSetting(useFrontend);
                setUseFrontendEncoding(useFrontend);
            } catch (error) {
                console.error("Error fetching encode.use_frontend: ", error);
            }
        };

        const fetchBitrateSetting = async () => {
            try {
                const response = await api.apiGetTeddyCloudSettingRaw("encode.bitrate");
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const data = await response.json();
                const bitrateSetting = parseInt(data.toString(), 10);
                if (!isNaN(bitrateSetting)) setBitrate(bitrateSetting);
            } catch (error) {
                console.error("Error fetching encode.bitrate: ", error);
            }
        };

        fetchDebugPCM();
        fetchUseFrontendSetting();
        fetchBitrateSetting();
        const controller = new AbortController();
        fetch(`${apiBase}/api/encoder/capabilities`, { signal: controller.signal })
            .then(async (response) => {
                if (response.status === 404) return LEGACY_ENCODER_CAPABILITIES;
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return parseEncoderCapabilities(await response.json());
            })
            .then(setCapabilities)
            .catch((error) => {
                if (!controller.signal.aborted)
                    console.error("Encoder capabilities unavailable", error);
            })
            .finally(() => {
                if (!controller.signal.aborted) setCapabilitiesLoading(false);
            });
        return () => {
            controller.abort();
            encodingAbort.current?.abort();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        setPreflight(undefined);
        if (!useFrontendEncoding || !fileList.length) {
            setPreflightLoading(false);
            return;
        }
        const controller = new AbortController();
        setPreflightLoading(true);
        const timer = window.setTimeout(() => {
            void inspectEncoderInputs(
                fileList.flatMap((file) => (file.file ? [file.file] : [])),
                bitrate,
                outputFormat,
                controller.signal,
            )
                .then((result) => {
                    if (!controller.signal.aborted) setPreflight(result);
                })
                .catch((error) => {
                    if (!controller.signal.aborted)
                        console.error("Encoder preflight failed", error);
                })
                .finally(() => {
                    if (!controller.signal.aborted) setPreflightLoading(false);
                });
        }, 200);
        return () => {
            clearTimeout(timer);
            controller.abort();
        };
    }, [fileList, bitrate, outputFormat, useFrontendEncoding]);

    const maxFiles = useFrontendEncoding ? capabilities.formats[outputFormat].maxFiles : MAX_FILES;
    const inputCountExceeded = maxFiles !== null && fileList.length > maxFiles;
    const browserSupported = supportsBrowserEncoding();
    const canEncode =
        !inputCountExceeded &&
        (!useFrontendEncoding ||
            (browserSupported &&
                !capabilitiesLoading &&
                !preflightLoading &&
                capabilities.formats[outputFormat].enabled));

    // Autofocus fürs eigene kleine Input-Feld, falls du es nutzen willst
    useEffect(() => {
        if (isCreateDirectoryModalOpen) {
            setTimeout(() => {
                inputRef.current?.focus();
            }, 0);
        }
    }, [isCreateDirectoryModalOpen]);

    // -------------------------------------------------
    // Tree / Pfade + Helper-Funktionen fürs Modal
    // -------------------------------------------------

    const directoryTree = useDirectoryTree();
    const { treeNodeId, setTreeData, getPathFromNodeId } = directoryTree;

    // -------------------------------------------------
    // DnD / Upload-Liste
    // -------------------------------------------------

    const sensor = useSensor(PointerSensor, {
        activationConstraint: { distance: 10 },
    });

    const onDragEnd = ({ active, over }: DragEndEvent) => {
        if (active.id !== over?.id) {
            setFileList((prev) => {
                const activeIndex = prev.findIndex((i) => i.uid === active.id);
                const overIndex = prev.findIndex((i) => i.uid === over?.id);
                if (activeIndex === -1 || overIndex === -1) return prev;
                return arrayMove(prev, activeIndex, overIndex);
            });
        }
    };

    const onChangeUpload: UploadProps["onChange"] = ({ fileList: newFileList }) => {
        // Preserve every selected file; unsupported counts disable start instead of discarding audio.
        const updatedFileList = newFileList as MyUploadFile[];

        if (updatedFileList.length === 1 && tafFilename === "") {
            const singleFile = updatedFileList[0];
            const fileNameWithoutExtension = singleFile.name.replace(/\.[^/.]+$/, "");
            setTafFilename(fileNameWithoutExtension);
        }

        setFileList(updatedFileList);
    };

    const onRemoveUpload = (file: MyUploadFile) => {
        setFileList((prev) => prev.filter((f) => f.uid !== file.uid));
    };

    const uploadProps: UploadProps = {
        listType: "picture",
        multiple: true,
        accept: ffmpegSupportedExtensions.join(","),
        beforeUpload: (file) => {
            const isAccepted = ffmpegSupportedExtensions.some((ext) =>
                file.name.toLowerCase().endsWith(ext.toLowerCase()),
            );

            if (!isAccepted) {
                addNotification(
                    NotificationTypeEnum.Error,
                    t("tonies.encoder.unsupportedFileType"),
                    t("tonies.encoder.unsupportedFileTypeDetails", { file: file.name }),
                    t("tonies.title"),
                );
                return Upload.LIST_IGNORE;
            }

            const myFile: MyUploadFile = file;
            myFile.file = file;
            setFileList((prev) => [...prev, myFile]);
            return false;
        },
        fileList,
        onChange: onChangeUpload,
    };

    const sortFileListAlphabeticallyLiteral = () => {
        setFileList((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
    };

    const sortFileListAlphabeticallyNatural = () => {
        setFileList((prev) =>
            [...prev].sort((a, b) =>
                a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
            ),
        );
    };

    const clearFileList = () => {
        setFileList([]);
    };

    // -------------------------------------------------
    // CreateDirectoryModal-Handling
    // -------------------------------------------------

    const openCreateDirectoryModal = () => {
        const currentPath = getPathFromNodeId(treeNodeId); // ohne / am Ende
        setCreateDirectoryPath(currentPath);
        setCreateDirectoryModalOpen(true);
    };

    const closeCreateDirectoryModal = () => {
        setCreateDirectoryModalOpen(false);
    };

    // -------------------------------------------------
    // Filename input
    // -------------------------------------------------

    const handleFileNameInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setHasInvalidChars(!isInputValid(value));
        setTafFilename(value);
    };

    // -------------------------------------------------
    // Server-side Upload
    // -------------------------------------------------

    const handleUpload = async () => {
        if (fileList.length > MAX_FILES || !fileList.length) return;
        setUploading(true);
        const formData = new FormData();
        const key = "encoding-" + tafFilename + ".taf";

        addLoadingNotification(key, t("tonies.encoder.uploading"), t("tonies.encoder.uploading"));

        for (const file of fileList) {
            addLoadingNotification(
                key,
                t("tonies.encoder.uploading"),
                t("tonies.encoder.uploadingDetails", { file: file.name }),
            );
            try {
                await new Promise<void>((resolve, reject) =>
                    (encoderUpload as any)(
                        resolve,
                        reject,
                        formData,
                        fileList,
                        file,
                        debugPCMObjects,
                    ),
                );
            } catch (error) {
                addNotification(
                    NotificationTypeEnum.Error,
                    t("tonies.encoder.processingError"),
                    t("tonies.encoder.errorFileProcessing") + error,
                    t("tonies.title"),
                );
                closeLoadingNotification(key);
                setUploading(false);
                return;
            }
        }

        const currentUnixTime = Math.floor(Date.now() / 1000);
        const queryParams = {
            name: tafFilename + ".taf",
            audioId: currentUnixTime - 0x50000000,
            path: getPathFromNodeId(treeNodeId),
            special: "library",
        };

        setProcessing(true);
        const queryString = createQueryString(queryParams);

        try {
            addLoadingNotification(
                key,
                t("tonies.encoder.processing"),
                t("tonies.encoder.processingDetails", { file: tafFilename + ".taf" }),
            );
            const response = await api.apiPostTeddyCloudFormDataRaw(
                `/api/pcmUpload?${queryString}`,
                formData,
            );
            closeLoadingNotification(key);
            if (response.ok) {
                addNotification(
                    NotificationTypeEnum.Success,
                    t("tonies.encoder.uploadSuccessful"),
                    t("tonies.encoder.uploadSuccessfulDetails", { file: tafFilename + ".taf" }),
                    t("tonies.title"),
                );
                setFileList([]);
                setTafFilename("");
            } else {
                addNotification(
                    NotificationTypeEnum.Error,
                    t("tonies.encoder.uploadFailed"),
                    t("tonies.encoder.uploadFailedDetails") + response.statusText,
                    t("tonies.title"),
                );
            }
        } catch (err) {
            closeLoadingNotification(key);
            addNotification(
                NotificationTypeEnum.Error,
                t("tonies.encoder.uploadFailed"),
                t("tonies.encoder.uploadFailedDetails") + err,
                t("tonies.title"),
            );
        } finally {
            setProcessing(false);
            setUploading(false);
        }
    };

    // -------------------------------------------------
    // Browser-side (WASM) Upload
    // -------------------------------------------------

    const handleWasmUpload = async () => {
        if (!canEncode || !fileList.length || encodingAbort.current) return;
        const controller = new AbortController();
        encodingAbort.current = controller;
        setUploading(true);
        setProcessing(true);
        setNativeSource("");
        const resultName = outputFormat === "taf" ? `${tafFilename}.taf` : tafFilename;
        const key = "encoding-" + resultName;
        let importId = "";
        let published = false;

        try {
            const files = fileList.map((file) => {
                if (!file.file) throw new Error(`Missing input: ${file.name}`);
                return file.file;
            });
            if (outputFormat === "native") {
                const metadata = JSON.stringify({
                    title: tafFilename,
                    chapters: files.map((file) => ({ title: encoderChapterTitle(file.name) })),
                });
                if (
                    new TextEncoder().encode(metadata).length >
                    capabilities.formats.native.maxMetadataBytes
                )
                    throw new Error(t("tonies.encoder.metadataTooLarge"));
                const begin = await encoderRequest("/api/library/native/import", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: metadata,
                    signal: controller.signal,
                });
                const data = await begin.json();
                if (typeof data.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(data.id))
                    throw new Error("Invalid import ID");
                importId = data.id;
            }
            await encodeBrowserAudio(files, {
                format: outputFormat,
                audioId: Math.floor(Date.now() / 1000) - 0x50000000,
                bitrate,
                signal: controller.signal,
                maxBytes:
                    outputFormat === "taf"
                        ? capabilities.formats.taf.maxUploadBytes
                        : capabilities.formats.native.maxChapterBytes,
                onProgress: (current, total, currentFile) => {
                    if (current >= total) return;
                    addLoadingNotification(
                        key,
                        t("tonies.encoder.processing"),
                        `${t("tonies.encoder.encoding")} ${current + 1}/${total}: ${currentFile}`,
                    );
                },
                onFile: async (file, index) => {
                    addLoadingNotification(
                        key,
                        t("tonies.encoder.uploading"),
                        t("tonies.encoder.uploadingDetails", { file: file.name }),
                    );
                    if (outputFormat === "native") {
                        await encoderRequest(
                            `/api/library/native/import/${importId}/chapter/${index}`,
                            {
                                method: "POST",
                                headers: { "Content-Type": "audio/ogg" },
                                body: file,
                                signal: controller.signal,
                            },
                        );
                    } else {
                        const queryString = createQueryString({
                            name: resultName,
                            path: getPathFromNodeId(treeNodeId),
                            special: "library",
                        });
                        const body = new FormData();
                        body.append("file", file, resultName);
                        await encoderRequest(`/api/tafUpload?${queryString}`, {
                            method: "POST",
                            body,
                            signal: controller.signal,
                        });
                    }
                },
            });
            if (outputFormat === "native") {
                const response = await encoderRequest(
                    `/api/library/native/import/${importId}/finish`,
                    { method: "POST", signal: controller.signal },
                );
                const result = await response.json();
                if (typeof result.source !== "string") throw new Error("Missing collection source");
                setNativeSource(result.source);
            }
            published = true;
            addNotification(
                NotificationTypeEnum.Success,
                t("tonies.encoder.uploadSuccessful"),
                t("tonies.encoder.uploadSuccessfulDetails", { file: resultName }),
                t("tonies.title"),
            );
            setFileList([]);
            setTafFilename("");
        } catch (err) {
            const detail = err instanceof Error ? err.message : String(err);
            const errorKey = /encoder_error_1|encoder_memory_failed/.test(detail)
                ? "memoryError"
                : /encoder_error_2|storage_write_failed|QuotaExceededError/.test(detail)
                  ? "storageError"
                  : /encoder_error_3/.test(detail)
                    ? "headerError"
                    : /encoder_error_6|output_limit/.test(detail)
                      ? "outputLimitWarning"
                      : /encoder_version_mismatch/.test(detail)
                        ? "encoderVersionError"
                        : undefined;
            addNotification(
                NotificationTypeEnum.Error,
                controller.signal.aborted
                    ? t("tonies.encoder.cancelled")
                    : t("tonies.encoder.uploadFailed"),
                controller.signal.aborted
                    ? t("tonies.encoder.cancelledDetails")
                    : errorKey
                      ? t(`tonies.encoder.${errorKey}`)
                      : t("tonies.encoder.uploadFailedDetails") + detail,
                t("tonies.title"),
            );
        } finally {
            if (importId && !published) {
                try {
                    await encoderRequest(`/api/library/native/import/${importId}`, {
                        method: "DELETE",
                        signal: AbortSignal.timeout(10000),
                    });
                } catch (error) {
                    console.error("Could not remove incomplete native import", error);
                }
            }
            closeLoadingNotification(key);
            encodingAbort.current = null;
            setProcessing(false);
            setUploading(false);
        }
    };

    return {
        // State
        fileList,
        uploading,
        processing,
        tafFilename,
        hasInvalidChars,
        useFrontendEncoding,
        useFrontendEncodingSetting,
        outputFormat,
        capabilities,
        maxFiles,
        inputCountExceeded,
        browserSupported,
        preflight,
        preflightLoading,
        canEncode,
        nativeSource,
        isCreateDirectoryModalOpen,
        createDirectoryPath,
        inputRef,

        // Actions
        setUseFrontendEncoding,
        setOutputFormat,
        cancelEncoding: () => encodingAbort.current?.abort(),
        sortFileListAlphabeticallyLiteral,
        sortFileListAlphabeticallyNatural,
        clearFileList,
        openCreateDirectoryModal,
        closeCreateDirectoryModal,
        setCreateDirectoryPath,
        handleFileNameInputChange,
        handleUpload,
        handleWasmUpload,

        // DnD / Upload
        sensor,
        onDragEnd,
        uploadProps,
        onRemoveUpload,

        directoryTree,

        // CreateDirectoryModal
        setRebuildList,
        setTreeData,

        // Helper
        invalidCharactersAsString,
    };
};
