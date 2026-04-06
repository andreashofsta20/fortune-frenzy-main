import React, { useCallback, useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { Corner } from "../tools/Corner";
import { Item } from "typings/APIResponses";
import { brighten, setValue } from "client/utils/color-utils";
import { usePxScale } from "client/hooks/use-scale";
import { formatWithSuffix } from "shared/util/number-utils";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Button } from "../core/Button";
import { Functions } from "client/network";
import { useAtom } from "@rbxts/react-charm";
import { currentSelectedPlayerAtom, newTradeStateAtom, isLoadingAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";

interface Props extends React.PropsWithChildren {
	visible: boolean;
	flashMenu: () => void;
}

const ItemTile = React.memo(
	({
		item,
		layoutOrder,
		side,
		selectedCount,
		quantityLabel,
		onRemove,
		onAdd,
	}: {
		item?: Item;
		layoutOrder: number;
		side: "local" | "other";
		selectedCount: number;
		quantityLabel: string;
		onRemove: () => void;
		onAdd: () => void;
	}) => {
		const px = usePx();
		const pxScale = usePxScale();

		if (!item) {
			return (
				<imagebutton
					BackgroundTransparency={1}
					Image={"rbxassetid://132230011497693"}
					ImageColor3={palette.background6}
					LayoutOrder={layoutOrder}
					Event={{ Activated: onAdd }}
				>
					<imagelabel
						AnchorPoint={new Vector2(0.5, 0.5)}
						Position={new UDim2(0.5, 0, 0.5, 0)}
						Size={new UDim2(0, px(25), 0, px(25))}
						BackgroundTransparency={1}
						Image="rbxassetid://82058407140864"
						ImageColor3={palette.background6}
					/>
				</imagebutton>
			);
		}

		return (
			<imagebutton
				BackgroundColor3={setValue(Color3.fromHex(item.color), 220)}
				ClipsDescendants={true}
				LayoutOrder={layoutOrder}
				Event={{ Activated: selectedCount > 0 ? onRemove : onAdd }}
			>
				<Corner roundness="small" />
				<uistroke Color={setValue(Color3.fromHex(item.color), 110)} Thickness={px(1)} />
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromRGB(77, 77, 77)),
							new ColorSequenceKeypoint(0.32, Color3.fromRGB(115, 115, 115)),
							new ColorSequenceKeypoint(1, Color3.fromRGB(59, 59, 59)),
						])
					}
					Rotation={-135}
				/>
				<imagelabel
					Image={"rbxassetid://16301282541"}
					ImageColor3={setValue(Color3.fromHex(item.color), 220)}
					ImageTransparency={0}
					ScaleType={Enum.ScaleType.Fit}
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundTransparency={1}
					Position={new UDim2(0, px(64), 0, px(64))}
					Size={new UDim2(0, px(310), 0, px(310))}
					ZIndex={-1}
				/>
				<imagelabel
					Image={`rbxthumb://type=Asset&id=${item.asset_id}&w=420&h=420`}
					ScaleType={Enum.ScaleType.Fit}
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundTransparency={1}
					Position={new UDim2(0.5, 0, 0, px(35))}
					Size={new UDim2(0, px(100), 0, px(55))}
				/>
				<frame
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0.5, 0)}
					Position={new UDim2(0.5, 0, 0, px(65))}
					Size={new UDim2(1, px(-15), 0, px(75))}
				>
					<uilistlayout
						Padding={new UDim(0, px(3))}
						HorizontalAlignment={Enum.HorizontalAlignment.Center}
						SortOrder={Enum.SortOrder.LayoutOrder}
						VerticalAlignment={Enum.VerticalAlignment.Center}
					/>
					<TextLabel
						weight="SemiBold"
						typeface="Sans"
						native={{
							TextColor3: palette.white,
							AutomaticSize: Enum.AutomaticSize.Y,
							TextSize: px(15),
							TextTruncate: Enum.TextTruncate.AtEnd,
							Size: new UDim2(1, 0, 0, px(1)),
							Text: `${item.name}${quantityLabel}`,
							LayoutOrder: 1,
							AutoLocalize: false,
						}}
					>
						<uisizeconstraint MaxSize={new Vector2(math.huge, px(50) * pxScale())} />
					</TextLabel>
					<TextLabel
						weight="Regular"
						typeface="Sans"
						native={{
							TextColor3: brighten(setValue(Color3.fromHex(item.color), 220), 0.7),
							Text: `${formatWithSuffix(item.value, 1)} Value`,
							TextSize: px(13),
							Size: new UDim2(1, 0, 0, px(13)),
							LayoutOrder: 3,
						}}
					/>
				</frame>
			</imagebutton>
		);
	},
);

