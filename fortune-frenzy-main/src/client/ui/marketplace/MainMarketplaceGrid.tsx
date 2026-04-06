import React, { useMemo, useReducer, useRef, useCallback, useState, useEffect } from "@rbxts/react";
import { UserInputService } from "@rbxts/services";
import { Modding } from "@flamework/core";
import { usePx } from "client/hooks/use-px";
import { ClientStateController } from "client/controllers/ClientStateController";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { TextInputBox } from "../core/TextInputBox";
import { ItemTile } from "../inventory/ItemTile";
import {
	INVENTORY_SEARCH_PLACEHOLDER,
	MARKETPLACE_MENU_TITLE,
	MARKETPLACE_SORT_RARITY,
	MARKETPLACE_SORT_HIGHEST_VALUE,
	MARKETPLACE_SORT_LOWEST_VALUE,
	MARKETPLACE_SORT_HIGHEST_PRICE,
	MARKETPLACE_SORT_LOWEST_PRICE,
} from "shared/util/strings";
import getRarity from "shared/util/get-item-rarity";
import { SortButton } from "../core/SortButton";
import { useThrottle } from "client/hooks/use-throttle";
import { escapeSpecialChars } from "shared/util/string-utils";
import { usePxScale } from "client/hooks/use-scale";
import { activeMarketplacePageAtom, marketplaceStatusAtom } from "client/utils/global-state";
import { handleCloseButton } from "client/utils/menu-utils";
import { getBestPrice } from "shared/util/get-best-price";
import { addCommasToNumber } from "shared/util/number-utils";
import { VirtualizedScrollingFrame } from "../core/VirtualizedScrollingFrame";

interface Props {
	parentFrameRef: React.RefObject<Frame>;
	visible: boolean;
}

// State and reducer setup remains the same as in the thinking trace
const initialState = {
	selectedTile: "",
	hoveringTile: "",
	currentSearch: "",
	sortOrder: "price_low",
	firstVisibleRow: 0,
	lastVisibleRow: 10,
	canvasSize: new UDim2(1, 0, 0, 0),
	canvasPosition: new Vector2(0, 0),
	relativeMousePosition: new Vector2(0, 0),
};

const ActionTypes = {
	SET_SELECTED_TILE: "SET_SELECTED_TILE",
	SET_HOVERING_TILE: "SET_HOVERING_TILE",
	SET_CURRENT_SEARCH: "SET_CURRENT_SEARCH",
	SET_SORT_ORDER: "SET_SORT_ORDER",
	SET_FIRST_VISIBLE_ROW: "SET_FIRST_VISIBLE_ROW",
	SET_LAST_VISIBLE_ROW: "SET_LAST_VISIBLE_ROW",
	SET_CANVAS_SIZE: "SET_CANVAS_SIZE",
	SET_CANVAS_POSITION: "SET_CANVAS_POSITION",
	SET_RELATIVE_MOUSE_POSITION: "SET_RELATIVE_MOUSE_POSITION",
} as const;

type Action =
	| { type: typeof ActionTypes.SET_SELECTED_TILE; payload: string }
	| { type: typeof ActionTypes.SET_HOVERING_TILE; payload: string }
	| { type: typeof ActionTypes.SET_CURRENT_SEARCH; payload: string }
	| { type: typeof ActionTypes.SET_SORT_ORDER; payload: string }
	| { type: typeof ActionTypes.SET_FIRST_VISIBLE_ROW; payload: number }
	| { type: typeof ActionTypes.SET_LAST_VISIBLE_ROW; payload: number }
	| { type: typeof ActionTypes.SET_CANVAS_SIZE; payload: UDim2 }
	| { type: typeof ActionTypes.SET_CANVAS_POSITION; payload: Vector2 }
	| { type: typeof ActionTypes.SET_RELATIVE_MOUSE_POSITION; payload: Vector2 };

function reducer(state: typeof initialState, action: Action) {
	switch (action.type) {
		case ActionTypes.SET_SELECTED_TILE:
			return { ...state, selectedTile: action.payload };
		case ActionTypes.SET_HOVERING_TILE:
			return { ...state, hoveringTile: action.payload };
		case ActionTypes.SET_CURRENT_SEARCH:
			return { ...state, currentSearch: action.payload };
		case ActionTypes.SET_SORT_ORDER:
			return { ...state, sortOrder: action.payload };
		case ActionTypes.SET_FIRST_VISIBLE_ROW:
			return { ...state, firstVisibleRow: action.payload };
		case ActionTypes.SET_LAST_VISIBLE_ROW:
			return { ...state, lastVisibleRow: action.payload };
		case ActionTypes.SET_CANVAS_SIZE:
			return { ...state, canvasSize: action.payload };
		case ActionTypes.SET_CANVAS_POSITION:
			return { ...state, canvasPosition: action.payload };
		case ActionTypes.SET_RELATIVE_MOUSE_POSITION:
			return { ...state, relativeMousePosition: action.payload };
		default:
			return state;
	}
}

