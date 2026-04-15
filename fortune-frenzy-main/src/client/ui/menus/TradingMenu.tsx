import React, { useEffect, useMemo, useReducer, useState } from "@rbxts/react";
import { MenuCore } from "../navigation/MenuCore";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { TRADING_TITLE } from "shared/util/strings";
import { ButtonGroup } from "../core/ButtonGroup";
import { usePxScale } from "client/hooks/use-scale";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core";
import { Trade } from "typings/APIResponses";
import { TradeListTile } from "../trading/TradeListTile";
import { Players } from "@rbxts/services";
import { TradeInfoArea } from "../trading/TradeInfoArea";
import { handleCloseButton } from "client/utils/menu-utils";
import { VirtualizedScrollingFrame } from "../core/VirtualizedScrollingFrame";

// Simple throttle hook (include this if you don't have one)
function useThrottle<T extends (...args: unknown[]) => void>(func: T, delay: number): T {
	let timeout: thread | undefined;
	return ((...args: Parameters<T>) => {
		if (timeout) return;
		timeout = task.delay(delay / 1000, () => {
			func(...args);
			timeout = undefined;
		});
	}) as T;
}

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

const initialState = {
	firstVisibleTile: 0,
	lastVisibleTile: 10,
	canvasSize: new UDim2(0, 0, 0, 0),
	currentTab: "Inbound",
};

function reducer(
	state: typeof initialState,
	action:
		| { type: "SET_FIRST_VISIBLE_TILE"; payload: number }
		| { type: "SET_LAST_VISIBLE_TILE"; payload: number }
		| { type: "SET_CANVAS_SIZE"; payload: UDim2 }
		| { type: "SET_CURRENT_TAB"; payload: string },
) {
	switch (action.type) {
		case "SET_FIRST_VISIBLE_TILE":
			return { ...state, firstVisibleTile: action.payload };
		case "SET_LAST_VISIBLE_TILE":
			return { ...state, lastVisibleTile: action.payload };
		case "SET_CANVAS_SIZE":
			return { ...state, canvasSize: action.payload };
		case "SET_CURRENT_TAB":
			return { ...state, currentTab: action.payload };
		default:
			return state;
	}
}

function TradingMenuComponent({ visible, flashMenu }: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [state, dispatch] = useReducer(reducer, initialState);
	const [selectedTradeId, setSelectedTradeId] = useState<number>(0);

	const tileHeight = px(65) * pxScale();
	const tilePadding = px(10) * pxScale();
	const rowHeight = tileHeight + tilePadding;

	// Counter used solely to force re-renders when trades update
	const [updateCounter, setUpdateCounter] = useState(0);

	const filteredTrades = useMemo(() => {
		const tradesArray: Array<Trade> = [];
		for (const [, trade] of pairs(clientStateController.Trades)) {
			tradesArray.push(trade);
		}
		tradesArray.sort((a, b) => {
			return (
				(DateTime.fromIsoDate(a.created_at) ?? DateTime.now()).UnixTimestamp >
				(DateTime.fromIsoDate(b.created_at) ?? DateTime.now()).UnixTimestamp
			);
		});

		return tradesArray.filter((trade) => {
			if (state.currentTab === "Inbound")
				return trade.receiver.user_id === tostring(Players.LocalPlayer.UserId) && trade.status === "pending";
			else if (state.currentTab === "Outbound")
				return trade.initiator.user_id === tostring(Players.LocalPlayer.UserId) && trade.status === "pending";
			else if (state.currentTab === "Completed") return trade.status === "accepted";
			else if (state.currentTab === "Cancelled")
				return trade.status === "declined" || trade.status === "cancelled" || trade.status === "failed";
			return false;
		});
	}, [clientStateController.Trades, state.currentTab, updateCounter]);

	const tradeListTiles = useMemo(() => {
		return filteredTrades.map((trade, index) => (
			<TradeListTile
				trade={trade}
				layoutOrder={index}
				selectedTrade={selectedTradeId}
				setSelectedTrade={setSelectedTradeId}
				key={`trade_${trade.trade_id}`}
			/>
		));
	}, [filteredTrades, selectedTradeId]);

	useEffect(() => {
		setSelectedTradeId(0);
	}, [state.currentTab]);

	// Subscribe to cache updates so the list refreshes when any trade changes status
	useEffect(() => {
		if (!visible) return;

		// Immediate update when opening the menu
		setUpdateCounter((v) => v + 1);

		const connection = clientStateController.TradesChangedEvent.Connect(() => {
			setUpdateCounter((v) => v + 1);
		});

		return () => connection.Disconnect();
	}, [visible]);

	return (
		<MenuCore>
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
						Text: TRADING_TITLE,
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
					event={{
						Activated: () => {
							handleCloseButton();
							dispatch({ type: "SET_CURRENT_TAB", payload: "Inbound" });
							setSelectedTradeId(0);
						},
					}}
				/>
				<ButtonGroup
					typeface="Sans"
					weight="SemiBold"
					options={["Inbound", "Outbound", "Completed", "Cancelled"]}
					setState={(tab) => dispatch({ type: "SET_CURRENT_TAB", payload: tab })}
					state={state.currentTab}
					position={new UDim2(0, px(24), 0, px(60))}
					backgroundColor={palette.background1}
				/>
				<VirtualizedScrollingFrame
					size={new UDim2(0, px(280), 0, px(330))}
					position={new UDim2(0, px(24), 1, px(-24))}
					anchorPoint={new Vector2(0, 1)}
					backgroundTransparency={1}
					scrollBarThickness={0}
					layout="list"
					listPadding={new UDim(0, tilePadding)}
					items={tradeListTiles}
					rowHeight={rowHeight}
					itemsPerRow={1}
				/>
				<TradeInfoArea tradeId={selectedTradeId} setSelectedTradeId={setSelectedTradeId} />
			</frame>
		</MenuCore>
	);
}

export const TradingMenu = React.memo(TradingMenuComponent);
