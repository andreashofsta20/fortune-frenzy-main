import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { ScaleFunction, usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Trade } from "typings/APIResponses";
import { Corner } from "../tools/Corner";
import { SectionStroke } from "../tools/SectionStroke";
import { Players } from "@rbxts/services";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { TextLabel } from "../core/TextLabel";
import { replacePlaceholder, timeUntil } from "shared/util/string-utils";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core";
import { TRADING_SELECTED_TITLE, TRADING_ITEM_TITLE } from "shared/util/strings";
import { formatWithSuffix } from "shared/util/number-utils";
import { renderItem } from "../coinflip/CoinflipViewing";
import { Button } from "../core/Button";
import { Functions } from "client/network";
import { usePxScale } from "client/hooks/use-scale";
import { isLoadingAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";

interface Props {
	tradeId: number;
	setSelectedTradeId: React.Dispatch<React.SetStateAction<number>>;
}

const UserSection = ({
	px,
	items,
	text,
	side,
	scrollSize,
}: {
	px: ScaleFunction;
	items: string[];
	text: string;
	side: "left" | "right";
	scrollSize: UDim2;
}) => {
	const position = side === "left" ? new UDim2(0, 0, 0.5, px(-3)) : new UDim2(1, 0, 0.5, px(-3));
	const size = new UDim2(0, px(278), 0, px(260));
	const anchorPoint = side === "left" ? new Vector2(0, 0.5) : new Vector2(1, 0.5);

	return (
		<frame BackgroundTransparency={1} AnchorPoint={anchorPoint} Position={position} Size={size}>
			<TextLabel
				weight="Medium"
				typeface="Sans"
				native={{
					TextColor3: palette.midText,
					TextSize: px(20),
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextXAlignment: Enum.TextXAlignment.Left,
					BackgroundTransparency: 1,
					Position: new UDim2(0, 0, 0, 0),
					Size: new UDim2(1, px(-5), 0, px(20)),
					Text: text,
				}}
			/>

			<scrollingframe
				AnchorPoint={new Vector2(0, 1)}
				BackgroundTransparency={1}
				Position={new UDim2(0, 0, 1, px(-2))}
				Size={new UDim2(1, 0, 1, px(-30))}
				CanvasSize={scrollSize}
				CanvasPosition={new Vector2(0, 0)}
				ClipsDescendants={true}
				ScrollBarThickness={0}
				ScrollBarImageTransparency={1}
			>
				<uilistlayout
					Padding={new UDim(0, px(6))}
					SortOrder={Enum.SortOrder.LayoutOrder}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
				/>
				<uipadding
					PaddingTop={new UDim(0, px(1))}
					PaddingLeft={new UDim(0, px(1))}
					PaddingRight={new UDim(0, px(1))}
					PaddingBottom={new UDim(0, px(1))}
				/>
				{items.map((item, index) => {
					return renderItem(item, index, px, px(-2));
				})}
			</scrollingframe>
		</frame>
	);
};

export function TradeInfoArea({ tradeId, setSelectedTradeId }: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [overlayTransparency, overlayTransparencyMotion] = useMotion(0);
	const [currentTradeData, setCurrentTradeData] = useState<Trade>();
	const [leftItemsListSize, setLeftItemsListSize] = useState(new UDim2(1, 0, 0, 0));
	const [rightItemsListSize, setRightItemsListSize] = useState(new UDim2(1, 0, 0, 0));

	function getTradeText(isGiving: boolean, status: string, value: number) {
		let tense = "";
		let action = "";

		if (status === "pending") {
			tense = "will";
			action = isGiving ? "give" : "receive";
		} else if (status === "accepted") {
			tense = "";
			action = isGiving ? "gave" : "received";
		} else {
			tense = "would've";
			action = isGiving ? "given" : "received";
		}

		return `You ${tense ? tense + " " : ""}${action} (${formatWithSuffix(value, 2)})`;
	}

	const data = useMemo(() => {
		const trade = clientStateController.Trades[`${tradeId}`] || currentTradeData;
		if (!trade) {
			return {
				title: "Something went wrong.",
				titleColor: palette.white,
				leftData: { items: [], text: "" },
				rightData: { items: [], text: "" },
				tradeType: "completed",
			};
		}

		const getItemValue = (items: string[]) => {
			return items.reduce((total, item) => {
				const itemId = item.split(":")[1];
				const itemInfo = clientStateController.ItemInfo.get(itemId);
				return total + (itemInfo?.value || 0);
			}, 0);
		};

		const initiatorValue = getItemValue(trade.initiator.items);
		const receiverValue = getItemValue(trade.receiver.items);
		const isInitiator = trade.initiator.user_id === tostring(Players.LocalPlayer.UserId);
		const localPlayerValue = isInitiator ? initiatorValue : receiverValue;
		const otherPlayerValue = isInitiator ? receiverValue : initiatorValue;
		const profit = otherPlayerValue > localPlayerValue;
		const leftSideItems = isInitiator ? trade.initiator.items : trade.receiver.items;
		const rightSideItems = isInitiator ? trade.receiver.items : trade.initiator.items;

		setLeftItemsListSize(
			new UDim2(1, 0, 0, (leftSideItems.size() * px(48) + (leftSideItems.size() - 1) * px(6) + 2) * pxScale()),
		);
		setRightItemsListSize(
			new UDim2(1, 0, 0, (rightSideItems.size() * px(48) + (rightSideItems.size() - 1) * px(6) + 2) * pxScale()),
		);

		return {
			title: replacePlaceholder(
				replacePlaceholder(
					replacePlaceholder(
						TRADING_SELECTED_TITLE,
						"{{tense}}",
						trade.status === "pending" ? "You'll" : trade.status === "accepted" ? "You" : "You would've",
					),
					"{{action}}",
					profit
						? trade.status === "accepted" || trade.status === "declined" || trade.status === "cancelled"
							? "gained"
							: "gain"
						: trade.status === "accepted" || trade.status === "declined" || trade.status === "cancelled"
							? "lost"
							: "lose",
				),
				"{{value}}",
				formatWithSuffix(math.abs(localPlayerValue - otherPlayerValue), 2),
			),
			titleColor: profit ? palette.profitGreen : palette.lossRed,
			leftData: {
				items: trade[isInitiator ? "initiator" : "receiver"].items,
				text: getTradeText(true, trade.status, localPlayerValue),
			},
			rightData: {
				items: trade[isInitiator ? "receiver" : "initiator"].items,
				text: getTradeText(false, trade.status, otherPlayerValue),
			},
			tradeType: trade.status === "pending" ? (isInitiator ? "outbound" : "inbound") : "completed",
			currentData: trade,
		};
	}, [tradeId]);

	useEffect(() => {
		if (tradeId !== 0) setCurrentTradeData(clientStateController.Trades[`${tradeId}`]);

		const options = {
			time: 0.3,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.InOut,
		};

		if (tradeId !== 0) {
			overlayTransparencyMotion.immediate(0);
			overlayTransparencyMotion.tween(1, options);
		} else {
			overlayTransparencyMotion.tween(0, options);
		}
	}, [tradeId]);

	return (
		<frame
			BackgroundTransparency={1}
			AnchorPoint={new Vector2(1, 1)}
			Position={new UDim2(1, px(-20), 1, px(-20))}
			Size={new UDim2(0, px(565), 0, px(330))}
		>
			<frame
				Size={new UDim2(1, px(5), 1, px(5))}
				BackgroundTransparency={overlayTransparency}
				Position={UDim2.fromScale(0.5, 0.5)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundColor3={palette.background1}
				BorderSizePixel={0}
				ZIndex={10}
			/>
			<TextLabel
				weight="Bold"
				typeface="Sans"
				native={{
					TextColor3: data.titleColor,
					TextSize: px(24),
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextXAlignment: Enum.TextXAlignment.Left,
					BackgroundTransparency: 1,
					Position: new UDim2(0, 0, 0, px(5)),
					Size: new UDim2(1, 0, 0, px(24)),
					Text: data.title,
				}}
			/>
			<UserSection
				items={data.leftData.items}
				text={data.leftData.text}
				side="left"
				px={px}
				scrollSize={leftItemsListSize}
			/>
			<UserSection
				items={data.rightData.items}
				text={data.rightData.text}
				side="right"
				px={px}
				scrollSize={rightItemsListSize}
			/>
			{data.tradeType !== "completed" && (
				<>
					{data.tradeType === "inbound" && (
						<Button
							size={new UDim2(0, px(120), 0, px(32))}
							position={new UDim2(1, px(-130), 1, 0)}
							anchorPoint={new Vector2(1, 1)}
							text="Accept"
							backgroundColor={palette.blue}
							weight="SemiBold"
							typeface="Sans"
							textColor={palette.blueText}
							event={{
								Activated: async () => {
									isLoadingAtom(true);
									setCurrentTradeData(clientStateController.Trades[`${tradeId}`]);
									await requestServer(
										Functions.Trading.AcceptTrade,
										"Failed to accept trade",
										tostring(tradeId),
									);
									setSelectedTradeId(0);
									isLoadingAtom(false);
								},
							}}
						/>
					)}
					<Button
						size={new UDim2(0, px(120), 0, px(32))}
						position={new UDim2(1, 0, 1, 0)}
						anchorPoint={new Vector2(1, 1)}
						text={data.tradeType === "inbound" ? "Decline" : "Cancel"}
						backgroundColor={palette.background1}
						weight="SemiBold"
						typeface="Sans"
						textColor={palette.blue}
						event={{
							Activated: async () => {
								isLoadingAtom(true);
								setCurrentTradeData(clientStateController.Trades[`${tradeId}`]);
								setSelectedTradeId(0);
								clientStateController.markTradeSelfCancelled(`${tradeId}`);
								await requestServer(
									Functions.Trading.CancelTrade,
									"Failed to cancel trade",
									tostring(tradeId),
								);
								isLoadingAtom(false);
							},
						}}
					>
						<uistroke Color={palette.blue} Thickness={px(1)} />
					</Button>
				</>
			)}
		</frame>
	);
}
