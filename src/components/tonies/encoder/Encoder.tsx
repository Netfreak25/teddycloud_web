import React from "react";
import {
    Alert,
    Button,
    Divider,
    Dropdown,
    Input,
    Select,
    Space,
    Switch,
    Tooltip,
    Typography,
    Upload,
    theme,
} from "antd";
import { useTranslation } from "react-i18next";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { EllipsisOutlined, FolderAddOutlined, InboxOutlined } from "@ant-design/icons";
import { DndContext } from "@dnd-kit/core";
import { humanFileSize } from "../../../utils/files/humanFileSize";
import { LARGE_DECODE_BYTES } from "../../../utils/audio/encoderPreflight";
import { estimateTafHeaderMaximum } from "../../../utils/audio/encoderProtocol";
import { MyUploadFile } from "../../../utils/audio/audioEncoder";
import { DraggableUploadListItem } from "../common/elements/DraggableUploadListItem";
import { useEncoder } from "./hooks/useEncoder";
import { useDirectoryCreate } from "../common/hooks/useCreateDirectory";
import { DirectoryTreeSelect } from "../common/elements/DirectoryTreeSelect";
import CreateDirectoryModal from "../common/modals/CreateDirectoryModal";
import { canHover } from "../../../utils/browser/browserUtils";

const { useToken } = theme;

