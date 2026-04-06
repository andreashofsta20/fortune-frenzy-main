import React, { memo, useMemo, useState, useReducer, useRef, useEffect, useCallback } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import {
	CASE_BATTLES_CASE_SELECTOR_SEARCH_PLACEHOLDER,
	CASE_BATTLES_CASE_SELECTOR_SORT_VALUE,
	CASE_BATTLES_CASE_SELECTOR_SORT_VALUE_LOW,
	CASE_BATTLES_CASE_SELECTOR_TITLE,
} from "shared/util/strings";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { SortButton } from "../core/SortButton";
import { Corner } from "../tools/Corner";
import { TextInputBox } from "../core/TextInputBox";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { CaseSelectorTile } from "./CaseSelectorTile";
import { useThrottle } from "client/hooks/use-throttle";
import { usePxScale } from "client/hooks/use-scale";
import { CaseBattleCase } from "typings/APIResponses";
import { brighten } from "client/utils/color-utils";
import { Button } from "../core/Button";
import { StackedItemCard } from "./StackedItemCard";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { VirtualizedScrollingFrame } from "../core/VirtualizedScrollingFrame";

interface Props extends React.PropsWithChildren {
	visible: boolean;
	flashMenu: () => void;
	setCurrentPage: (page: "grid" | "builder" | "case-selector" | "viewing") => void;
}

interface CaseSelectorState {
	currentSearch: string;
	// "value_high" = highest price first, "value_low" = lowest price first
	sortOrder: "value_high" | "value_low";
	firstVisibleRow: number;
	lastVisibleRow: number;
	canvasSize: UDim2;
	canvasPosition: Vector2;
	currentSelectedCase?: CaseBattleCase;
}

const initialState: CaseSelectorState = {
	currentSearch: "",
	sortOrder: "value_high",
	firstVisibleRow: 0,
	lastVisibleRow: 10,
	canvasSize: new UDim2(1, 0, 0, 0),
	canvasPosition: new Vector2(0, 0),
	currentSelectedCase: undefined,
};

export type CaseSelectorAction =
	| { type: "SET_CURRENT_SEARCH"; payload: string }
	| { type: "SET_SORT_ORDER"; payload: "value_high" | "value_low" }
	| { type: "SET_FIRST_VISIBLE_ROW"; payload: number }
	| { type: "SET_LAST_VISIBLE_ROW"; payload: number }
	| { type: "SET_CANVAS_SIZE"; payload: UDim2 }
	| { type: "SET_CANVAS_POSITION"; payload: Vector2 }
	| { type: "SET_CURRENT_SELECTED_CASE"; payload: CaseBattleCase | undefined };

function reducer(state: CaseSelectorState, action: CaseSelectorAction): CaseSelectorState {
	switch (action.type) {
		case "SET_CURRENT_SEARCH":
			return { ...state, currentSearch: action.payload };
		case "SET_SORT_ORDER":
			return { ...state, sortOrder: action.payload };
		case "SET_FIRST_VISIBLE_ROW":
			return { ...state, firstVisibleRow: action.payload };
		case "SET_LAST_VISIBLE_ROW":
			return { ...state, lastVisibleRow: action.payload };
		case "SET_CANVAS_SIZE":
			return { ...state, canvasSize: action.payload };
		case "SET_CANVAS_POSITION":
			return { ...state, canvasPosition: action.payload };
		case "SET_CURRENT_SELECTED_CASE":
			return { ...state, currentSelectedCase: action.payload };
		default:
			return state;
	}
}