const ItemGrid = React.memo(
	({
		items,
		side,
		selection,
		updateSelection,
		setSelectingFor,
	}: {
		items: (Item | "empty")[];
		side: "local" | "other";
		selection: Record<string, number>;
		updateSelection: (id: string, quantity: number) => void;
		setSelectingFor: (value: "none" | "local" | "other") => void;
	}) => {
		const px = usePx();
		const renderedCountByItemId = new Map<string, number>();

		return (
			<frame
				BackgroundTransparency={1}
				AnchorPoint={side === "local" ? new Vector2(0, 1) : new Vector2(1, 1)}
				Size={new UDim2(0, px(400), 0, px(310))}
				Position={side === "local" ? new UDim2(0, px(25), 1, px(-65)) : new UDim2(1, px(-25), 1, px(-65))}
			>
				<uigridlayout
					CellPadding={new UDim2(0, px(5), 0, px(5))}
					CellSize={new UDim2(0, px(95), 0, px(145))}
					FillDirection={Enum.FillDirection.Horizontal}
					HorizontalAlignment={Enum.HorizontalAlignment.Left}
					SortOrder={Enum.SortOrder.LayoutOrder}
					VerticalAlignment={Enum.VerticalAlignment.Top}
				/>
				{items.map((item, index) => {
					const itemId = item !== "empty" ? item.id : undefined;
					const selectedCount = itemId ? selection[itemId] || 0 : 0;
					const renderedCount = itemId ? renderedCountByItemId.get(itemId) || 0 : 0;
					const quantityLabel =
						itemId && renderedCount === 0 && selectedCount > 1 ? ` (x${selectedCount})` : "";
					if (itemId) renderedCountByItemId.set(itemId, renderedCount + 1);
					const onRemove = itemId
						? () => updateSelection(itemId, math.max(selectedCount - 1, 0))
						: () => setSelectingFor(side);
					const onAdd = itemId ? () => updateSelection(itemId, selectedCount + 1) : onRemove;

					return (
						<ItemTile
							key={item === "empty" ? `empty-${index}` : `${item!.id}-${index}`}
							item={item === "empty" ? undefined : item}
							layoutOrder={index}
							side={side}
							selectedCount={selectedCount}
							quantityLabel={quantityLabel}
							onRemove={onRemove}
							onAdd={onAdd}
						/>
					);
				})}
			</frame>
		);
	},
);