export const Encoder: React.FC = () => {
    const { t } = useTranslation();
    const { token } = useToken();

    const {
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

        // Actions
        setUseFrontendEncoding,
        setOutputFormat,
        cancelEncoding,
        sortFileListAlphabeticallyLiteral,
        sortFileListAlphabeticallyNatural,
        clearFileList,
        handleFileNameInputChange,
        handleUpload,
        handleWasmUpload,

        // DnD / Upload
        sensor,
        onDragEnd,
        uploadProps,
        onRemoveUpload,

        // Directory tree
        directoryTree,

        // CreateDirectory / Encoder
        setRebuildList,

        // Helper
        invalidCharactersAsString,
    } = useEncoder();

    const {
        open: isCreateDirectoryModalOpen,
        createDirectoryPath,
        createDirectoryInputKey,
        hasNewDirectoryInvalidChars,
        isCreateDirectoryButtonDisabled,
        inputCreateDirectoryRef,
        openCreateDirectoryModal,
        closeCreateDirectoryModal,
        handleCreateDirectoryInputChange,
        createDirectory,
    } = useDirectoryCreate({
        directoryTree,
        selectNewNode: true,
        setRebuildList,
    });

    const sortMenu = [
        {
            key: "literal",
            label: t("tonies.encoder.sortAlphabeticallyLiteral"),
            onClick: () => sortFileListAlphabeticallyLiteral(),
            disabled: uploading,
        },
        {
            key: "natural",
            label: t("tonies.encoder.sortAlphabeticallyNatural"),
            onClick: () => sortFileListAlphabeticallyNatural(),
            disabled: uploading,
        },
    ];

    return (
        <>
            <Space orientation="vertical" style={{ display: "flex" }}>
                <Space wrap>
                    <Switch
                        checkedChildren={t("tonies.encoder.browserSideEncoding")}
                        unCheckedChildren={t("tonies.encoder.serverSideEncoding")}
                        defaultChecked={useFrontendEncodingSetting}
                        checked={useFrontendEncoding}
                        onChange={setUseFrontendEncoding}
                        disabled={uploading || processing || outputFormat === "native"}
                    />
                    <Select
                        aria-label={t("tonies.encoder.outputFormat")}
                        value={outputFormat}
                        onChange={setOutputFormat}
                        disabled={uploading || processing}
                        style={{ minWidth: 230 }}
                        options={[
                            { value: "taf", label: t("tonies.encoder.tafFormat") },
                            {
                                value: "native",
                                label: t("tonies.encoder.nativeFormat"),
                                disabled: !capabilities.formats.native.enabled,
                            },
                        ]}
                    />
                </Space>
                {useFrontendEncoding && !browserSupported && (
                    <Alert type="error" showIcon title={t("tonies.encoder.browserUnavailable")} />
                )}
                {outputFormat === "native" && (
                    <Alert
                        type="info"
                        showIcon
                        title={t("tonies.encoder.nativeDestination")}
                        description={t("tonies.encoder.nativeBrowserRequired")}
                    />
                )}
                {nativeSource && (
                    <Alert
                        type="success"
                        title={t("tonies.encoder.nativeCreated")}
                        description={<Typography.Text copyable>{nativeSource}</Typography.Text>}
                    />
                )}
                <DndContext sensors={[sensor]} onDragEnd={onDragEnd}>
                    <SortableContext
                        items={fileList.map((i) => i.uid)}
                        strategy={verticalListSortingStrategy}
                        disabled={uploading}
                    >
                        <Upload.Dragger
                            {...uploadProps}
                            disabled={uploading}
                            itemRender={(originNode, file) => (
                                <DraggableUploadListItem
                                    originNode={originNode}
                                    fileList={fileList}
                                    file={file as MyUploadFile}
                                    onRemove={onRemoveUpload}
                                    disabled={uploading}
                                />
                            )}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">{t("tonies.encoder.uploadAudioText")}</p>
                            <p className="ant-upload-hint">{t("tonies.encoder.uploadHint")}</p>
                        </Upload.Dragger>
                    </SortableContext>
                </DndContext>

                {fileList.length > 0 ? (
                    <>
                        {inputCountExceeded && (
                            <Alert
                                type="error"
                                showIcon
                                title={t("tonies.encoder.maxFiles", { maxFiles })}
                            />
                        )}
                        {useFrontendEncoding && outputFormat === "taf" && fileList.length > 99 && (
                            <Alert
                                type="warning"
                                showIcon
                                title={t("tonies.encoder.extendedTafWarning")}
                            />
                        )}
                        {useFrontendEncoding && preflightLoading && (
                            <Alert type="info" title={t("tonies.encoder.preflightRunning")} />
                        )}
                        {useFrontendEncoding && preflight && (
                            <Alert
                                type={
                                    preflight.storageWarning ||
                                    preflight.resources.decodedBytes >= LARGE_DECODE_BYTES
                                        ? "warning"
                                        : "info"
                                }
                                showIcon
                                title={t("tonies.encoder.preflightTitle")}
                                description={
                                    <>
                                        <div>
                                            {t("tonies.encoder.preflightEstimate", {
                                                minutes: Math.ceil(
                                                    preflight.resources.totalSeconds / 60,
                                                ),
                                                output: humanFileSize(
                                                    preflight.resources.totalBytes,
                                                ),
                                                memory: humanFileSize(
                                                    preflight.resources.decodedBytes,
                                                ),
                                            })}
                                        </div>
                                        {!preflight.resources.complete && (
                                            <div>
                                                {t("tonies.encoder.preflightUnknown", {
                                                    count: preflight.resources.unknownFiles,
                                                })}
                                            </div>
                                        )}
                                        {outputFormat === "taf" &&
                                            estimateTafHeaderMaximum(fileList.length) >
                                                (capabilities.formats.taf.headerBytes || 4092) && (
                                                <div>{t("tonies.encoder.headerWarning")}</div>
                                            )}
                                        {preflight.resources.diskBytes >=
                                            (outputFormat === "taf"
                                                ? capabilities.formats.taf.maxUploadBytes
                                                : capabilities.formats.native.maxChapterBytes) && (
                                            <div>{t("tonies.encoder.outputLimitWarning")}</div>
                                        )}
                                        {preflight.storageWarning && (
                                            <div>{t("tonies.encoder.storageWarning")}</div>
                                        )}
                                        {preflight.resources.decodedBytes >= LARGE_DECODE_BYTES && (
                                            <div>{t("tonies.encoder.decodeWarning")}</div>
                                        )}
                                        <div>{t("tonies.encoder.preflightDisclaimer")}</div>
                                    </>
                                }
                            />
                        )}
                        <Space
                            orientation="horizontal"
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                            }}
                        >
                            <Space.Compact>
                                <Button
                                    style={{ width: "unset" }}
                                    onClick={() => sortFileListAlphabeticallyLiteral()}
                                    disabled={uploading}
                                >
                                    {t("tonies.encoder.sortAlphabeticallyLiteral")}
                                </Button>{" "}
                                <Dropdown
                                    menu={{ items: sortMenu }}
                                    disabled={uploading}
                                    placement="bottomRight"
                                    trigger={["click"]}
                                >
                                    <Button style={{ width: "unset" }}>
                                        <EllipsisOutlined />
                                    </Button>
                                </Dropdown>
                            </Space.Compact>

                            <Button
                                type="default"
                                disabled={uploading}
                                style={{ marginRight: 16 }}
                                onClick={clearFileList}
                            >
                                {t("tonies.encoder.clearList")}
                            </Button>
                        </Space>
                        <Divider />
                        <div style={{ width: "100%" }} className="encoder">
                            <Space orientation="vertical" style={{ width: "100%" }}>
                                <Space.Compact
                                    className="encoder-save-compact"
                                    orientation="horizontal"
                                    style={{
                                        width: "100%",
                                        display: "flex",
                                        alignItems: "flex-end",
                                        justifyContent: "flex-end",
                                    }}
                                >
                                    <Input
                                        type="text"
                                        className="encoder-save-label"
                                        style={{
                                            maxWidth: 180,
                                            borderTopRightRadius: 0,
                                            borderBottomRightRadius: 0,
                                        }}
                                        disabled
                                        value={t("tonies.encoder.saveAs")}
                                    />

                                    <DirectoryTreeSelect
                                        className="encoder-save-dir"
                                        directoryTree={directoryTree}
                                        disabled={
                                            processing || uploading || outputFormat === "native"
                                        }
                                        placeholder={t(
                                            "fileBrowser.moveFile.destinationPlaceholder",
                                        )}
                                    />

                                    <Tooltip
                                        open={!canHover ? false : undefined}
                                        title={t("fileBrowser.createDirectory.createDirectory")}
                                    >
                                        <Button
                                            className="encoder-save-btn"
                                            disabled={
                                                uploading || processing || outputFormat === "native"
                                            }
                                            icon={<FolderAddOutlined />}
                                            onClick={() => {
                                                const basePath = directoryTree.getPathFromNodeId(
                                                    directoryTree.treeNodeId,
                                                );
                                                openCreateDirectoryModal(basePath);
                                            }}
                                            style={{ borderRadius: 0 }}
                                        />
                                    </Tooltip>

                                    <Input
                                        className="encoder-save-name"
                                        suffix={outputFormat === "taf" ? ".taf" : undefined}
                                        required
                                        value={tafFilename}
                                        style={{ maxWidth: 300 }}
                                        status={
                                            (fileList.length > 0 && tafFilename === "") ||
                                            hasInvalidChars
                                                ? "error"
                                                : ""
                                        }
                                        onChange={handleFileNameInputChange}
                                        disabled={uploading || processing}
                                    />
                                </Space.Compact>
                                {hasInvalidChars ? (
                                    <div style={{ textAlign: "end", color: token.colorErrorText }}>
                                        {t("inputValidator.invalidCharactersDetected", {
                                            invalidChar: invalidCharactersAsString,
                                        })}
                                    </div>
                                ) : null}
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "row",
                                        justifyContent: "flex-end",
                                        alignItems: "center",
                                        marginTop: 8,
                                        gap: 16,
                                    }}
                                >
                                    {useFrontendEncoding && (uploading || processing) && (
                                        <Button onClick={cancelEncoding}>
                                            {t("tonies.encoder.cancel")}
                                        </Button>
                                    )}
                                    <Button
                                        type="primary"
                                        onClick={
                                            useFrontendEncoding ? handleWasmUpload : handleUpload
                                        }
                                        disabled={
                                            fileList.length === 0 ||
                                            tafFilename === "" ||
                                            hasInvalidChars ||
                                            !canEncode
                                        }
                                        loading={uploading || processing}
                                    >
                                        {uploading
                                            ? processing
                                                ? t("tonies.encoder.processing")
                                                : t("tonies.encoder.uploading")
                                            : t("tonies.encoder.encode")}
                                    </Button>
                                </div>
                            </Space>
                        </div>
                    </>
                ) : null}
            </Space>

            {isCreateDirectoryModalOpen && (
                <CreateDirectoryModal
                    open={isCreateDirectoryModalOpen}
                    createDirectoryPath={createDirectoryPath}
                    createDirectoryInputKey={createDirectoryInputKey}
                    hasNewDirectoryInvalidChars={hasNewDirectoryInvalidChars}
                    isCreateDirectoryButtonDisabled={isCreateDirectoryButtonDisabled}
                    inputRef={inputCreateDirectoryRef}
                    onInputChange={handleCreateDirectoryInputChange}
                    onClose={closeCreateDirectoryModal}
                    onCreate={createDirectory}
                />
            )}
        </>
    );
};