export const CaseSelector = memo(({ visible, flashMenu, setCurrentPage }: Props) => {
	const px = usePx();
	const pxScale = usePxScale();
	const [state, dispatch] = useReducer(reducer, initialState);
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const debouncedSearch = useThrottle(state.currentSearch, 150);
	const [overlayTransparency, overlayTransparencyMotion] = useMotion(1);
	const [promptScale, promptScaleMotion] = useMotion(0.95);

	const ITEMS_PER_ROW = 5;
	const RAW_ROW_HEIGHT = useMemo(() => px(178) + px(13), [px]);
	const rowHeight = useMemo(() => RAW_ROW_HEIGHT * pxScale(), [RAW_ROW_HEIGHT, pxScale]);

	const handleSearchChange = useCallback((text: TextBox) => {
		dispatch({ type: "SET_CURRENT_SEARCH", payload: text.Text });
	}, []);

	const handleSortOrderChange = useCallback((order: string) => {
		dispatch({ type: "SET_SORT_ORDER", payload: order as "value_high" | "value_low" });
	}, []);

	useEffect(() => {
		const tweenParams = {
			time: 0.25,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.InOut,
		};

		if (state.currentSelectedCase) {
			overlayTransparencyMotion.immediate(1);
			overlayTransparencyMotion.tween(0.5, tweenParams);
			promptScaleMotion.immediate(0.95);
			promptScaleMotion.tween(1, { ...tweenParams, style: Enum.EasingStyle.Back });
		} else {
			overlayTransparencyMotion.tween(1, tweenParams);
			promptScaleMotion.tween(0.95, tweenParams);
		}
	}, [state.currentSelectedCase]);

	const filteredSortedCases = useMemo(() => {
		const meetsSearch = (caseData: CaseBattleCase) =>
			debouncedSearch.size() === 0 || caseData.name.lower().find(debouncedSearch.lower())[0] !== undefined;

		const filtered = clientStateController.CaseBattleCases.filter(meetsSearch);
		const sorted = [...filtered];
		sorted.sort((a, b) => (state.sortOrder === "value_high" ? a.price < b.price : a.price > b.price));
		return sorted;
	}, [debouncedSearch, state.sortOrder]);

	const caseTiles = useMemo(() => {
		return filteredSortedCases.map((caseData, index) => (
			<CaseSelectorTile
				caseData={caseData}
				layoutOrder={index}
				key={`case-${caseData.id}`}
				activated={() => {
					if (state.currentSelectedCase === undefined) {
						dispatch({ type: "SET_CURRENT_SELECTED_CASE", payload: caseData });
					}
				}}
			/>
		));
	}, [filteredSortedCases, state.currentSelectedCase]);

	type CaseItem = CaseBattleCase["items"][number];
	const sortedCaseItems: CaseItem[] = useMemo(() => {
		if (!state.currentSelectedCase) return [];
		const itemsCopy = [...state.currentSelectedCase.items];
		itemsCopy.sort((a, b) => {
			const spanA = a.max_ticket - a.min_ticket;
			const spanB = b.max_ticket - b.min_ticket;
			return spanA < spanB;
		});
		return itemsCopy;
	}, [state.currentSelectedCase]);

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
					Text: CASE_BATTLES_CASE_SELECTOR_TITLE,
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
				event={{ Activated: () => setCurrentPage("builder") }}
			/>
			<TextInputBox
				size={new UDim2(0, px(675), 0, px(32))}
				position={new UDim2(0, px(25), 0, px(63))}
				typeface="Sans"
				weight="Medium"
				placeholder={
					CASE_BATTLES_CASE_SELECTOR_SEARCH_PLACEHOLDER.gsub(
						"{{count}}",
						tostring(clientStateController.CaseBattleCases.size()),
					)[0]
				}
				image="rbxassetid://104380087729663"
				change={{ Text: handleSearchChange }}
			/>
			<SortButton
				size={new UDim2(0, px(166), 0, px(32))}
				position={new UDim2(0, px(710), 0, px(63))}
				typeface="Sans"
				weight="Medium"
				setSortOrder={handleSortOrderChange}
				options={[
					["value_high", CASE_BATTLES_CASE_SELECTOR_SORT_VALUE, 0, "rbxassetid://89977107525633"],
					["value_low", CASE_BATTLES_CASE_SELECTOR_SORT_VALUE_LOW, 180, "rbxassetid://89977107525633"],
				]}
			/>
			<VirtualizedScrollingFrame
				size={new UDim2(0, px(852), 0, px(334))}
				position={new UDim2(0.5, 0, 0.5, 44)}
				anchorPoint={new Vector2(0.5, 0.5)}
				backgroundTransparency={1}
				scrollBarThickness={0}
				items={caseTiles}
				rowHeight={rowHeight}
				itemsPerRow={ITEMS_PER_ROW}
				cellSize={new UDim2(0, px(160), 0, px(178))}
				cellPadding={new UDim2(0, px(13), 0, px(13))}
			/>
			{state.currentSelectedCase && (
				<frame
					BackgroundColor3={brighten(palette.background1, 0.05)}
					Size={new UDim2(1, 0, 1, 0)}
					Position={new UDim2(0, 0, 0, 0)}
					BackgroundTransparency={overlayTransparency}
				>
					<Corner roundness="small" />
					<frame
						BackgroundColor3={palette.background1}
						Size={new UDim2(1, -px(80), 1, -px(80))}
						Position={new UDim2(0.5, 0, 0.5, 0)}
						AnchorPoint={new Vector2(0.5, 0.5)}
					>
						<uiscale Scale={promptScale} />
						<Corner roundness="small" />
						<imagelabel
							Image={state.currentSelectedCase.image}
							BackgroundTransparency={1}
							Size={new UDim2(0, px(70), 0, px(70))}
							Position={new UDim2(0, px(12), 0, px(12))}
						/>
						<TextLabel
							typeface="Sans"
							weight="Bold"
							native={{
								Text: state.currentSelectedCase.name,
								TextSize: px(28),
								Size: new UDim2(0, px(630), 0, px(28)),
								Position: new UDim2(0, px(90), 0, px(21)),
								TextXAlignment: Enum.TextXAlignment.Left,
							}}
						/>
						<TextLabel
							typeface="Sans"
							weight="SemiBold"
							native={{
								Text: "This case contains the following items:",
								TextSize: px(20),
								Size: new UDim2(0, px(630), 0, px(20)),
								Position: new UDim2(0, px(90), 0, px(55)),
								TextXAlignment: Enum.TextXAlignment.Left,
								TextColor3: palette.midText,
							}}
						/>
						<CloseButton
							native={{
								Size: new UDim2(0, px(21), 0, px(21)),
								Position: new UDim2(1, -px(24), 0, px(21)),
								AnchorPoint: new Vector2(1, 0),
							}}
							event={{
								Activated: () => {
									dispatch({ type: "SET_CURRENT_SELECTED_CASE", payload: undefined });
								},
							}}
						/>
						<Button
							size={new UDim2(0, px(145), 0, px(32))}
							position={new UDim2(1, -px(24), 1, -px(24))}
							anchorPoint={new Vector2(1, 1)}
							backgroundColor={palette.blue}
							textColor={palette.blueText}
							text="Confirm & Add"
							typeface="Sans"
							weight="SemiBold"
							event={{
								Activated: () => {
									clientStateController.CaseBattleCaseChangedEvent.Fire(
										"add",
										state.currentSelectedCase!.id,
										1,
									);
									dispatch({ type: "SET_CURRENT_SELECTED_CASE", payload: undefined });
									setCurrentPage("builder");
								},
							}}
						/>
						<frame
							AnchorPoint={new Vector2(0.5, 0.5)}
							BackgroundTransparency={1}
							Position={new UDim2(0.5, 0, 0.5, px(15))}
							Size={new UDim2(1, -px(48), 1, -px(160))}
						>
							<uilistlayout
								Padding={new UDim(0, px(5))}
								FillDirection={Enum.FillDirection.Horizontal}
								SortOrder={Enum.SortOrder.LayoutOrder}
								Wraps={true}
							/>
							{sortedCaseItems.map((item, index) => (
								<StackedItemCard
									item={{ id: item.id, case_index: index }}
									quantity={1}
									itemData={item}
									layoutOrder={index}
								/>
							))}
						</frame>
					</frame>
				</frame>
			)}
		</frame>
	);
});
