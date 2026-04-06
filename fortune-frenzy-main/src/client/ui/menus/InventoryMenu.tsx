import React, { useEffect, useMemo, useReducer, useRef, useState } from "@rbxts/react";
import { GuiService, UserInputService } from "@rbxts/services";
import { Modding } from "@flamework/core";
import { usePx } from "client/hooks/use-px";
import { ClientStateController } from "client/controllers/ClientStateController";
import { palette } from "client/utils/palette";
import { MenuCore } from "../navigation/MenuCore";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { TextInputBox } from "../core/TextInputBox";
import { ItemTile } from "../inventory/ItemTile";
import {
	INVENTORY_AUTOSELECT_BUTTON,
	INVENTORY_MENU_TITLE,
	INVENTORY_SEARCH_PLACEHOLDER,
	INVENTORY_SORT_QUANTITY,
	INVENTORY_SORT_QUANTITY_LOW,
	INVENTORY_SORT_VALUE,
	INVENTORY_SORT_VALUE_LOW,
} from "shared/util/strings";
import getRarity from "shared/util/get-item-rarity";
import { ItemTooltip } from "../inventory/ItemTooltip";
import { useEventListener, useMotion } from "@rbxts/pretty-react-hooks";
import { SortButton } from "../core/SortButton";
import { useThrottle } from "client/hooks/use-throttle";
import { usePxScale } from "client/hooks/use-scale";
import { ItemSelectionTooltip } from "../inventory/ItemSelectionTooltip";
import { formatWithSuffix } from "shared/util/number-utils";
import { Button } from "../core/Button";
import { Corner } from "../tools/Corner";
import findItemsInRange from "client/utils/find-items-in-range";
import { handleCloseButton as defaultHandleCloseButton } from "client/utils/menu-utils";
import { VirtualizedScrollingFrame } from "../core/VirtualizedScrollingFrame";
import { isLoadingAtom } from "client/utils/global-state";
import { useAtom } from "@rbxts/react-charm";
import { Item } from "typings/APIResponses";

interface Props {
	visible: boolean;
	handleCloseButton?: () => void;
	scale?: boolean;
	mode?: "selection" | "default";
	inventoryOverwrite?: Map<string, string[]>;
	selectionData?: {
		currentSelection: { [itemId in string]: number };
		setCurrentSelection: (newSelection: Record<string, number>) => void;
		maximumValue: number;
		maximumPerItem: number;
		totalMaximum: number;
		minimumValue: number;
		title?: string;
		buttonText?: string;
		autoSelectButtonMode?: "random" | "max";
		autoSelectButtonText?: string;
		autoSelectButtonVisible?: boolean;
		confirmButtonEvent?: () => void;
		showMinOrMax?: "min" | "max";
	};
}

const initialState = {
	selectedTile: "",
	hoveringTile: "",
	currentSearch: "",
	hoveringTooltip: false,
	sortOrder: "value_high",
	firstVisibleRow: 0,
	lastVisibleRow: 10,
	canvasSize: new UDim2(1, 0, 0, 0),
	canvasPosition: new Vector2(0, 0),
	relativeMousePosition: new Vector2(0, 0),
};

export type InventoryMenuAction =
	| { type: "SET_SELECTED_TILE"; payload: string }
	| { type: "SET_HOVERING_TILE"; payload: string }
	| { type: "SET_CURRENT_SEARCH"; payload: string }
	| { type: "SET_HOVERING_TOOLTIP"; payload: boolean }
	| { type: "SET_SORT_ORDER"; payload: string }
	| { type: "SET_FIRST_VISIBLE_ROW"; payload: number }
	| { type: "SET_LAST_VISIBLE_ROW"; payload: number }
	| { type: "SET_CANVAS_SIZE"; payload: UDim2 }
	| { type: "SET_RELATIVE_MOUSE_POSITION"; payload: Vector2 };

