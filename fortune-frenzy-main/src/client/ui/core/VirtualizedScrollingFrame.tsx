import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { usePxScale } from "client/hooks/use-scale";

interface VirtualizedScrollingFrameProps {
	size: UDim2;
	position: UDim2;
	anchorPoint?: Vector2;
	backgroundTransparency?: number;
	scrollBarThickness?: number;
	items: JSX.Element[];
	rowHeight: number;
	itemsPerRow: number;
	cellSize?: UDim2;
	cellPadding?: UDim2;
	layout?: "grid" | "list";
	listPadding?: UDim;
	overscanFactor?: number;
	visible?: boolean;
	padding?: {
		left?: number;
		right?: number;
	};
}

export function VirtualizedScrollingFrame({
	size,
	position,
	anchorPoint = new Vector2(0, 0),
	backgroundTransparency = 1,
	scrollBarThickness = 0,
	items,
	rowHeight,
	itemsPerRow,
	cellSize,
	cellPadding,
	layout = "grid",
	listPadding,
	overscanFactor = 2,
	visible = true,
	padding,
}: VirtualizedScrollingFrameProps) {
	const scaleFactor = usePxScale()();

	const scaledRowHeight = rowHeight;
	const baseRowHeight = scaleFactor === 0 ? scaledRowHeight : scaledRowHeight / scaleFactor;

	const [firstVisibleRow, setFirstVisibleRow] = useState(0);
	const [lastVisibleRow, setLastVisibleRow] = useState(10);
	const [canvasSize, setCanvasSize] = useState(new UDim2(1, 0, 0, 0));

	const scrollingRef = useRef<ScrollingFrame>(undefined);

	useEffect(() => {
		if (!visible) return;

		const totalRows = math.ceil(items.size() / itemsPerRow);
		setCanvasSize(new UDim2(1, 0, 0, baseRowHeight * totalRows));
	}, [items, baseRowHeight, itemsPerRow, visible]);

	useEffect(() => {
		if (!scrollingRef.current || !visible) return;

		const scrollingFrame = scrollingRef.current;

		const updateVisibleRows = () => {
			const first = math.floor(scrollingFrame.CanvasPosition.Y / scaledRowHeight);
			const rowsVisible = math.floor(scrollingFrame.AbsoluteWindowSize.Y / scaledRowHeight);
			const overscanRows = rowsVisible * overscanFactor;
			const last = first + rowsVisible + overscanRows;

			setFirstVisibleRow(first);
			setLastVisibleRow(last);
		};

		updateVisibleRows();

		const connection = scrollingFrame.GetPropertyChangedSignal("CanvasPosition").Connect(updateVisibleRows);
		return () => connection.Disconnect();
	}, [scaledRowHeight, overscanFactor, visible]);

	const visibleItems = useMemo(() => {
		const startIdx = firstVisibleRow * itemsPerRow;
		const endIdx = lastVisibleRow * itemsPerRow;
		return items
			.filter((_, index) => index >= startIdx && index < endIdx)
			.map((element, index) =>
				React.cloneElement(element, {
					LayoutOrder: startIdx + index,
				}),
			);
	}, [items, firstVisibleRow, lastVisibleRow, itemsPerRow]);

	return (
		<scrollingframe
			ref={scrollingRef}
			CanvasSize={canvasSize}
			Size={size}
			Position={position}
			AnchorPoint={anchorPoint}
			BackgroundTransparency={backgroundTransparency}
			ScrollingDirection={Enum.ScrollingDirection.Y}
			ScrollBarThickness={scrollBarThickness}
			BorderSizePixel={0}
			HorizontalScrollBarInset={Enum.ScrollBarInset.None}
			Visible={visible}
		>
			{layout === "grid" ? (
				<uigridlayout CellPadding={cellPadding!} CellSize={cellSize!} SortOrder={Enum.SortOrder.LayoutOrder} />
			) : (
				<uilistlayout Padding={listPadding ?? new UDim(0, 0)} SortOrder={Enum.SortOrder.LayoutOrder} />
			)}
			<uipadding
				PaddingTop={new UDim(0, math.max(2, baseRowHeight * firstVisibleRow))}
				PaddingLeft={new UDim(0, padding?.left ?? 0)}
				PaddingRight={new UDim(0, padding?.right ?? 0)}
			/>
			{visibleItems}
		</scrollingframe>
	);
}
