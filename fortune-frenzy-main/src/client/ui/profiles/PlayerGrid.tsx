import React, { PropsWithChildren, useCallback, useEffect, useMemo, useReducer, useRef } from "@rbxts/react";
import { Modding } from "@flamework/core";
import { usePx } from "client/hooks/use-px";
import { ClientStateController } from "client/controllers/ClientStateController";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { TextInputBox } from "../core/TextInputBox";
import {
	PLAYERS_MENU_TITLE,
	PLAYERS_SEARCH_PLACEHOLDER,
	PLAYERS_SORT_NAME,
	PLAYERS_SORT_VALUE_HIGH,
	PLAYERS_SORT_VALUE_LOW,
} from "shared/util/strings";
import { SortButton } from "../core/SortButton";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { PlayerGridTile } from "./PlayerGridTile";
import { useThrottleState } from "@rbxts/pretty-react-hooks";
import { usePxScale } from "client/hooks/use-scale";
import { isLoadingAtom } from "client/utils/global-state";
import { useAtom } from "@rbxts/react-charm";
import { handleCloseButton } from "client/utils/menu-utils";
import { VirtualizedScrollingFrame } from "../core/VirtualizedScrollingFrame";

interface Props extends PropsWithChildren {
	visible: boolean;
	openProfileClicked: (userId: string) => void;
	tradeButtonClicked: (playerData: { userId: string; username: string; display_name: string }) => void;
}

const initialState = {
	firstVisibleRow: 0,
	lastVisibleRow: 10,
	canvasSize: new UDim2(1, 0, 0, 0),
	sortOrder: "value_high",
	canvasPosition: new Vector2(0, 0),
};

type Action =
	| { type: "SET_FIRST_VISIBLE_ROW"; payload: number }
	| { type: "SET_LAST_VISIBLE_ROW"; payload: number }
	| { type: "SET_CANVAS_SIZE"; payload: UDim2 }
	| { type: "SET_SORT_ORDER"; payload: string }
	| { type: "SET_CANVAS_POSITION"; payload: Vector2 };

function reducer(state: typeof initialState, action: Action) {
	switch (action.type) {
		case "SET_FIRST_VISIBLE_ROW":
			return { ...state, firstVisibleRow: action.payload };
		case "SET_LAST_VISIBLE_ROW":
			return { ...state, lastVisibleRow: action.payload };
		case "SET_CANVAS_SIZE":
			return { ...state, canvasSize: action.payload };
		case "SET_SORT_ORDER":
			return { ...state, sortOrder: action.payload };
		case "SET_CANVAS_POSITION":
			return { ...state, canvasPosition: action.payload };
		default:
			return state;
	}
}

export const PlayerGrid = React.memo(({ visible, openProfileClicked, tradeButtonClicked, children }: Props) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const pxScale = usePxScale();
	const rowHeight = (px(145) + px(10)) * pxScale();
	const [searchQuery, setSearchQuery] = useThrottleState("", { wait: 0.2, trailing: true, leading: true });
	const [state, dispatch] = useReducer(reducer, initialState);
	const [currentUsers, setCurrentUsers] = React.useState<
		{ id: string; name: string; display_name: string; current_cash: number; current_value: number; index: number }[]
	>([]);

	const playerTiles = useMemo(() => {
		return (
			currentUsers?.map((item) => (
				<PlayerGridTile
					key={`player-tile-${item.id}`}
					playerData={{
						display_name: item.display_name,
						username: item.name,
						userId: tonumber(item.id) || 0,
						membershipType: "None",
						verifiedBadge: false,
						cash: item.current_cash,
						value: item.current_value,
					}}
					layoutOrder={item.index}
					openProfileClicked={openProfileClicked}
					tradeButtonClicked={tradeButtonClicked}
				/>
			)) ?? []
		);
	}, [currentUsers, openProfileClicked, tradeButtonClicked]);

	useEffect(() => {
		async function fetchUsers() {
			isLoadingAtom(true);
			const results = await clientStateController.SearchPlayers(
				searchQuery,
				state.sortOrder as "value_high" | "value_low" | "name_a-z" | "name_z-a",
			);
			isLoadingAtom(false);
			setCurrentUsers(results.map((item, idx) => ({ ...item, index: idx })));
		}

		if (visible) fetchUsers();
	}, [searchQuery, visible, clientStateController, state.sortOrder]);

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
					Text: PLAYERS_MENU_TITLE,
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{
				Size: new UDim2(0, px(21), 0, px(21)),
				Position: new UDim2(1, px(-24), 0, px(24)),
				AnchorPoint: new Vector2(1, 0),
			}}
				event={{ Activated: handleCloseButton }}
			/>
			<TextInputBox
				size={new UDim2(0, px(675), 0, px(32))}
				position={new UDim2(0, px(25), 0, px(63))}
				typeface="Sans"
				weight="Medium"
				placeholder={PLAYERS_SEARCH_PLACEHOLDER.gsub("{{count}}", tostring(1))[0]}
				image="rbxassetid://104380087729663"
				event={{
					FocusLost: (text: TextBox) => {
						// VirtualizedScrollingFrame will start at top automatically
						setSearchQuery(text.Text);
					},
				}}
			/>
			<SortButton
				size={new UDim2(0, px(166), 0, px(32))}
				position={new UDim2(0, px(710), 0, px(63))}
				typeface="Sans"
				weight="Medium"
				setSortOrder={(order: string) => dispatch({ type: "SET_SORT_ORDER", payload: order })}
				options={[
					["value_high", PLAYERS_SORT_VALUE_HIGH, 0, "rbxassetid://89977107525633"],
					["value_low", PLAYERS_SORT_VALUE_LOW, 180, "rbxassetid://89977107525633"],
					["name_a-z", "Sort by A-Z", 0, "rbxassetid://126172904480875"],
					["name_z-a", "Sort by Z-A", 0, "rbxassetid://126172904480875"],
				]}
			/>
			<VirtualizedScrollingFrame
				size={new UDim2(0, px(850), 0, px(340))}
				position={new UDim2(0.5, 0, 0, px(108))}
				anchorPoint={new Vector2(0.5, 0)}
				backgroundTransparency={1}
				scrollBarThickness={0}
				items={playerTiles}
				rowHeight={rowHeight}
				itemsPerRow={3}
				cellSize={UDim2.fromOffset(px(275), px(145))}
				cellPadding={UDim2.fromOffset(px(10), px(10))}
				padding={{ left: px(2), right: px(2) }}
			/>
			{children}
		</frame>
	);
});
