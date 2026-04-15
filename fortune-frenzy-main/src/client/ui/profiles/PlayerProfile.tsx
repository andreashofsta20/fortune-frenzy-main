import React, { PropsWithChildren, useCallback, useEffect, useState } from "@rbxts/react";
import { Modding } from "@flamework/core";
import { usePx } from "client/hooks/use-px";
import { ClientStateController } from "client/controllers/ClientStateController";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { PLAYERS_PROFILE_TITLE } from "shared/util/strings";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { replacePlaceholder } from "shared/util/string-utils";
import { PlayerData } from "typings/APIResponses";
import { SectionStroke } from "../tools/SectionStroke";
import { calculateLevelXP } from "shared/util/calculate-level";
import { addCommasToNumber, formatDuration, formatWithSuffix, setDecimalPlaces } from "shared/util/number-utils";
import { useAtom } from "@rbxts/react-charm";
import { currentSelectedPlayerAtom, isLoadingAtom } from "client/utils/global-state";

interface Props extends PropsWithChildren {
	visible: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const statisticsInfo: [string, string, string, (value: any) => string][] = [
	[
		"leaderboard_pos",
		"Currently ranked {{p}} on the leaderboard",
		"rbxassetid://96745169620692",
		(value: number) => `#${formatWithSuffix(value, 2)}`,
	],
	[
		"total_cash_earned",
		"Earned a total of {{p}} all time",
		"rbxassetid://133730286428245",
		(value: number) => `$${addCommasToNumber(value)}`,
	],
	[
		"win_rate",
		"Win rate of {{p}} across all games",
		"rbxassetid://122807574255954",
		(value: number) => `${setDecimalPlaces(value, 2)}%`,
	],
	[
		"biggest_win",
		"Highest single win was {{p}}",
		"rbxassetid://131848829350759",
		(value: number) => `$${addCommasToNumber(value)}`,
	],
	[
		"total_plays",
		"Played a total of {{p}} games",
		"rbxassetid://81449529015625",
		(value: number) => `${addCommasToNumber(value)}`,
	],
	["favourite_mode", "Favourite mode is {{p}}", "rbxassetid://93534853136299", (value: string) => value],
	["time_played", "Has played for {{p}}", "rbxassetid://97956651198525", (value: number) => formatDuration(value)],
];

export const PlayerProfile = React.memo(({ visible, children }: Props) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const [xpBarSize, xpBarSizeMotion] = useMotion(new UDim2(0, 0, 1, 0));
	const [data, setData] = useState<
		| {
				pData: PlayerData;
				recentActivity: Array<{ image: string; text: string }>;
				xpData: { current_level: number; xp_to_next_level: number; xp_next_level: number };
		  }
		| undefined
	>(undefined);
	const currentSelectedPlayer = useAtom(currentSelectedPlayerAtom);

	const handleCloseButton = useCallback(() => {
		currentSelectedPlayerAtom(undefined);
		setData(undefined);
	}, []);

	useEffect(() => {
		async function load(userId: string) {
			isLoadingAtom(true);
			const response = await clientStateController.GetPlayerInformation(tonumber(userId) || 0);
			if (response) {
				const xpData = calculateLevelXP(response.pData.statistics.xp);
				setData({
					pData: response.pData,
					recentActivity: response.recentActivity,
					xpData,
				});
				xpBarSizeMotion.immediate(new UDim2(0, 0, 1, 0));
				xpBarSizeMotion.tween(
					new UDim2((response.pData.statistics.xp || 0) / (xpData.xp_next_level || 1), 0, 1, 0),
					{ time: 0.5, style: Enum.EasingStyle.Exponential, direction: Enum.EasingDirection.InOut },
				);
			} else {
				handleCloseButton();
			}
			isLoadingAtom(false);
		}

		if (currentSelectedPlayer && visible) {
			load(currentSelectedPlayer);
		}
	}, [currentSelectedPlayer, visible, clientStateController, handleCloseButton]);

	useEffect(() => {
		if (!visible) setData(undefined);
	}, [visible]);

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
					Text: replacePlaceholder(PLAYERS_PROFILE_TITLE, "{{name}}", data?.pData.name ?? ""),
					TextSize: px(28),
					Size: new UDim2(1, px(-48), 0, px(28)),
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
			<frame
				BackgroundColor3={palette.background2}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, px(60))}
				Size={new UDim2(0, px(850), 0, px(105))}
			>
				<Corner roundness="small" />
				<SectionStroke />
				<imagelabel
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0, 0.5)}
					Size={new UDim2(0, px(75), 0, px(75))}
					Position={new UDim2(0, px(15), 0.5, 0)}
					Image={`rbxthumb://type=AvatarHeadShot&id=${data?.pData.user_id}&w=150&h=150`}
				>
					<Corner roundness="full" />
					<SectionStroke />
				</imagelabel>
				<TextLabel
					typeface="Sans"
					weight="Regular"
					native={{
						RichText: true,
						Text: `<b><font color="#4b76ea">Level ${addCommasToNumber(data?.xpData.current_level || 0)}</font></b> ${formatWithSuffix(data?.xpData.xp_to_next_level || 0, 2)} XP until next level!`,
						TextColor3: palette.darkerText,
						TextSize: px(18),
						Position: new UDim2(0, px(105), 0, px(30)),
						Size: new UDim2(0, px(500), 0, px(18)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<canvasgroup
					BackgroundColor3={palette.background5}
					Position={new UDim2(0, px(105), 0.5, px(5))}
					Size={new UDim2(0, px(700), 0, px(20))}
				>
					<Corner roundness="full" />
					<frame BackgroundColor3={palette.blue} Position={new UDim2(0, px(-10), 0, 0)} Size={xpBarSize}>
						<Corner roundness="full" />
					</frame>
				</canvasgroup>
			</frame>
			<frame
				BackgroundColor3={palette.background2}
				AnchorPoint={new Vector2(0, 1)}
				Position={new UDim2(0, px(24), 1, px(-24))}
				Size={new UDim2(0, px(344), 0, px(269))}
			>
				<Corner roundness="small" />
				<SectionStroke />
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `Statistics`,
						TextColor3: palette.primaryText,
						TextSize: px(20),
						Position: new UDim2(0, px(15), 0, px(15)),
						Size: new UDim2(1, px(-15), 0, px(20)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<frame
					BackgroundTransparency={1}
					Size={new UDim2(1, px(-30), 1, px(-60))}
					Position={new UDim2(0, px(15), 0, px(45))}
				>
					<uilistlayout
						Padding={new UDim(0, px(11))}
						FillDirection={Enum.FillDirection.Vertical}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					{statisticsInfo.map((info, index) => {
						const field = info[0] as keyof PlayerData["statistics"];
						const value = data?.pData.statistics[field];
						if (value === undefined) return undefined;

						return (
							<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(20))} LayoutOrder={index}>
								<imagelabel
									Size={new UDim2(0, px(20), 0, px(20))}
									Image={info[2]}
									ImageColor3={palette.darkerText}
									BackgroundTransparency={1}
								/>
								<TextLabel
									typeface="Sans"
									weight="Regular"
									native={{
										RichText: true,
										Text: replacePlaceholder(
											info[1],
											"{{p}}",
											`<font color="#${palette.blue.ToHex()}">${info[3](value)}</font>`,
										),
										TextColor3: palette.darkerText,
										TextSize: px(16),
										Position: new UDim2(0, px(27), 0, 0),
										Size: new UDim2(1, px(-27), 1, 0),
										TextXAlignment: Enum.TextXAlignment.Left,
									}}
								/>
							</frame>
						);
					})}
				</frame>
			</frame>
			<frame
				BackgroundColor3={palette.background2}
				AnchorPoint={new Vector2(1, 1)}
				Position={new UDim2(1, px(-24), 1, px(-24))}
				Size={new UDim2(0, px(497), 0, px(269))}
				ClipsDescendants={true}
			>
				<Corner roundness="small" />
				<SectionStroke />
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `Recent Activity`,
						TextColor3: palette.primaryText,
						TextSize: px(20),
						Position: new UDim2(0, px(15), 0, px(15)),
						Size: new UDim2(1, px(-15), 0, px(20)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<frame
					BackgroundTransparency={1}
					Size={new UDim2(1, px(-30), 1, px(-60))}
					Position={new UDim2(0, px(15), 0, px(45))}
					ClipsDescendants={true}
				>
					<uilistlayout
						Padding={new UDim(0, px(11))}
						FillDirection={Enum.FillDirection.Vertical}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					{data?.recentActivity.map((info, index) => (
						<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(20))} LayoutOrder={index}>
							<imagelabel
								Size={new UDim2(0, px(20), 0, px(20))}
								Image={info.image}
								ImageColor3={palette.darkerText}
								BackgroundTransparency={1}
							/>
							<TextLabel
								typeface="Sans"
								weight="Regular"
								native={{
									RichText: true,
									Text: info.text,
									TextColor3: palette.darkerText,
									TextSize: px(16),
									Position: new UDim2(0, px(27), 0, 0),
									Size: new UDim2(1, px(-27), 1, 0),
									TextXAlignment: Enum.TextXAlignment.Left,
								}}
							/>
						</frame>
					))}
				</frame>
			</frame>
			{children}
		</frame>
	);
});