function reducer(state: typeof initialState, action: InventoryMenuAction) {
	switch (action.type) {
		case "SET_SELECTED_TILE":
			return { ...state, selectedTile: action.payload };
		case "SET_HOVERING_TILE":
			return { ...state, hoveringTile: action.payload };
		case "SET_CURRENT_SEARCH":
			return { ...state, currentSearch: action.payload };
		case "SET_HOVERING_TOOLTIP":
			return { ...state, hoveringTooltip: action.payload };
		case "SET_SORT_ORDER":
			return { ...state, sortOrder: action.payload };
		case "SET_FIRST_VISIBLE_ROW":
			return { ...state, firstVisibleRow: action.payload };
		case "SET_LAST_VISIBLE_ROW":
			return { ...state, lastVisibleRow: action.payload };
		case "SET_CANVAS_SIZE":
			return { ...state, canvasSize: action.payload };
		case "SET_RELATIVE_MOUSE_POSITION":
			return { ...state, relativeMousePosition: action.payload };
		default:
			return state;
	}
}

type InventorySelectionData = NonNullable<Props["selectionData"]>;

function buildMaxSelection(
	inventory: Map<string, string[]>,
	itemInfo: Map<string, Item>,
	selectionData: InventorySelectionData,
) {
	const candidates = new Array<{ itemId: string; value: number; quantity: number }>();

	inventory.forEach((copies, itemId) => {
		const itemData = itemInfo.get(itemId);
		if (!itemData) return;
		if (itemData.value < selectionData.minimumValue || itemData.value > selectionData.maximumValue) return;

		const quantity = copies.size();
		if (quantity <= 0) return;

		candidates.push({ itemId, value: itemData.value, quantity });
	});

	candidates.sort((a, b) => {
		if (a.value !== b.value) return a.value > b.value;
		return a.itemId < b.itemId;
	});

	const nextSelection = {} as Record<string, number>;
	let selectedCount = 0;
	let selectedValue = 0;

	for (const candidate of candidates) {
		if (selectedCount >= selectionData.totalMaximum) break;

		const limit =
			selectionData.maximumPerItem === math.huge
				? candidate.quantity
				: math.min(candidate.quantity, selectionData.maximumPerItem);

		let selectedFromItem = 0;
		while (selectedFromItem < limit && selectedCount < selectionData.totalMaximum) {
			if (selectionData.maximumValue !== math.huge && selectedValue + candidate.value > selectionData.maximumValue) break;

			nextSelection[candidate.itemId] = (nextSelection[candidate.itemId] ?? 0) + 1;
			selectedFromItem += 1;
			selectedCount += 1;
			selectedValue += candidate.value;
		}
	}

	return nextSelection;
}

