import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Trade } from "typings/APIResponses";
import { Corner } from "../tools/Corner";
import { SectionStroke } from "../tools/SectionStroke";
import { Players } from "@rbxts/services";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { TextLabel } from "../core/TextLabel";
import { timeUntil } from "shared/util/string-utils";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { setInterval } from "@rbxts/set-timeout";

interface Props {
	trade: Trade;
	layoutOrder: number;
	selectedTrade: number;
	setSelectedTrade: React.Dispatch<React.SetStateAction<number>>;
}

export function TradeListTile({ trade, layoutOrder, selectedTrade, setSelectedTrade }: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const oppositeUserRole =
		trade.initiator.user_id !== tostring(Players.LocalPlayer.UserId) ? "initiator" : "receiver";
	const [darkOverlayTransparency, darkOverlayTransparencyMotion] = useMotion(0.5);
	const [updatedAtTimestamp, setUpdatedAtTimestamp] = useState<string>("");

	useEffect(() => {
		const options = {
			time: 0.3,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.InOut,
		};

		darkOverlayTransparencyMotion.tween(selectedTrade === trade.trade_id ? 1 : 0.5, options);

		setUpdatedAtTimestamp(timeUntil(trade.updated_at));
		const clear = setInterval(() => {
			setUpdatedAtTimestamp(timeUntil(trade.updated_at));
		}, 1);

		return () => {
			clear();
		};
	}, [selectedTrade]);

	const arrowData = useMemo(() => {
		const getItemValue = (items: string[]) =>
			items.reduce((total, item) => {
				const itemId = item.split(":")[1];
				const itemInfo = clientStateController.ItemInfo.get(itemId);
				return total + (itemInfo ? itemInfo.value : 0);
			}, 0);

		const initiatorValue = getItemValue(trade.initiator.items);
		const receiverValue = getItemValue(trade.receiver.items);
		const localPlayerValue = oppositeUserRole === "initiator" ? receiverValue : initiatorValue;
		const otherPlayerValue = oppositeUserRole === "initiator" ? initiatorValue : receiverValue;

		if (localPlayerValue < otherPlayerValue) {
			return {
				image: "rbxassetid://115564650212815",
				color: Color3.fromRGB(98, 209, 98),
			};
		} else {
			return {
				image: "rbxassetid://88111142849537",
				color: Color3.fromRGB(209, 98, 98),
			};
		}
	}, [trade]);

	return (
		<imagebutton
			BackgroundTransparency={0}
			Size={new UDim2(1, px(-2), 0, px(65))}
			BackgroundColor3={palette.background1}
			AutoButtonColor={false}
			LayoutOrder={layoutOrder}
			Event={{
				Activated: () => {
					setSelectedTrade(selectedTrade === trade.trade_id ? 0 : trade.trade_id);
				},
			}}
		>
			<Corner roundness="small" />
			<SectionStroke />
			<frame
				BackgroundColor3={palette.background1}
				BackgroundTransparency={darkOverlayTransparency}
				Size={new UDim2(1, px(5), 1, px(5))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BorderSizePixel={0}
				ZIndex={10}
			/>
			<imagelabel
				BackgroundTransparency={1}
				Position={new UDim2(0, px(10), 0.5, 0)}
				Size={new UDim2(0, px(50), 0, px(50))}
				AnchorPoint={new Vector2(0, 0.5)}
				Image={`rbxthumb://type=AvatarHeadShot&id=${trade[oppositeUserRole].user_id}&w=150&h=150`}
			>
				<Corner roundness="full" />
				<SectionStroke />
			</imagelabel>
			<TextLabel
				weight="SemiBold"
				typeface="Sans"
				native={{
					TextColor3: palette.primaryText,
					TextSize: px(20),
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextXAlignment: Enum.TextXAlignment.Left,
					AnchorPoint: new Vector2(0, 0.5),
					BackgroundTransparency: 1,
					Position: new UDim2(0, px(70), 0.5, -px(7)),
					Size: new UDim2(0, px(132), 0, px(20)),
					Text: trade[oppositeUserRole].display_name,
				}}
			/>
			<TextLabel
				weight="Medium"
				typeface="Sans"
				native={{
					TextColor3: palette.darkerText,
					TextSize: px(15),
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextXAlignment: Enum.TextXAlignment.Left,
					AnchorPoint: new Vector2(0, 0.5),
					BackgroundTransparency: 1,
					Position: new UDim2(0, px(70), 0.5, px(10)),
					Size: new UDim2(0, px(165), 0, px(15)),
					Text: `@${trade[oppositeUserRole].username}`,
				}}
			/>
			<TextLabel
				weight="Medium"
				typeface="Sans"
				native={{
					TextColor3: palette.darkerText,
					TextSize: px(13),
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextXAlignment: Enum.TextXAlignment.Right,
					AnchorPoint: new Vector2(1, 0),
					BackgroundTransparency: 1,
					Position: new UDim2(1, px(-10), 0, px(10)),
					Size: new UDim2(0, px(110), 0, px(13)),
					Text: updatedAtTimestamp,
				}}
			/>
			<TextLabel
				weight="SemiBold"
				typeface="Sans"
				native={{
					TextColor3: palette.red,
					TextSize: px(13),
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextXAlignment: Enum.TextXAlignment.Right,
					AnchorPoint: new Vector2(1, 0),
					BackgroundTransparency: 1,
					Position: new UDim2(1, px(-10), 0, px(25)),
					Size: new UDim2(0, px(110), 0, px(13)),
					Text: ["pending", "accepted"].includes(trade.status)
						? ""
						: `${string.upper(string.sub(trade.status, 1, 1))}${string.lower(string.sub(trade.status, 2))}`,
				}}
			/>

			<imagelabel
				Image={arrowData.image}
				ImageColor3={arrowData.color}
				AnchorPoint={new Vector2(0, 0.5)}
				BackgroundTransparency={1}
				Position={new UDim2(0, 235, 0.5, 10)}
				Size={new UDim2(0, 23, 0, 23)}
				Visible={trade.status === "pending" || trade.status === "accepted"}
			/>
		</imagebutton>
	);
}