export const CreateTrade = React.memo(({ visible, flashMenu, children }: Props) => {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const newTradeState = useAtom(newTradeStateAtom);

	const handleCloseButton = useCallback(() => {
		currentSelectedPlayerAtom(undefined);
		newTradeStateAtom({
			selectedPlayerInventory: undefined,
			currentlySelectingFor: "none",
			localSelection: {},
			otherSelection: {},
			otherPlayerInfo: { userId: "", username: "", display_name: "" },
		});
	}, []);

	const updateSelection = useCallback((side: "local" | "other", id: string, quantity: number) => {
		newTradeStateAtom((prev) => ({
			...prev,
			[side === "local" ? "localSelection" : "otherSelection"]: {
				...prev[side === "local" ? "localSelection" : "otherSelection"],
				[id]: quantity,
			},
		}));
	}, []);

	const setSelectingFor = useCallback((value: "none" | "local" | "other") => {
		newTradeStateAtom((prev) => ({ ...prev, currentlySelectingFor: value }));
	}, []);

	const data = useMemo(() => {
		function buildItems(selection: Record<string, number>): LuaTuple<[number, (Item | "empty")[]]> {
			let value = 0;
			const items: (Item | "empty")[] = [];
			for (const [id, quantity] of pairs(selection)) {
				const item = clientStateController.ItemInfo.get(id as string);
				if (!item) continue;
				value += item.value * quantity;
				for (let i = 0; i < quantity; i++) items.push(item);
			}
			const emptySlots = 8 - items.size();
			for (let i = 0; i < emptySlots; i++) items.push("empty");
			return $tuple(value, items);
		}

		const [localValue, localItems] = buildItems(newTradeState.localSelection);
		const [otherValue, otherItems] = buildItems(newTradeState.otherSelection);

		return { other: { value: otherValue, items: otherItems }, local: { value: localValue, items: localItems } };
	}, [newTradeState.localSelection, newTradeState.otherSelection, clientStateController]);

	const handleConfirm = useCallback(
		async (_, __, c: number) => {
			if (c > 1) return;
			isLoadingAtom(true);

			const result = await requestServer(
				Functions.Trading.CreateTrade,
				"Failed to create trade",
				tonumber(newTradeState.otherPlayerInfo.userId) || 0,
				newTradeState.localSelection,
				newTradeState.otherSelection,
			);

			isLoadingAtom(false);
			if (result === -1) return;
			if (result.code === 200) {
				handleCloseButton();
			} else {
				clientStateController.NotificationEvent.Fire(
					`<font color="#${palette.lossRed.ToHex()}">${result.message}; Code ${result.code}</font>`,
					"rbxassetid://134904801170653",
				);
			}
		},
		[
			newTradeState.otherPlayerInfo.userId,
			newTradeState.localSelection,
			newTradeState.otherSelection,
			handleCloseButton,
		],
	);

	return (
		<frame
			Size={new UDim2(0, px(900), 0, px(470))}
			Position={new UDim2(0.5, 0, 0.5, 0)}
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundColor3={palette.background1}
			Visible={visible}
		>
			<Corner roundness="small" />
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: `New trade with @${newTradeState.otherPlayerInfo.username}`,
					TextSize: px(28),
					Size: new UDim2(0, px(820), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
				event={{ Activated: handleCloseButton }}
			/>
			<ItemGrid
				items={data.local.items}
				side="local"
				selection={newTradeState.localSelection}
				updateSelection={(id, qty) => updateSelection("local", id, qty)}
				setSelectingFor={setSelectingFor}
			/>
			<ItemGrid
				items={data.other.items}
				side="other"
				selection={newTradeState.otherSelection}
				updateSelection={(id, qty) => updateSelection("other", id, qty)}
				setSelectingFor={setSelectingFor}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: `Your Offer (${formatWithSuffix(data.local.value, 2)} Value)`,
					TextSize: px(20),
					Size: new UDim2(0, px(400), 0, px(20)),
					Position: new UDim2(0, px(24), 0, px(70)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: palette.darkerText,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: `Your Request (${formatWithSuffix(data.other.value, 2)})`,
					TextSize: px(20),
					AnchorPoint: new Vector2(1, 0),
					Size: new UDim2(0, px(400), 0, px(20)),
					Position: new UDim2(1, px(-24), 0, px(70)),
					TextXAlignment: Enum.TextXAlignment.Right,
					TextColor3: palette.darkerText,
				}}
			/>
			<frame
				BackgroundColor3={palette.background6}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(2), 1, px(-150))}
				BorderSizePixel={0}
			/>
			<imagelabel
				AnchorPoint={new Vector2(0, 1)}
				Position={new UDim2(0, px(25), 1, px(-25))}
				Size={new UDim2(0, px(25), 0, px(25))}
				Image={
					data.local.value > data.other.value ? "rbxassetid://88111142849537" : "rbxassetid://115564650212815"
				}
				ImageColor3={
					data.local.value === data.other.value
						? palette.equalOrange
						: data.local.value > data.other.value
							? palette.lossRed
							: palette.profitGreen
				}
				BackgroundTransparency={1}
			/>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text:
						data.local.value === data.other.value
							? "You won't gain or lose any value from this trade"
							: data.local.value > data.other.value
								? `You'll lose ${formatWithSuffix(data.local.value - data.other.value, 2)} value from this trade`
								: `You'll gain ${formatWithSuffix(data.other.value - data.local.value, 2)} value from this trade`,
					TextSize: px(20),
					AnchorPoint: new Vector2(0, 1),
					Size: new UDim2(1, 0, 0, px(25)),
					Position: new UDim2(0, px(60), 1, px(-25)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3:
						data.local.value === data.other.value
							? palette.equalOrange
							: data.local.value > data.other.value
								? palette.lossRed
								: palette.profitGreen,
				}}
			/>
			<Button
				size={new UDim2(0, px(160), 0, px(32))}
				position={new UDim2(1, px(-20), 1, px(-20))}
				anchorPoint={new Vector2(1, 1)}
				text="Confirm & Send"
				backgroundColor={palette.blue}
				textColor={palette.blueText}
				enabled={
					data.local.items.filter((item) => item !== "empty").size() > 0 &&
					data.other.items.filter((item) => item !== "empty").size() > 0
				}
				typeface="Sans"
				weight="SemiBold"
				event={{ Activated: handleConfirm }}
			/>
			{children}
		</frame>
	);
});
