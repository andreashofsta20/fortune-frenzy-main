import React, { useEffect, useState } from "@rbxts/react";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { usePx } from "client/hooks/use-px";
import { formatWithSuffix } from "shared/util/number-utils";
import { Button } from "../core/Button";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { brighten } from "client/utils/color-utils";
import { PLAYERS_CARD_TRADE_BUTTON, PLAYERS_CARD_TRADE_BUTTON_YOU } from "shared/util/strings";
import buttonClick from "client/utils/ui-effects/button-click";

interface Props {
	playerData: {
		display_name: string;
		username: string;
		userId: number;
		membershipType: "Premium" | "None";
		verifiedBadge: boolean;
		cash: number;
		value: number;
	};
	layoutOrder: number;
	openProfileClicked: (userId: string) => void;
	tradeButtonClicked: (playerData: { userId: string; username: string; display_name: string }) => void;
}

export function PlayerGridTile({ playerData, layoutOrder, openProfileClicked, tradeButtonClicked }: Props) {
	let nameString = playerData.display_name;
	if (playerData.membershipType === "Premium") nameString += `${utf8.char(0xe001)}`;
	if (playerData.verifiedBadge) nameString += `${utf8.char(0xe000)}`;
	const px = usePx();

	const [cash, setCash] = useState<number>(playerData.cash);
	const [value, setValue] = useState<number>(playerData.value);
	const [frameStrokeColor, frameStrokeColorMotion] = useMotion(palette.stroke);

	useEffect(() => {
		const player = game.GetService("Players").GetPlayerByUserId(playerData.userId);
		if (!player) return;

		const leaderstats = player.FindFirstChild("leaderstats");
		if (leaderstats === undefined) return;
		const cashStat = leaderstats.FindFirstChild("Cash") as IntValue | undefined;
		const valueStat = leaderstats.FindFirstChild("Value") as IntValue | undefined;
		if (cashStat === undefined || valueStat === undefined) return;

		setCash(cashStat.Value);
		setValue(valueStat.Value);

		const cashConnection = cashStat.GetPropertyChangedSignal("Value").Connect(() => setCash(cashStat.Value));
		const valueConnection = valueStat.GetPropertyChangedSignal("Value").Connect(() => setValue(valueStat.Value));

		return () => {
			cashConnection.Disconnect();
			valueConnection.Disconnect();
		};
	}, [playerData]);

	return (
		<imagebutton
			BackgroundColor3={palette.background2}
			LayoutOrder={layoutOrder}
			AutoButtonColor={false}
			Event={{
				MouseEnter: () => {
					frameStrokeColorMotion.tween(brighten(palette.stroke, 0.1), {
						time: 0.5,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.Out,
					});
				},
				MouseLeave: () => {
					frameStrokeColorMotion.tween(palette.stroke, {
						time: 0.5,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.Out,
					});
				},
				Activated: () => {
					buttonClick();
					openProfileClicked(tostring(playerData.userId));
				},
			}}
		>
			<Corner roundness="small" />
			<uistroke Color={frameStrokeColor} Thickness={px(1)} />
			<imagelabel
				Image={`rbxthumb://type=AvatarHeadShot&id=${playerData.userId}&w=150&h=150`}
				BackgroundTransparency={1}
				Position={new UDim2(0, 14, 0, 14)}
				Size={new UDim2(0, 70, 0, 70)}
			>
				<Corner roundness="full" />
				<uistroke Color={frameStrokeColor} Thickness={px(1)} />
			</imagelabel>
			<TextLabel
				weight="SemiBold"
				typeface="Sans"
				native={{
					TextColor3: palette.primaryText,
					TextSize: px(20),
					Position: new UDim2(0, px(92), 0.5, px(-43)),
					Size: new UDim2(0, px(164), 0, px(20)),
					AnchorPoint: new Vector2(0, 0.5),
					BackgroundTransparency: 1,
					TextTruncate: Enum.TextTruncate.AtEnd,
					Text: nameString,
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<TextLabel
				weight="Medium"
				typeface="Sans"
				native={{
					TextColor3: palette.midText,
					TextSize: px(15),
					Position: new UDim2(0, px(92), 0.5, px(-24)),
					Size: new UDim2(0, px(164), 0, px(15)),
					AnchorPoint: new Vector2(0, 0.5),
					BackgroundTransparency: 1,
					TextTruncate: Enum.TextTruncate.AtEnd,
					Text: `@${playerData.username}`,
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<frame
				AnchorPoint={new Vector2(0.5, 0)}
				BackgroundColor3={Color3.fromRGB(255, 255, 255)}
				BackgroundTransparency={1}
				BorderColor3={Color3.fromRGB(0, 0, 0)}
				BorderSizePixel={0}
				Position={new UDim2(0.654, 0, 0.393, 5)}
				Size={new UDim2(0, 177, 0, 16)}
			>
				<uilistlayout FillDirection={Enum.FillDirection.Horizontal} SortOrder={Enum.SortOrder.LayoutOrder} />
				{[
					value > 0 && {
						text: `${formatWithSuffix(value, 1)}`,
						imageId: "rbxassetid://120000048331921",
						textOffset: 25,
					},
					{
						text: `${formatWithSuffix(cash, 1)}`,
						imageId: "rbxassetid://133730286428245",
						textOffset: 20,
					},
				]
					.filter((x) => x !== false)
					.map(({ text, imageId, textOffset }) => (
						<frame
							BackgroundTransparency={1}
							Size={new UDim2(0, 0, 0, px(16))}
							AutomaticSize={Enum.AutomaticSize.X}
						>
							<TextLabel
								weight="Medium"
								typeface="Sans"
								native={{
									Text: text,
									TextColor3: palette.darkerText,
									TextSize: px(15),
									TextTruncate: Enum.TextTruncate.AtEnd,
									TextWrapped: true,
									TextXAlignment: Enum.TextXAlignment.Left,
									BackgroundTransparency: 1,
									Position: new UDim2(0, textOffset, 0, 0),
									Size: new UDim2(0, 0, 0, px(16)),
									AutomaticSize: Enum.AutomaticSize.X,
								}}
							/>
							<imagelabel
								Image={imageId}
								ImageColor3={palette.darkerText}
								AnchorPoint={new Vector2(0, 0.5)}
								BackgroundTransparency={1}
								Position={new UDim2(0, 0, 0, px(8))}
								Size={new UDim2(0, px(20), 0, px(20))}
							/>
						</frame>
					))}
			</frame>
			<Button
				size={new UDim2(0, px(250), 0, px(36))}
				position={new UDim2(0.5, 0, 1, px(-10))}
				anchorPoint={new Vector2(0.5, 1)}
				text={
					playerData.userId === game.GetService("Players").LocalPlayer.UserId
						? PLAYERS_CARD_TRADE_BUTTON_YOU
						: PLAYERS_CARD_TRADE_BUTTON
				}
				animate={playerData.userId !== game.GetService("Players").LocalPlayer.UserId}
				enabled={playerData.userId !== game.GetService("Players").LocalPlayer.UserId}
				backgroundColor={palette.background2}
				textColor={palette.blue}
				weight="Medium"
				typeface="Sans"
				event={{
					Activated: () => {
						if (playerData.userId !== game.GetService("Players").LocalPlayer.UserId)
							tradeButtonClicked({
								userId: tostring(playerData.userId),
								username: playerData.username,
								display_name: playerData.display_name,
							});
					},
				}}
			>
				<Corner roundness="small" />
				<uistroke Color={palette.blue} Thickness={px(1)} />
			</Button>
		</imagebutton>
	);
}