export function MainMarketplaceGrid({ parentFrameRef, visible }: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const marketplace = clientStateController.ItemInfo;
	const px = usePx();
	const rowHeight = px(145) + px(4);
	const [state, dispatch] = useReducer(reducer, initialState);
	const debouncedSearch = useThrottle(state.currentSearch, 150);
	const [totalValidItems, setTotalValidItems] = useState(0);
	const [listingsVersion, setListingsVersion] = useState(0);
	const stateRef = useRef(state);

	useEffect(() => {
		const connection = clientStateController.ListingsEvent.Connect(() => {
			setListingsVersion((value) => value + 1);
		});
		return () => connection.Disconnect();
	}, [clientStateController]);

	useEffect(() => {
		stateRef.current = state;
	}, [state]);

	const handleTileActivation = useCallback(
		(id: string) => {
			warn("handleTileActivation", id);

			dispatch({ type: ActionTypes.SET_SELECTED_TILE, payload: id });
			const mousePosition = UserInputService.GetMouseLocation();
			const framePosition = parentFrameRef.current?.AbsolutePosition ?? new Vector2(0, 0);
			let relativePosition = mousePosition.sub(framePosition);
			relativePosition = new Vector2(relativePosition.X, relativePosition.Y - 55);
			dispatch({ type: ActionTypes.SET_RELATIVE_MOUSE_POSITION, payload: relativePosition });
			marketplaceStatusAtom(`item_info_${id}`);
		},
		[parentFrameRef, dispatch],
	);

	const itemTiles = useMemo(() => {
		interface TileData {
			component: JSX.Element;
			exclusive: boolean;
			value: number;
			id: string;
		}

		warn("Sorting by", state.sortOrder);

		const sortItems = (a: TileData, b: TileData): boolean => {
			switch (state.sortOrder) {
				case "value_high":
					return a.value > b.value;
				case "value_low":
					return a.value < b.value;
				case "price_high": {
					const priceA = getBestPrice(clientStateController.ItemListings.get(a.id) ?? []);
					const priceB = getBestPrice(clientStateController.ItemListings.get(b.id) ?? []);
					const adjustedA = priceA === -1 ? -math.huge : priceA;
					const adjustedB = priceB === -1 ? -math.huge : priceB;
					return adjustedA > adjustedB;
				}
				case "price_low": {
					const priceA = getBestPrice(clientStateController.ItemListings.get(a.id) ?? []);
					const priceB = getBestPrice(clientStateController.ItemListings.get(b.id) ?? []);
					const adjustedA = priceA === -1 ? math.huge : priceA;
					const adjustedB = priceB === -1 ? math.huge : priceB;
					return adjustedA < adjustedB;
				}
				default:
					return false;
			}
		};

		const filteredTiles: TileData[] = [];
		let i = 0;
		marketplace.forEach((item, id) => {
			const rarity = getRarity(item.value ?? 0, true);
			const value = item.value ?? 0;

			if (item.total_unboxed === 0 && item.category === "classic") return;
			const meetsSearchQuery =
				debouncedSearch.size() === 0 ||
				item.name.lower().find(escapeSpecialChars(debouncedSearch.lower()))[0] !== undefined;

			if (meetsSearchQuery) {
				i++;
				filteredTiles.push({
					component: (
						<ItemTile
							key={id}
							id={id}
							name={item.name}
							subtitle={
								getBestPrice(clientStateController.ItemListings.get(id) ?? []) === -1
									? "No resellers"
									: `$${addCommasToNumber(getBestPrice(clientStateController.ItemListings.get(id) ?? []))}`
							}
							exclusive={item.category === "exclusive"}
							assetId={item.asset_id}
							visible={true}
							LayoutOrder={0}
							onSelect={handleTileActivation}
							onHover={() => dispatch({ type: ActionTypes.SET_HOVERING_TILE, payload: id })}
							onLeave={() => dispatch({ type: ActionTypes.SET_HOVERING_TILE, payload: "" })}
							color={item.color}
							value={value}
							faded={
								debouncedSearch.size() === 0 &&
								(state.sortOrder === "price_high" || state.sortOrder === "price_low") &&
								getBestPrice(clientStateController.ItemListings.get(id) ?? []) === -1
							}
						/>
					),
					exclusive: item.category === "exclusive",
					value,
					id,
				});
			}
		});

		setTotalValidItems(i);
		filteredTiles.sort(sortItems);
		filteredTiles.forEach((tile, index) => {
			tile.component = React.cloneElement(tile.component, { LayoutOrder: index });
		});

		return filteredTiles.map((tile) => tile.component);
	}, [marketplace, debouncedSearch, state.sortOrder, handleTileActivation, dispatch, px, listingsVersion]);

	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} Visible={visible}>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: MARKETPLACE_MENU_TITLE,
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
				event={{ Activated: handleCloseButton }}
			/>
			<TextInputBox
				size={new UDim2(0, px(636), 0, px(32))}
				position={new UDim2(0, px(25), 0, px(63))}
				typeface="Sans"
				weight="Medium"
				placeholder={INVENTORY_SEARCH_PLACEHOLDER.gsub("{{count}}", tostring(totalValidItems))[0]}
				image="rbxassetid://104380087729663"
				change={{
					Text: (text: TextBox) => {
						dispatch({ type: ActionTypes.SET_CURRENT_SEARCH, payload: text.Text });
					},
				}}
			/>
			<SortButton
				size={new UDim2(0, px(205), 0, px(32))}
				position={new UDim2(0, px(671), 0, px(63))}
				typeface="Sans"
				weight="Medium"
				current={state.sortOrder}
				setSortOrder={(order: string) => dispatch({ type: ActionTypes.SET_SORT_ORDER, payload: order })}
				options={[
					["value_high", MARKETPLACE_SORT_HIGHEST_VALUE, 0, "rbxassetid://89977107525633"],
					["value_low", MARKETPLACE_SORT_LOWEST_VALUE, 180, "rbxassetid://89977107525633"],
					["price_high", MARKETPLACE_SORT_HIGHEST_PRICE, 0, "rbxassetid://89977107525633"],
					["price_low", MARKETPLACE_SORT_LOWEST_PRICE, 180, "rbxassetid://89977107525633"],
				]}
			/>
			<VirtualizedScrollingFrame
				size={new UDim2(0, px(850), 0, px(340))}
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
		</frame>
	);
}
