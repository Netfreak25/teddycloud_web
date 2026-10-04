import React, { useMemo, useState } from "react";
import { Alert, Flex, theme } from "antd";
import { useTranslation } from "react-i18next";
import {
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    closestCenter,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    rectSortingStrategy,
    sortableKeyboardCoordinates,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { defaultAPIConfig } from "../../../config/defaultApiConfig";
import type { TonieboxCardProps } from "../../../types/tonieboxTypes";
import type { TonieboxDragHandleProps } from "../tonieboxcard/TonieboxCard";
import {
    getTonieboxOrderStorageKey,
    moveTonieboxOrder,
    orderTonieboxes,
    parseTonieboxOrder,
} from "../../../utils/tonieboxOrder";

const MOUSE_DRAG_DISTANCE = 6;
const TOUCH_HOLD_MS = 250;
const TOUCH_MOVE_TOLERANCE = 5;
const CARD_GAP = 16;

type RenderCard = (box: TonieboxCardProps, handle: TonieboxDragHandleProps) => React.ReactNode;

/** Keep the existing live card mounted; only its surrounding grid cell moves. */
const SortableBox = ({
    box,
    columns,
    renderCard,
}: {
    box: TonieboxCardProps;
    columns: number;
    renderCard: RenderCard;
}) => {
    const { t } = useTranslation();
    const { token } = theme.useToken();
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: box.ID });

    return (
        <div
            ref={setNodeRef}
            style={{
                flex: `0 0 calc(${100 / columns}% - ${CARD_GAP}px)`,
                maxWidth: `calc(${100 / columns}% - ${CARD_GAP}px)`,
                minWidth: 0,
                position: "relative",
                transform: CSS.Translate.toString(transform),
                transition,
                zIndex: isDragging ? 1 : undefined,
                boxShadow: isDragging ? token.boxShadowSecondary : undefined,
            }}
        >
            {renderCard(box, {
                ...attributes,
                ...listeners,
                ref: setActivatorNodeRef,
                "aria-label": t("tonieboxes.sorting.handle", { name: box.boxName }),
                title: t("tonieboxes.sorting.hint"),
                style: { cursor: isDragging ? "grabbing" : "grab" },
            })}
        </div>
    );
};

/** Browser-only presentation order. Polling still supplies every live card value. */
export const SortableTonieboxes = ({
    tonieboxCards,
    columns,
    renderCard,
}: {
    tonieboxCards: TonieboxCardProps[];
    columns: number;
    renderCard: RenderCard;
}) => {
    const { t } = useTranslation();
    const storageKey = getTonieboxOrderStorageKey(
        defaultAPIConfig().basePath,
        window.location.origin,
    );
    const [saved, setSaved] = useState(() => {
        try {
            return {
                order: parseTonieboxOrder(localStorage.getItem(storageKey)),
                unavailable: false,
            };
        } catch {
            return { order: [] as string[], unavailable: true };
        }
    });
    const orderedCards = useMemo(
        () => orderTonieboxes(tonieboxCards, saved.order),
        [tonieboxCards, saved.order],
    );
    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE } }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: TOUCH_HOLD_MS, tolerance: TOUCH_MOVE_TOLERANCE },
        }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = ({ active, over }: DragEndEvent) => {
        if (!over) return;
        const order = moveTonieboxOrder(
            tonieboxCards,
            saved.order,
            String(active.id),
            String(over.id),
        );
        if (!order) return;
        let unavailable = saved.unavailable;
        try {
            localStorage.setItem(storageKey, JSON.stringify(order));
        } catch {
            unavailable = true;
        }
        setSaved({ order, unavailable });
    };

    const describe = (key: string, id: string | number, targetId = id) => {
        const box = orderedCards.find((item) => item.ID === id);
        const position = orderedCards.findIndex((item) => item.ID === targetId);
        if (!box || position < 0) return undefined;
        return t(`tonieboxes.sorting.${key}`, {
            name: box.boxName,
            position: position + 1,
            count: orderedCards.length,
        });
    };

    return (
        <>
            {saved.unavailable && (
                <Alert
                    type="warning"
                    showIcon
                    title={t("tonieboxes.sorting.storageWarning")}
                    style={{ marginBottom: CARD_GAP }}
                />
            )}
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                accessibility={{
                    screenReaderInstructions: { draggable: t("tonieboxes.sorting.instructions") },
                    announcements: {
                        onDragStart: ({ active }) => describe("pickedUp", active.id),
                        onDragOver: ({ active, over }) =>
                            over ? describe("moved", active.id, over.id) : undefined,
                        onDragEnd: ({ active, over }) =>
                            over
                                ? describe("dropped", active.id, over.id)
                                : t("tonieboxes.sorting.cancelled"),
                        onDragCancel: () => t("tonieboxes.sorting.cancelled"),
                    },
                }}
            >
                <SortableContext
                    items={orderedCards.map((box) => box.ID)}
                    strategy={rectSortingStrategy}
                >
                    <Flex wrap gap={CARD_GAP}>
                        {orderedCards.map((box) => (
                            <SortableBox
                                key={box.ID}
                                box={box}
                                columns={columns}
                                renderCard={renderCard}
                            />
                        ))}
                    </Flex>
                </SortableContext>
            </DndContext>
        </>
    );
};
