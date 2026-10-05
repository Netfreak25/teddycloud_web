import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Empty, Flex, Grid } from "antd";

import { TonieboxCardProps } from "../../../types/tonieboxTypes";

import { TonieboxCard } from "../tonieboxcard/TonieboxCard";
import LoadingSpinner from "../../common/elements/LoadingSpinner";
import { useTeddyCloud } from "../../../provider/TeddyCloudProvider";
import { NotificationTypeEnum } from "../../../types/teddyCloudNotificationTypes";
import { useGetSettingCheckCC3200CFW } from "./hooks/useGetSettingCheckCC3200CFW";
import {
    DndContext,
    MouseSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import {
    getTonieboxOrderStorageKey,
    parseTonieboxOrder,
    orderTonieboxes,
    moveTonieboxOrder,
} from "../../../utils/tonieboxOrder";

const MOUSE_DRAG_DISTANCE = 6;

export const TonieboxesList: React.FC<{
    tonieboxCards: TonieboxCardProps[];
    readOnly?: boolean;
    sortable?: boolean;
    onRefresh?: () => Promise<void>;
}> = ({ tonieboxCards, readOnly = false, sortable = false, onRefresh }) => {
    const { t } = useTranslation();
    const { addNotification, boxModelImages, boxModelImagesLoading } = useTeddyCloud();
    const screens = Grid.useBreakpoint();
    const storageKey = getTonieboxOrderStorageKey(
        defaultAPIConfig().basePath,
        window.location.origin,
    );
    const [order, setOrder] = useState(() => {
        try {
            return sortable ? parseTonieboxOrder(localStorage.getItem(storageKey)) : [];
        } catch (error) {
            console.error("Could not read Toniebox order", error);
            return [];
        }
    });
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE } }),
    );
    const cards = sortable && !readOnly ? orderTonieboxes(tonieboxCards, order) : tonieboxCards;
    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over) return;
        const next = moveTonieboxOrder(
            cards.map((box) => box.ID),
            String(active.id),
            String(over.id),
        );
        if (!next) return;
        setOrder(next);
        try {
            localStorage.setItem(storageKey, JSON.stringify(next));
        } catch (error) {
            console.error("Could not save Toniebox order", error);
        }
    };

    const columns = screens.xxl
        ? 4
        : screens.xl
          ? 3
          : screens.lg
            ? 3
            : screens.md
              ? 2
              : screens.sm
                ? 2
                : 1;

    const checkCC3200CFW = useGetSettingCheckCC3200CFW();

    useEffect(() => {
        if (!boxModelImagesLoading && boxModelImages.length === 0) {
            addNotification(
                NotificationTypeEnum.Error,
                t("settings.notifications.error"),
                t("tonieboxes.errorFetchingModels"),
                t("tonieboxes.navigationTitle"),
            );
        }
    }, [boxModelImagesLoading, boxModelImages.length, addNotification, t]);

    if (boxModelImagesLoading) {
        return <LoadingSpinner />;
    }

    const noDataTonieboxes = (
        <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
                <div>
                    <p>{t("tonieboxes.noData")}</p>
                    <p>{t("tonieboxes.noDataText")}</p>
                </div>
            }
        />
    );

    if (!tonieboxCards.length) {
        return noDataTonieboxes;
    }

    const content = (
        <Flex wrap gap={16}>
            {tonieboxCards.length === 0 ? (
                <div style={{ width: "100%", textAlign: "center" }}>{noDataTonieboxes}</div>
            ) : (
                cards.map((toniebox) => (
                    <div
                        key={toniebox.ID}
                        style={{
                            flex: `0 0 calc(${100 / columns}% - 16px)`,
                            maxWidth: `calc(${100 / columns}% - 16px)`,
                        }}
                    >
                        <TonieboxCard
                            tonieboxCard={toniebox}
                            tonieboxImages={boxModelImages}
                            readOnly={readOnly}
                            sortable={sortable && !readOnly}
                            checkCC3200CFW={checkCC3200CFW}
                            onRefresh={onRefresh}
                        />
                    </div>
                ))
            )}
        </Flex>
    );

    return sortable && !readOnly ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={cards.map((box) => box.ID)} strategy={rectSortingStrategy}>
                {content}
            </SortableContext>
        </DndContext>
    ) : (
        content
    );
};