function InventoryMenuComponent({
	visible,
	handleCloseButton = defaultHandleCloseButton,
	scale = true,
	mode = "default",
	selectionData,
	inventoryOverwrite,
}: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [liveInventory, setLiveInventory] = useState<Map<string, string[]>>(
		inventoryOverwrite ?? clientStateController.Inventory,
	);
	const inventory = liveInventory;
	const px = usePx();
	const pxScale = usePxScale();
	const rowHeight = (px(145) + px(4)) * pxScale();
	const [state, dispatch] = useReducer(reducer, initialState);
	const frameRef = useRef<Frame>(undefined);
	const tooltipRef = useRef<Frame>(undefined);
	const debouncedSearch = useThrottle(state.currentSearch, 150);

	/*
	 * Maintain a ref to the latest state so that we can safely access it inside
	 * the scrolling callback without recreating that callback on every render.
	 */
	const stateRef = useRef(state);
	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	// track global loading state so we can disable the autoselect button while searching
	const isLoading = useAtom(isLoadingAtom);

	if (mode === "selection" && !selectionData) {
		error("InventoryMenu: selectionData is required when mode is selection");
	}

	const [selectionProgressBarSize, selectionProgressBarSizeMotion] = useMotion(new UDim2(0, 0, 1, 0));
	const [selectionProgressBarColor, selectionProgressBarColorMotion] = useMotion(palette.background4);
	const [confirmButtonEnabled, setConfirmButtonEnabled] = useState(false);

	useEffect(() => {
		if (inventoryOverwrite) {
			setLiveInventory(inventoryOverwrite);
			return;
		}

		setLiveInventory(clientStateController.Inventory);
		const connection = clientStateController.InventoryChangedEvent.Connect((nextInventory) => {
			setLiveInventory(nextInventory);
		});

		return () => connection.Disconnect();
	}, [clientStateController, inventoryOverwrite]);

	// Define stable event handlers
	const onSelect = React.useCallback(
		(id: string, inputObject: InputObject) => {
			dispatch({ type: "SET_SELECTED_TILE", payload: id });
			const inset = GuiService.GetGuiInset();
			dispatch({
				type: "SET_RELATIVE_MOUSE_POSITION",
				payload: new Vector2(inputObject.Position.X, inputObject.Position.Y + inset[0].Y),
			});
		},
		[dispatch],
	);

	const onHover = React.useCallback(
		(id: string) => {
			dispatch({ type: "SET_HOVERING_TILE", payload: id });
		},
		[dispatch],
	);

	const onLeave = React.useCallback(() => {
		dispatch({ type: "SET_HOVERING_TILE", payload: "" });
	}, [dispatch]);

	const memoizedData = useMemo(() => {
		interface RawTile {
			id: string;
			name: string;
			copies: number;
			value: number;
			assetId: string;
			color: string;
			exclusive: boolean;
		}

		const sortItems = (a: RawTile, b: RawTile): boolean => {
			switch (state.sortOrder) {
				case "value_high":
					return a.value > b.value;
				case "value_low":
					return a.value < b.value;
				case "quantity_high":
					return a.copies > b.copies;
				case "quantity_low":
					return a.copies < b.copies;
				default:
					return false;
			}
		};

		const filteredTiles: RawTile[] = [];
		let totalSelectedValue = 0;
		let totalSelectedItems = 0;
		if (selectionData) {
			for (const [itemId, quantity] of pairs(selectionData.currentSelection)) {
				const itemData = clientStateController.ItemInfo.get(itemId);
				if (itemData) {
					totalSelectedValue += itemData.value * quantity;
					totalSelectedItems += quantity;
				}
			}
		}

		inventory.forEach((copies, id) => {
			const itemData = clientStateController.ItemInfo.get(id);
			const value = itemData?.value ?? 0;

			if (
				selectionData &&
				(selectionData.currentSelection[id] === undefined || selectionData.currentSelection[id] === 0)
			) {
				const exceedsMaxValue = selectionData.maximumValue !== math.huge && value > selectionData.maximumValue;
				const exceedsTotalValue = totalSelectedValue + value > selectionData.maximumValue;
				const exceedsTotalItems =
					selectionData.totalMaximum !== math.huge && totalSelectedItems >= selectionData.totalMaximum;

				if (exceedsMaxValue || exceedsTotalValue || exceedsTotalItems) {
					return;
				}
			}

			if (itemData) {
				const meetsSearchQuery =
					debouncedSearch.size() === 0 ||
					itemData.name.lower().find(debouncedSearch.lower())[0] !== undefined;

				if (meetsSearchQuery) {
					filteredTiles.push({
						id,
						name: itemData.name,
						copies: copies.size(),
						value,
						assetId: itemData.asset_id,
						color: itemData.color,
						exclusive: itemData.category === "exclusive",
					});
				}
			}
		});

		filteredTiles.sort(sortItems);

		const components = filteredTiles.map((tile: RawTile, index: number) => (
			<ItemTile
				key={tile.id}
				id={tile.id}
				name={tile.name}
				subtitle={`x${tile.copies}`}
				exclusive={tile.exclusive}
				assetId={tile.assetId}
				visible={true}
				LayoutOrder={index}
				onSelect={onSelect}
				onHover={onHover}
				onLeave={onLeave}
				color={tile.color}
				value={tile.value}
			/>
		));

		return components;
	}, [inventory, debouncedSearch, state.sortOrder, selectionData, onSelect, onHover, onLeave]);

	const itemTiles = memoizedData;

	useEventListener(UserInputService.InputBegan, (input) => {
		if (!tooltipRef.current) return;
		if (state.hoveringTooltip) return;
		if (state.hoveringTile !== "") return;

		if (input.UserInputType === Enum.UserInputType.MouseButton1) {
			dispatch({ type: "SET_SELECTED_TILE", payload: "" });
		}

		if (input.UserInputType === Enum.UserInputType.Touch) {
			const tapPosition = input.Position;
			const tooltipPosition = tooltipRef.current.AbsolutePosition;
			const tooltipEnd = tooltipPosition.add(tooltipRef.current.AbsoluteSize);
			if (
				tapPosition.X < tooltipPosition.X ||
				tapPosition.Y < tooltipPosition.Y ||
				tapPosition.X > tooltipEnd.X ||
				tapPosition.Y > tooltipEnd.Y
			) {
				dispatch({ type: "SET_SELECTED_TILE", payload: "" });
			}
		}
	});

	const [totalValueSelected, totalItemsSelected] = useMemo(() => {
		if (mode !== "selection" || !selectionData) return $tuple(0, 0);
		let totalValueSelected = 0;
		let totalItemsSelected = 0;

		for (const [itemId, quantity] of pairs(selectionData.currentSelection)) {
			const itemData = clientStateController.ItemInfo.get(itemId);
			if (itemData) {
				totalValueSelected += itemData.value * quantity;
				totalItemsSelected += quantity;
			}
		}

		const progressBarTarget = new UDim2(math.min(1, totalValueSelected / selectionData.minimumValue), 0, 1, 0);
		selectionProgressBarSizeMotion.tween(progressBarTarget, {
			time: 0.5,
			style: Enum.EasingStyle.Quint,
			direction: Enum.EasingDirection.Out,
		});

		let buttonEnabled = false;
		let progressBarColor = palette.background4;
		if (selectionData.maximumValue === math.huge) {
			progressBarColor = palette.background3;
			buttonEnabled = totalItemsSelected > 0;
		} else if (totalValueSelected >= selectionData.minimumValue) {
			buttonEnabled = totalValueSelected <= selectionData.maximumValue;
			progressBarColor = totalValueSelected > selectionData.maximumValue ? palette.deepMaroon : palette.deepGreen;
		} else if (totalItemsSelected >= selectionData.totalMaximum) {
			progressBarColor = palette.deepMaroon;
		}

		setConfirmButtonEnabled(buttonEnabled);
		selectionProgressBarColorMotion.tween(progressBarColor, {
			time: 0.5,
			style: Enum.EasingStyle.Quint,
			direction: Enum.EasingDirection.Out,
		});

		return $tuple(totalValueSelected, totalItemsSelected);
	}, [mode, selectionData, selectionData?.currentSelection]);

	useEffect(() => {
		if (mode !== "selection" || !selectionData) return;

		let changed = false;
		const nextSelection = {} as Record<string, number>;

		for (const [itemIdRaw, quantityRaw] of pairs(selectionData.currentSelection)) {
			const itemId = tostring(itemIdRaw);
			const quantity = tonumber(quantityRaw) ?? 0;
			const ownedQuantity = inventory.get(itemId)?.size() ?? 0;
			const clampedQuantity = math.min(quantity, ownedQuantity);

			if (clampedQuantity > 0) {
				nextSelection[itemId] = clampedQuantity;
			}

			if (clampedQuantity !== quantity) {
				changed = true;
			}
		}

		if (changed) {
			selectionData.setCurrentSelection(nextSelection);
		}
	}, [mode, selectionData, inventory]);

	useEffect(() => {
		if (!visible) {
			dispatch({ type: "SET_SELECTED_TILE", payload: "" });
		}
	}, [visible]);

	return (
		<MenuCore scale={false}>
			<frame
				ref={frameRef}
				Size={new UDim2(0, px(900), 0, px(470))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundColor3={palette.background1}
				Visible={visible}
			>
				{scale ? <uiscale Scale={pxScale()} /> : undefined}
				<Corner roundness="small" />
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: selectionData?.title ?? INVENTORY_MENU_TITLE,
						TextSize: px(28),
						Size: new UDim2(0, px(320), 0, px(28)),
						Position: new UDim2(0, px(24), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<CloseButton
					native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
					event={{
						Activated: () => {
							handleCloseButton();
							dispatch({ type: "SET_SELECTED_TILE", payload: "" });
						},
					}}
				/>
				<TextInputBox
					size={new UDim2(0, px(636), 0, px(32))}
					position={new UDim2(0, px(25), 0, px(63))}
					typeface="Sans"
					weight="Medium"
					placeholder={INVENTORY_SEARCH_PLACEHOLDER.gsub("{{count}}", tostring(inventory.size()))[0]}
					image="rbxassetid://104380087729663"
					change={{
						Text: (text: TextBox) => {
							dispatch({ type: "SET_CURRENT_SEARCH", payload: text.Text });
						},
					}}
				/>
				<SortButton
					size={new UDim2(0, px(205), 0, px(32))}
					position={new UDim2(0, px(671), 0, px(63))}
					typeface="Sans"
					weight="Medium"
					setSortOrder={(order: string) => dispatch({ type: "SET_SORT_ORDER", payload: order })}
					options={[
						["value_high", INVENTORY_SORT_VALUE, 0, ""],
						["value_low", INVENTORY_SORT_VALUE_LOW, 0, ""],
						["quantity_high", INVENTORY_SORT_QUANTITY, 0, ""],
						["quantity_low", INVENTORY_SORT_QUANTITY_LOW, 0, ""],
					]}
				/>
				{itemTiles.size() !== 0 ? (
					<VirtualizedScrollingFrame
						size={new UDim2(0, px(850), 0, mode === "default" ? px(340) : px(300))}
						position={new UDim2(0.5, 0, 0, px(108))}
						anchorPoint={new Vector2(0.5, 0)}
						backgroundTransparency={1}
						scrollBarThickness={0}
						items={itemTiles}
						rowHeight={rowHeight}
						itemsPerRow={8}
						cellSize={UDim2.fromOffset(px(95), px(145))}
						cellPadding={UDim2.fromOffset(px(12), px(4))}
						padding={{ left: px(2), right: px(2) }}
					/>
				) : debouncedSearch.size() === 0 ? (
					<>
						<imagelabel
							Image={"rbxassetid://123361866154149"}
							AnchorPoint={new Vector2(0, 0.5)}
							BackgroundTransparency={1}
							Position={UDim2.fromOffset(px(215), px(255))}
							Size={UDim2.fromOffset(px(128), px(128))}
						/>
						<TextLabel
							weight="Bold"
							typeface="Sans"
							native={{
								Position: new UDim2(0, px(348), 0, px(211)),
								Size: new UDim2(0, px(329), 0, px(23)),
								TextSize: px(25),
								Text: "You've been clownfished!",
								TextColor3: palette.primaryText,
								TextXAlignment: Enum.TextXAlignment.Left,
							}}
						/>
						<TextLabel
							weight="SemiBold"
							typeface="Sans"
							native={{
								Position: new UDim2(0, px(348), 0, px(241)),
								Size: new UDim2(0, px(337), 0, px(60)),
								TextSize: px(20),
								Text: "You've got no items yet! Try unboxing a few in Item Cases or check out the Marketplace to grab some.",
								TextColor3: palette.midText,
								TextXAlignment: Enum.TextXAlignment.Left,
								TextYAlignment: Enum.TextYAlignment.Top,
							}}
						/>
					</>
				) : undefined}
				{mode === "selection" ? (
					<React.Fragment>
						<frame
							BackgroundColor3={palette.background3}
							Position={new UDim2(0, px(25), 0, px(420))}
							Size={
								new UDim2(0, px(selectionData?.autoSelectButtonVisible === true ? 499 : 675), 0, px(32))
							}
						>
							<Corner roundness="small" />
							<frame
								BackgroundColor3={selectionProgressBarColor}
								Size={selectionProgressBarSize}
								Position={new UDim2(0, 0, 0, 0)}
							>
								<Corner roundness="small" />
							</frame>
							<TextLabel
								weight="SemiBold"
								typeface="Sans"
								native={{
									Text:
										(selectionData?.maximumValue ?? 0) >= 1000000000000
											? `${formatWithSuffix(totalValueSelected ?? 0, 1)} Value (${totalItemsSelected ?? 0}/${selectionData?.totalMaximum ?? 0} Items)`
											: `${formatWithSuffix(totalValueSelected ?? 0, 1)} / ${formatWithSuffix((selectionData?.showMinOrMax === "min" ? selectionData?.minimumValue : selectionData?.maximumValue) ?? 0, 1)} Value (${totalItemsSelected ?? 0}/${selectionData?.totalMaximum ?? 0} Items)`,
									TextSize: px(18),
									Size: new UDim2(1, 0, 1, 0),
									Position: new UDim2(0, 0, 0, 0),
									TextXAlignment: Enum.TextXAlignment.Center,
								}}
							/>
						</frame>
						<Button
							size={new UDim2(0, px(166), 0, px(32))}
							position={new UDim2(0, px(710), 0, px(420))}
							text={selectionData?.buttonText ?? "Confirm"}
							backgroundColor={palette.blue}
							textColor={palette.blueText}
							typeface="Sans"
							weight="Bold"
							enabled={confirmButtonEnabled}
							event={{
								Activated: () => {
									if (selectionData?.confirmButtonEvent) {
										selectionData.confirmButtonEvent();
									}
								},
							}}
						/>
						<Button
							size={new UDim2(0, px(166), 0, px(32))}
							position={new UDim2(0, px(534), 0, px(420))}
							text={selectionData?.autoSelectButtonText ?? INVENTORY_AUTOSELECT_BUTTON}
							backgroundColor={palette.background1}
							textColor={palette.blue}
							visible={selectionData?.autoSelectButtonVisible === true}
							enabled={!isLoading}
							typeface="Sans"
							weight="Bold"
							event={{
								Activated: async () => {
									if (selectionData?.autoSelectButtonMode === "max") {
										selectionData?.setCurrentSelection(
											buildMaxSelection(inventory, clientStateController.ItemInfo, selectionData),
										);
										return;
									}

									isLoadingAtom(true);
									const itemIds = await findItemsInRange(
										selectionData?.minimumValue ?? 0,
										selectionData?.maximumValue ?? math.huge,
										1,
										selectionData?.totalMaximum ?? 10,
									);
									isLoadingAtom(false);

									const itemIdCounts: { [itemId: string]: number } = {};
									itemIds.forEach((id) => {
										itemIdCounts[id] = (itemIdCounts[id] || 0) + 1;
									});

									selectionData?.setCurrentSelection(itemIdCounts);
								},
							}}
						>
							<uistroke Color={palette.blue} Thickness={1} />
						</Button>
					</React.Fragment>
				) : undefined}
			</frame>
			{mode === "default" ? (
				<ItemTooltip
					position={new UDim2(0, state.relativeMousePosition.X, 0, state.relativeMousePosition.Y)}
					selectedItem={state.selectedTile}
					tooltipRef={tooltipRef}
					setHoveringTooltip={(hovering: boolean) =>
						dispatch({ type: "SET_HOVERING_TOOLTIP", payload: hovering })
					}
					dispatch={dispatch}
					scale={scale}
				/>
			) : (
				<ItemSelectionTooltip
					position={new UDim2(0, state.relativeMousePosition.X, 0, state.relativeMousePosition.Y)}
					selectedItem={state.selectedTile}
					tooltipRef={tooltipRef}
					setHoveringTooltip={(hovering: boolean) =>
						dispatch({ type: "SET_HOVERING_TOOLTIP", payload: hovering })
					}
					dispatch={dispatch}
					scale={scale}
					currentSelection={selectionData?.currentSelection}
					addEvent={() => {
						if (!selectionData) return;
						const total_owned = inventory.get(state.selectedTile)?.size() ?? 0;
						let total_selected = 0;

						for (const [_, value] of pairs(selectionData.currentSelection)) {
							total_selected += value;
						}

						if (
							selectionData.totalMaximum !== 0 &&
							selectionData.totalMaximum !== math.huge &&
							total_selected >= selectionData.totalMaximum
						) {
							return;
						}

						selectionData.setCurrentSelection({
							...selectionData.currentSelection,
							[state.selectedTile]: math.min(
								selectionData.maximumPerItem,
								total_owned,
								(selectionData.currentSelection[state.selectedTile] || 0) + 1,
							),
						});
					}}
					subEvent={() => {
						if (!selectionData) return;
						selectionData.setCurrentSelection({
							...selectionData.currentSelection,
							[state.selectedTile]: math.max(
								0,
								(selectionData.currentSelection[state.selectedTile] || 0) - 1,
							),
						});
					}}
					addButtonEnabled={
						totalItemsSelected < (selectionData?.totalMaximum ?? 0) &&
						(inventory.get(state.selectedTile)?.size() ?? 0) -
							(selectionData?.currentSelection[state.selectedTile] ?? 0) >
							0
					}
					subButtonEnabled={(selectionData?.currentSelection[state.selectedTile] ?? 0) > 0}
				/>
			)}
		</MenuCore>
	);
}

export const InventoryMenu = React.memo(InventoryMenuComponent);
