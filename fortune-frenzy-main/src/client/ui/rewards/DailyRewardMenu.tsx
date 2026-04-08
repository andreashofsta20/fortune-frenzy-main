import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { MenuCore } from "../navigation/MenuCore";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { CloseButton } from "../core/CloseButton";
import { handleCloseButton } from "client/utils/menu-utils";
import { TextLabel } from "../core/TextLabel";
import { Button } from "../core/Button";
import { formatDuration, formatWithSuffix } from "shared/util/number-utils";
import { Workspace } from "@rbxts/services";
import Object from "@rbxts/object-utils";
import { useMotion } from "client/hooks/use-motion";
import { requestServer } from "client/utils/send-function";
import { Functions } from "client/network";
import { isNavigationVisibleAtom } from "client/utils/global-state";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

export const rewardThemes = {
	Gems: {
		BackgroundColor3: Color3.fromRGB(111, 197, 255),
		Image: "rbxassetid://95990296841662",
		UpperTextColor3: Color3.fromRGB(150, 219, 255),
		Gradient: new ColorSequence([
			new ColorSequenceKeypoint(0, Color3.fromRGB(136, 136, 136)),
			new ColorSequenceKeypoint(1, Color3.fromRGB(70, 70, 70)),
		]),
		GradientRotation: 90,
		StringFunc: (reward: string) => {
			return reward;
		},
	},
	Cash: {
		BackgroundColor3: Color3.fromRGB(73, 232, 94),
		Image: "rbxassetid://86337070472077",
		UpperTextColor3: Color3.fromRGB(120, 223, 144),
		Gradient: new ColorSequence([
			new ColorSequenceKeypoint(0, Color3.fromRGB(136, 136, 136)),
			new ColorSequenceKeypoint(1, Color3.fromRGB(70, 70, 70)),
		]),
		GradientRotation: 90,
		StringFunc: (reward: string) => {
			return `$${formatWithSuffix(tonumber(reward) ?? 0, 2)}`;
		},
	},
	Item: {
		BackgroundColor3: Color3.fromRGB(152, 152, 152),
		Image: "rbxassetid://105713183192433",
		UpperTextColor3: Color3.fromRGB(248, 248, 248),
		Gradient: new ColorSequence([
			new ColorSequenceKeypoint(0, Color3.fromRGB(238, 56, 0)),
			new ColorSequenceKeypoint(0.25, Color3.fromRGB(255, 231, 128)),
			new ColorSequenceKeypoint(0.5, Color3.fromRGB(132, 255, 129)),
			new ColorSequenceKeypoint(0.75, Color3.fromRGB(0, 255, 255)),
			new ColorSequenceKeypoint(1, Color3.fromRGB(0, 60, 255)),
		]),
		GradientRotation: 130,
		StringFunc: (reward: string) => {
			return "????";
		},
	},
};
function RewardItem({
	reward,
	layoutOrder,
	currentDay,
}: {
	reward: {
		claimed_at: number;
		reward: string;
		reward_data: string;
		day: number;
	};
	layoutOrder: number;
	currentDay: number;
}) {
	const px = usePx();
	const theme = rewardThemes[reward.reward as keyof typeof rewardThemes];
	const [transparency, transparencyMotion] = useMotion(1);
	const [scale, scaleMotion] = useMotion(0.95);
	const [fadeTransparency, fadeTransparencyMotion] = useMotion(1);

	useEffect(() => {
		const mod = layoutOrder % 10;
		task.delay(0.1 * (mod === 0 ? 10 : mod), () => {
			transparencyMotion.tween(0, {
				time: 0.5,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
			scaleMotion.tween(1, {
				time: 0.5,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
		});
	}, []);

	useEffect(() => {
		fadeTransparencyMotion.tween(currentDay === reward.day ? 1 : currentDay > reward.day ? 0.3 : 0.5, {
			time: 0.5,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
	}, [currentDay]);

	return (
		<canvasgroup BackgroundTransparency={1} GroupTransparency={transparency} LayoutOrder={layoutOrder} ZIndex={5}>
			<uiscale Scale={scale} />
			<frame BackgroundColor3={theme.BackgroundColor3} Size={new UDim2(1, 0, 1, 0)}>
				<Corner roundness="small" />
				<uigradient Color={theme.Gradient} Rotation={theme.GradientRotation} />
				<frame
					BackgroundColor3={palette.background1}
					Size={new UDim2(1, 0, 1, 0)}
					BackgroundTransparency={fadeTransparency}
					ZIndex={5}
				>
					<Corner roundness="small" />
				</frame>
				<imagelabel
					BackgroundTransparency={1}
					Image={"rbxassetid://109244495523377"}
					ImageColor3={palette.black}
					Size={new UDim2(1, 0, 1, 0)}
					ImageTransparency={0.3}
				/>
				<imagelabel
					BackgroundTransparency={1}
					Image={theme.Image}
					Size={new UDim2(0, px(75), 0, px(75))}
					Position={new UDim2(0.5, 0, 1, -px(23))}
					AnchorPoint={new Vector2(0.5, 1)}
				>
					<uigradient
						Rotation={90}
						Transparency={
							new NumberSequence([
								new NumberSequenceKeypoint(0, 0),
								new NumberSequenceKeypoint(0.45, 0.15),
								new NumberSequenceKeypoint(1, 1),
							])
						}
					/>
				</imagelabel>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						Position: new UDim2(0.5, 0, 0, px(10)),
						Size: new UDim2(1, 0, 0, px(17)),
						AnchorPoint: new Vector2(0.5, 0),
						Text: reward.claimed_at > 0 ? "Claimed" : `Day ${reward.day}`,
						TextColor3: theme.UpperTextColor3,
						TextSize: px(17),
					}}
				/>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						Position: new UDim2(0.5, 0, 1, -px(18)),
						Size: new UDim2(1, 0, 0, px(25)),
						AnchorPoint: new Vector2(0.5, 1),
						Text: theme.StringFunc(reward.reward_data),
						TextColor3: palette.primaryText,
						TextSize: px(25),
					}}
				/>
			</frame>
		</canvasgroup>
	);
}

function DailyRewardPopUpComponent({ visible, flashMenu }: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const [dailyRewardInfo, setDailyRewardInfo] = useState(clientStateController.DailyRewardInfo);

	useEffect(() => {
		const connection = clientStateController.DailyRewardChangedEvent.Connect(() => {
			setDailyRewardInfo({ ...clientStateController.DailyRewardInfo });
		});
		return () => connection.Disconnect();
	}, [clientStateController]);

	const { nextRewardText, currentDay, available, rewards } = useMemo(() => {
		function getNextRewardText() {
			const available = dailyRewardInfo.available;
			const nextAvailableAt = dailyRewardInfo.nextAvailableAt;
			if (available) return "Your reward is ready to claim!";
			if (nextAvailableAt === -1) return "Calculating time…";
			const now = Workspace.GetServerTimeNow();
			const remainingSeconds = math.max(nextAvailableAt - now, 0);
			return `Your next reward is available in ${formatDuration(remainingSeconds)}`;
		}

		function getCurrentDay() {
			const rewards = dailyRewardInfo.rewards;
			let currentDay = 0;
			for (const [day, reward] of pairs(rewards)) {
				const dayNum = tonumber(day) ?? 0;
				if (reward.claimed_at > 0 && dayNum > currentDay) currentDay = dayNum;
			}
			return currentDay + 1;
		}

		return {
			nextRewardText: getNextRewardText(),
			currentDay: getCurrentDay(),
			available: dailyRewardInfo.available,
			rewards: dailyRewardInfo.rewards,
		};
	}, [dailyRewardInfo]);

	return (
		<MenuCore>
			<frame
				BackgroundColor3={palette.background1}
				Size={new UDim2(0, px(700), 0, px(405))}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				Visible={visible}
			>
				<Corner roundness="small" />
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: "Daily Rewards",
						TextSize: px(28),
						Size: new UDim2(0, px(320), 0, px(28)),
						Position: new UDim2(0, px(24), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<CloseButton
					showUpscaleButton={false}
					native={{
						Position: new UDim2(1, -px(24), 0, px(21)),
						Size: new UDim2(0, px(28), 0, px(28)),
						AnchorPoint: new Vector2(1, 0),
						Visible: true,
						ZIndex: 20,
					}}
					event={{
						Activated: () => {
							handleCloseButton();
							isNavigationVisibleAtom(true);
						},
					}}
				/>
				<TextLabel
					weight="SemiBold"
					typeface="Sans"
					native={{
						Text: nextRewardText,
						TextSize: px(20),
						Size: new UDim2(0, px(515), 0, px(20)),
						Position: new UDim2(0, px(24), 0, px(55)),
						RichText: true,
						TextColor3: palette.midText,
						TextXAlignment: Enum.TextXAlignment.Left,
						TextYAlignment: Enum.TextYAlignment.Top,
					}}
				/>
				<Button
					text={available ? `Claim Day ${currentDay}` : "No rewards available"}
					size={new UDim2(1, -px(48), 0, px(32))}
					position={new UDim2(1, -px(24), 1, -px(20))}
					anchorPoint={new Vector2(1, 1)}
					backgroundColor={palette.blue}
					textColor={palette.blueText}
					enabled={available}
					weight="SemiBold"
					event={{
						Activated: async () => {
							const rewardEntry = rewards[tostring(currentDay)] as
								| { reward: string; reward_data: string }
								| undefined;
							let notificationText = "";
							if (rewardEntry) {
								if (rewardEntry.reward === "Gems") {
									notificationText = `You received <font color="#${rewardThemes.Gems.BackgroundColor3.ToHex()}">${rewardEntry.reward_data} Gems</font>!`;
								} else if (rewardEntry.reward === "Cash") {
									const cash = tonumber(rewardEntry.reward_data) ?? 0;
									notificationText = `You received <font color="#${rewardThemes.Cash.BackgroundColor3.ToHex()}">$${formatWithSuffix(cash, 2)}</font>!`;
								} else if (rewardEntry.reward === "Item") {
									const itemInfo = clientStateController.ItemInfo.get(rewardEntry.reward_data);
									const itemName = itemInfo ? itemInfo.name : "an item";
									notificationText = `You unlocked a <font color="${itemInfo?.color}">${itemName}</font>, worth <font color="#${palette.profitGreen.ToHex()}">${formatWithSuffix(itemInfo?.value ?? 0, 2)}</font> value!`;
								}
							}
							const result = await requestServer(
								Functions.Commerce.ClaimDailyReward,
								"Failed to claim daily reward",
							);
							if (result === -1) return;
							clientStateController.DailyRewardInfo = {
								...result,
								nextAvailableAt: result.nextAvailableAt ?? -1,
							};
							clientStateController.DailyRewardChangedEvent.Fire(clientStateController.DailyRewardInfo);
							if (notificationText !== "") clientStateController.NotificationEvent.Fire(notificationText);
						},
					}}
				/>
				<frame
					BackgroundTransparency={1}
					Position={new UDim2(0, px(24), 0, px(85))}
					Size={new UDim2(1, -px(48), 0, px(254))}
				>
					<uigridlayout
						CellPadding={new UDim2(0, px(10), 0, px(10))}
						CellSize={new UDim2(0, px(122), 0, px(122))}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					{(
						Object.entries(
							rewards as Record<string, { claimed_at: number; reward: string; reward_data: string }>,
						) as Array<[string, { claimed_at: number; reward: string; reward_data: string }]>
					).map(([day, reward]) => (
						<RewardItem
							key={day}
							reward={{ ...reward, day: tonumber(day) ?? 0 }}
							layoutOrder={tonumber(day) ?? 0}
							currentDay={currentDay}
						/>
					))}
				</frame>
			</frame>
		</MenuCore>
	);
}

export const DailyRewardPopUp = React.memo(DailyRewardPopUpComponent);
