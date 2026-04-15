import React, { useEffect, useMemo } from "@rbxts/react";
import { ScaleFunction, usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import {
	COINFLIP_CANCEL_SUBTITLE,
	COINFLIP_CANCEL_TITLE,
	COINFLIP_AFFORDABLE_JOIN_TITLE,
	COINFLIP_AFFORDABLE_JOIN_SUBTITLE,
	COINFLIP_UNAFFORDABLE_JOIN_SUBTITLE,
	COINFLIP_UNAFFORDABLE_JOIN_TITLE,
	COINFLIP_VIEWING_STATUSES,
	COINS,
	COINFLIP_VIEWING_TITLE,
	COINFLIP_VIEWING_ENDED,
	COINFLIP_VIEWING_COUNT,
} from "shared/util/strings";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { Button } from "../core/Button";
import { Corner } from "../tools/Corner";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Coinflip } from "typings/APIResponses";
import { SectionStroke } from "../tools/SectionStroke";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { brighten, setValue } from "client/utils/color-utils";
import { setInterval } from "@rbxts/set-timeout";
import { UserHeadshot } from "./CoinflipGridItem";
import { addCommasToNumber, formatWithSuffix, setDecimalPlaces } from "shared/util/number-utils";
import { MarketplaceService, Players, RunService } from "@rbxts/services";
import { Functions } from "client/network";
import { ViewportWithCamera } from "../tools/ViewportWithCamera";
import findItemsInRange from "client/utils/find-items-in-range";
import { replacePlaceholder } from "shared/util/string-utils";
import { coinflipStateAtom, isLoadingAtom } from "client/utils/global-state";
import { peek } from "@rbxts/charm";
import { requestServer } from "client/utils/send-function";
import { LoadingCircle } from "../core/LoadingCircle";
import { getCoinflipJoinValueRange } from "shared/util/coinflip-join-range";
import { resolveStakeItemId } from "client/utils/trade-stake-token";
import { VIP_SUBSCRIPTION_PRODUCT_ID } from "client/ui/exclusive_store/GamepassTile";
import { isVipActiveInSubscriptionMap } from "client/utils/is-vip-subscribed";
import {
	TUTORIAL_STEPS,
	TUTORIAL_TARGET_IDS,
	advanceTutorialAction,
	tutorialStateAtom,
} from "client/tutorial/tutorial-state";

interface Props extends React.PropsWithChildren {
	CoinflipId: string;
	visible: boolean;
	handleCloseButton: () => void;
}

enum JoinableState {
	Loading = 0,
	Joinable = 1,
	Unjoinable = 2,
}

const COINFLIP_VIEW_AUTO_CLOSE_DELAY_SECONDS = 10;

const UserSection = ({
	player,
	coin,
	userId,
	username,
	value,
	chance,
	exists,
}: {
	player: 1 | 2;
	coin: 1 | 2;
	userId: string;
	username: string;
	value: number;
	chance: number;
	exists: boolean;
}) => {
	const px = usePx();
	const position = player === 1 ? new UDim2(0, px(24), 0, px(105)) : new UDim2(1, px(-24), 0, px(105));
	const size = new UDim2(0, px(280), 0, px(110));
	const anchorPoint = player === 1 ? new Vector2(0, 0) : new Vector2(1, 0);
	const color = palette.coins[COINS[coin].name as "Heads" | "Tails"];

	return (
		<frame BackgroundTransparency={1} Size={size} Position={position} AnchorPoint={anchorPoint}>
			<UserHeadshot
				userId={userId}
				player={player}
				size={new UDim2(0, px(74), 0, px(74))}
				position={player === 1 ? new UDim2(0, px(15), 0.5, 0) : new UDim2(1, px(-15), 0.5, 0)}
				anchorPoint={player === 1 ? new Vector2(0, 0.5) : new Vector2(1, 0.5)}
				coin={coin}
			/>
			<imagelabel
				Image="rbxassetid://86092120336165"
				ImageColor3={setValue(color, 255)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(200), 0, px(200))}
				BackgroundTransparency={1}
				ZIndex={-1}
				ImageTransparency={0.25}
				Position={player === 1 ? new UDim2(0, px(15 + 74 / 2), 0.5, 0) : new UDim2(1, px(-15 - 74 / 2), 0.5, 0)}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: exists ? `@${username}` : "No one!",
					Position: new UDim2(player === 1 ? 1 : 0, 0, 0.5, exists ? px(-11) : 0),
					Size: new UDim2(1, px(-105), 0, px(24)),
					AnchorPoint: new Vector2(player === 1 ? 1 : 0, 0.5),
					TextColor3: palette.primaryText,
					TextXAlignment: player === 1 ? Enum.TextXAlignment.Left : Enum.TextXAlignment.Right,
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextSize: px(24),
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: `${formatWithSuffix(value, 2)} Value @ ${setDecimalPlaces(chance, 2)}%`,
					Position: new UDim2(player === 1 ? 1 : 0, 0, 0.5, px(11)),
					Size: new UDim2(1, px(-105), 0, px(16)),
					AnchorPoint: new Vector2(player === 1 ? 1 : 0, 0.5),
					TextColor3: palette.midText,
					TextXAlignment: player === 1 ? Enum.TextXAlignment.Left : Enum.TextXAlignment.Right,
					TextTruncate: Enum.TextTruncate.AtEnd,
					TextSize: px(16),
					Visible: exists,
				}}
			/>
		</frame>
	);
};

export const renderItem = (item: string, index: number, px: ScaleFunction, xOffset = 0, name?: string) => {
	const itemId = resolveStakeItemId(item);
	const itemData = Modding.resolveSingleton(ClientStateController).ItemInfo.get(itemId);

	return (
		<frame BackgroundColor3={palette.background2} Size={new UDim2(1, xOffset, 0, px(48))} LayoutOrder={index}>
			<Corner roundness="small" />
			<SectionStroke />
			<imagebutton
				Image={`rbxthumb://type=Asset&id=${itemData?.asset_id ?? "0"}&w=150&h=150`}
				ScaleType={Enum.ScaleType.Fit}
				AnchorPoint={new Vector2(0, 0.5)}
				BackgroundTransparency={1}
				Position={new UDim2(0, 10, 0.5, 0)}
				Size={new UDim2(0, 40, 0, 40)}
			/>
			<TextLabel
				weight="SemiBold"
				typeface="Sans"
				native={{
					Text: itemData?.name ?? itemId,
					TextColor3: palette.primaryText,
					TextSize: px(17),
					Position: new UDim2(0, px(55), 0.5, px(-8)),
					AnchorPoint: new Vector2(0, 0.5),
					Size: new UDim2(0, px(200), 0, px(17)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.SplitWord,
				}}
			/>
			<TextLabel
				weight="Regular"
				typeface="Sans"
				native={{
					Text: `${addCommasToNumber(itemData?.value ?? 0)} Value`,
					TextColor3: palette.darkerText,
					TextSize: px(15),
					Position: new UDim2(0, px(55), 0.5, px(8)),
					AnchorPoint: new Vector2(0, 0.5),
					Size: new UDim2(0, px(200), 0, px(15)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.AtEnd,
				}}
			/>
			<TextLabel
				weight="Regular"
				typeface="Sans"
				native={{
					Text: name ?? "",
					TextColor3: palette.darkerText,
					TextSize: px(15),
					Position: new UDim2(1, -px(15), 0.5, 0),
					AnchorPoint: new Vector2(1, 0.5),
					Size: new UDim2(1, px(-15), 0, px(15)),
					TextXAlignment: Enum.TextXAlignment.Right,
					TextTruncate: Enum.TextTruncate.AtEnd,
				}}
			/>
		</frame>
	);
};

const ItemListSection = ({
	player1Id,
	player,
	items,
	buttonActivated,
	ownerCallBotActivated,
	joinable,
}: {
	player1Id: string;
	items: string[];
	player: 1 | 2;
	buttonActivated?: () => void;
	ownerCallBotActivated?: () => void;
	joinable: 0 | 1 | 2;
}) => {
	const px = usePx();
	const shouldShowNoItemsFallback = player === 2 && items.size() === 0;
	const isOwner = Players.LocalPlayer.UserId === tonumber(player1Id);
	const joinableTitle = ["", COINFLIP_AFFORDABLE_JOIN_TITLE, COINFLIP_UNAFFORDABLE_JOIN_TITLE][joinable] || "Error";
	const joinableSubtitle =
		["", COINFLIP_AFFORDABLE_JOIN_SUBTITLE, COINFLIP_UNAFFORDABLE_JOIN_SUBTITLE][joinable] || "Error";

	let noItemsFallback = undefined;

	if (shouldShowNoItemsFallback) {
		noItemsFallback = (
			<>
				<frame
					BackgroundColor3={palette.background2}
					Size={new UDim2(1, 0, 0, px(48))}
					LayoutOrder={1}
					Visible={joinable !== 0}
				>
					<Corner roundness="small" />
					<SectionStroke />
					<TextLabel
						weight="SemiBold"
						typeface="Sans"
						native={{
							Text: isOwner ? COINFLIP_CANCEL_TITLE : joinableTitle,
							TextColor3: palette.primaryText,
							TextSize: px(17),
							Position: new UDim2(0.5, 0, 0.5, px(-8)),
							AnchorPoint: new Vector2(0.5, 0.5),
							Size: new UDim2(0, px(250), 0, px(17)),
							TextXAlignment: Enum.TextXAlignment.Right,
							TextTruncate: Enum.TextTruncate.SplitWord,
						}}
					/>
					<TextLabel
						weight="Regular"
						typeface="Sans"
						native={{
							Text: isOwner ? COINFLIP_CANCEL_SUBTITLE : joinableSubtitle,
							TextColor3: palette.darkerText,
							TextSize: px(15),
							Position: new UDim2(0.5, 0, 0.5, px(8)),
							AnchorPoint: new Vector2(0.5, 0.5),
							Size: new UDim2(0, px(250), 0, px(15)),
							TextXAlignment: Enum.TextXAlignment.Right,
							TextTruncate: Enum.TextTruncate.AtEnd,
						}}
					/>
				</frame>

				{isOwner ? (
					<>
						<frame BackgroundColor3={palette.background2} Size={new UDim2(1, 0, 0, px(48))} LayoutOrder={2}>
							<Corner roundness="small" />
							<SectionStroke />
							<Button
								text="Call Bot"
								size={new UDim2(0, px(270), 0, px(38))}
								position={new UDim2(0.5, 0, 0.5, 0)}
								anchorPoint={new Vector2(0.5, 0.5)}
								backgroundColor={palette.blue}
								textColor={palette.blueText}
								weight="SemiBold"
								typeface="Sans"
								textSize={18}
								tutorialActionId="coinflip_call_bot_success"
								tutorialTargetId={TUTORIAL_TARGET_IDS.coinflipCallBotButton}
								event={{
									Activated: ownerCallBotActivated,
								}}
							/>
						</frame>
						<frame BackgroundColor3={palette.background2} Size={new UDim2(1, 0, 0, px(48))} LayoutOrder={3}>
							<Corner roundness="small" />
							<SectionStroke />
							<Button
								text="Cancel Coinflip"
								size={new UDim2(0, px(270), 0, px(38))}
								position={new UDim2(0.5, 0, 0.5, 0)}
								anchorPoint={new Vector2(0.5, 0.5)}
								backgroundColor={palette.red}
								textColor={palette.redText}
								weight="SemiBold"
								typeface="Sans"
								textSize={18}
								event={{
									Activated: buttonActivated,
								}}
							/>
						</frame>
					</>
				) : (
					<frame
						BackgroundColor3={palette.background2}
						Size={new UDim2(1, 0, 0, px(48))}
						LayoutOrder={2}
						Visible={joinable === 1 || joinable === 0}
					>
						<Corner roundness="small" />
						<SectionStroke />
						{joinable === 0 ? (
							<LoadingCircle
								Size={new UDim2(0, px(28), 0, px(28))}
								Position={new UDim2(0.5, 0, 0.5, 0)}
								AnchorPoint={new Vector2(0.5, 0.5)}
							/>
						) : (
							<Button
								text="Join Coinflip"
								size={new UDim2(0, px(270), 0, px(38))}
								position={new UDim2(0.5, 0, 0.5, 0)}
								anchorPoint={new Vector2(0.5, 0.5)}
								backgroundColor={palette.blue}
								textColor={palette.blueText}
								weight="SemiBold"
								typeface="Sans"
								textSize={18}
								event={{
									Activated: buttonActivated,
								}}
							/>
						)}
					</frame>
				)}
			</>
		);
	}

	return (
		<frame
			BackgroundTransparency={1}
			Size={new UDim2(0, px(280), 0, px(225))}
			AnchorPoint={new Vector2(player === 1 ? 0 : 1, 1)}
			Position={new UDim2(player === 1 ? 0 : 1, player === 1 ? px(24) : px(-24), 1, px(-24))}
		>
			{items.size() > 0 ? (
				<scrollingframe
					BackgroundTransparency={1}
					BorderSizePixel={0}
					Size={new UDim2(1, 0, 1, 0)}
					CanvasSize={new UDim2(0, 0, 0, 0)}
					AutomaticCanvasSize={Enum.AutomaticSize.Y}
					ScrollingDirection={Enum.ScrollingDirection.Y}
					ScrollBarThickness={px(6)}
					ScrollBarImageColor3={palette.background4}
				>
					<uilistlayout Padding={new UDim(0, px(10))} SortOrder={Enum.SortOrder.LayoutOrder} />
					{items.map((item, index) => {
						return renderItem(item, index, px, -px(8));
					})}
				</scrollingframe>
			) : (
				<>
					<uilistlayout Padding={new UDim(0, px(10))} SortOrder={Enum.SortOrder.LayoutOrder} />
					{noItemsFallback}
				</>
			)}
		</frame>
	);
};

const CoinPart = () => {
	return (
		<part
			Shape={Enum.PartType.Block}
			EnableFluidForces={false}
			Size={new Vector3(0.01, 4.5, 4.5)}
			Transparency={1}
			Orientation={new Vector3(90, 0, 0)}
		>
			<decal Texture={"rbxassetid://129214013019384"} Face={Enum.NormalId.Right} key={"Heads"} />
			<decal Texture={"rbxassetid://105746173215670"} Face={Enum.NormalId.Left} key={"Tails"} />
		</part>
	);
};

export function CoinflipViewing({ CoinflipId, visible, handleCloseButton, children }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [coinflipData, setCoinflipData] = React.useState<Coinflip | undefined>(undefined);
	const [statusIndicatorColor, statusIndicatorColorMotion] = useMotion(Color3.fromRGB(75, 255, 135));
	const [statusIndicatorStatus, setStatusIndicatorStatus] = React.useState<"light" | "dark">("light");
	const [coinSpinTarget, setCoinSpinTarget] = React.useState<"heads" | "tails" | "none">("none");
	const [joinable, setJoinable] = React.useState<JoinableState>(JoinableState.Loading);
	const [coinCameraCFrame, setCoinCameraCFrame] = React.useState<CFrame>(CFrame.lookAt(Vector3.zero, Vector3.zero));
	const [coinCameraFOV, setCoinCameraFOV] = React.useState(75);
	const [viewportFrameSize, viewportFrameSizeMotion] = useMotion(new UDim2(0, px(270), 0, px(270)));
	const [viewportFramePosition, viewportFramePositionMotion] = useMotion(new UDim2(0.5, 0, 1, px(-90)));
	const [viewportTransparency, viewportTransparencyMotion] = useMotion(1);
	const [coinGlowTransparency, coinGlowTransparencyMotion] = useMotion(1);
	const [coinGlowColor, coinGlowColorMotion] = useMotion(Color3.fromRGB(25, 26, 35));
	const [confirmTextTransparency, confirmTextTransparencyMotion] = useMotion(1);

	// Consolidate initialization and cleanup
	useEffect(() => {
		if (!visible) return;
		setJoinable(JoinableState.Loading);

		const clearInterval = setInterval(
			() => setStatusIndicatorStatus((prev) => (prev === "light" ? "dark" : "light")),
			0.5,
		);
		const connection = clientStateController.CoinflipChangedEvent.Connect(() => {
			const data = clientStateController.Coinflips.find((coinflip) => coinflip.id === CoinflipId);
			setCoinflipData(data);
			if (!data) handleCloseButton();
		});

		const findItems = async (minValue: number, maxValue: number, minItems: number, maxItems: number) => {
			setJoinable(JoinableState.Loading);
			const matchedItems = await findItemsInRange(minValue, maxValue, minItems, maxItems);
			setJoinable(matchedItems.size() > 0 ? JoinableState.Joinable : JoinableState.Unjoinable);
		};

		const coinflipData = clientStateController.Coinflips.find((coinflip) => coinflip.id === CoinflipId);
		setCoinflipData(coinflipData);
		if (coinflipData) {
			const player1Value = coinflipData.player1_items.reduce((acc, item) => {
				const itemId = resolveStakeItemId(item);
				const itemData = clientStateController.ItemInfo.get(itemId);
				return itemData ? acc + itemData.value : acc;
			}, 0);
			const { minimumValue, maximumValue } = getCoinflipJoinValueRange(player1Value);
			findItems(minimumValue, maximumValue, 1, 10);
		} else {
			setJoinable(JoinableState.Unjoinable);
		}

		return () => {
			connection.Disconnect();
			clearInterval();
		};
	}, [CoinflipId, visible]);

	useEffect(() => {
		if (coinflipData?.status === "completed") {
			setCoinSpinTarget(coinflipData.winning_coin === 1 ? "heads" : "tails");
		} else {
			setCoinSpinTarget("none");
		}
	}, [coinflipData]);

	useEffect(() => {
		if (coinflipData?.player2 && peek(coinflipStateAtom) === "joining") {
			coinflipStateAtom("viewing");
		}
	}, [coinflipData]);

	useEffect(() => {
		if (!visible || !coinflipData) return;

		const isTerminalState = coinflipData.status === "completed" || coinflipData.status === "failed";
		if (!isTerminalState) return;

		const localUserId = tostring(Players.LocalPlayer.UserId);
		const localPlayerParticipated =
			coinflipData.player1.id === localUserId || coinflipData.player2?.id === localUserId;
		if (!localPlayerParticipated) return;

		const closeTask = task.delay(COINFLIP_VIEW_AUTO_CLOSE_DELAY_SECONDS, () => {
			handleCloseButton();
		});

		return () => {
			task.cancel(closeTask);
		};
	}, [
		visible,
		handleCloseButton,
		coinflipData?.id,
		coinflipData?.status,
		coinflipData?.player1.id,
		coinflipData?.player2?.id,
	]);

	// Coin spinning logic as a custom hook could be extracted, but kept inline for now
	useEffect(() => {
		if (!visible || coinSpinTarget === "none") {
			viewportTransparencyMotion.tween(1);
			viewportFramePositionMotion.tween(new UDim2(0.5, 0, 1, px(-90)));
			viewportFrameSizeMotion.tween(new UDim2(0, px(270), 0, px(270)));
			coinGlowTransparencyMotion.tween(1);
			coinGlowColorMotion.tween(Color3.fromRGB(25, 26, 35));
			confirmTextTransparencyMotion.tween(1);
			setCoinCameraFOV(75);
			return;
		}

		setCoinCameraCFrame(CFrame.lookAt(new Vector3(5, 0, 0), Vector3.zero));
		viewportTransparencyMotion.tween(0, {
			time: 0.7,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.Out,
		});

		const startTime = tick();
		const duration = 4;
		const fullSpins = 5;
		const finalAngle = coinSpinTarget === "heads" ? 0 : math.pi;

		task.delay(0.5, () => {
			viewportFramePositionMotion.tween(new UDim2(0.5, 0, 1, px(-200)), {
				time: 2.2,
				style: Enum.EasingStyle.Exponential,
			});
			task.delay(2.2, () => {
				viewportFramePositionMotion.tween(new UDim2(0.5, 0, 1, px(-150)), {
					time: 1,
					style: Enum.EasingStyle.Quart,
				});
				viewportFrameSizeMotion.tween(new UDim2(0, px(270), 0, px(250)), {
					time: 1,
					style: Enum.EasingStyle.Quart,
				});
			});
		});

		const connection = RunService.RenderStepped.Connect((dt) => {
			const t = math.min((tick() - startTime) / duration, 1);
			const easedT = t < 0.5 ? 8 * t * t * t * t : 1 - math.pow(-2 * t + 2, 4) / 2;
			const angle = 2 * math.pi * fullSpins * easedT + finalAngle * easedT;
			setCoinCameraCFrame(CFrame.lookAt(new Vector3(5 * math.cos(angle), 0, 5 * math.sin(angle)), Vector3.zero));
			setCoinCameraFOV(75 - 15 * (t < 0.5 ? 2 * t : 2 - 2 * t));

			if (t === 1) {
				const options = { time: 0.9, style: Enum.EasingStyle.Exponential, direction: Enum.EasingDirection.Out };
				viewportFramePositionMotion.tween(new UDim2(0.5, 0, 1, px(-150)), options);
				viewportFrameSizeMotion.tween(new UDim2(0, px(270), 0, px(250)), options);
				coinGlowTransparencyMotion.tween(0, options);
				coinGlowColorMotion.tween(palette.coins[coinSpinTarget === "heads" ? "Heads" : "Tails"], options);
				confirmTextTransparencyMotion.tween(0, options);
				connection.Disconnect();
			}
		});

		return () => connection.Disconnect();
	}, [coinSpinTarget, visible]);

	useEffect(() => {
		statusIndicatorColorMotion.tween(
			statusIndicatorStatus === "light"
				? Color3.fromRGB(75, 255, 135)
				: brighten(Color3.fromRGB(75, 255, 135), -0.4),
			{ time: 0.5, style: Enum.EasingStyle.Exponential },
		);
	}, [statusIndicatorStatus]);

	const userInformations = useMemo(() => {
		const calculateTotalValue = (items: string[]) =>
			items.reduce((acc, item) => {
				const itemId = resolveStakeItemId(item);
				const itemData = clientStateController.ItemInfo.get(itemId);
				return itemData ? acc + itemData.value : acc;
			}, 0);

		const player1_value = calculateTotalValue(coinflipData?.player1_items || []);
		const player2_value = calculateTotalValue(coinflipData?.player2_items || []);
		const total_value = player1_value + player2_value;
		return {
			player1: { value: player1_value, chance: total_value ? (player1_value / total_value) * 100 : 0 },
			player2: { value: player2_value, chance: total_value ? (player2_value / total_value) * 100 : 0 },
		};
	}, [coinflipData]);

	const handleJoinOrCancel = async () => {
		if (!coinflipData) return;
		isLoadingAtom(true);
		try {
			if (coinflipData.player1.id === tostring(Players.LocalPlayer.UserId)) {
				const result = await requestServer(
					Functions.Coinflip.CancelCoinflip,
					"Failed to cancel coinflip",
					CoinflipId,
				);
				if (result === -1) return;
				if (result.code === 200) {
					handleCloseButton();
				} else {
					clientStateController.NotificationEvent.Fire(
						`<font color="#${palette.lossRed.ToHex()}">${result.message ?? "Failed to cancel coinflip"}; Code ${result.code}</font>`,
						"rbxassetid://134904801170653",
					);
				}
			} else {
				coinflipStateAtom("joining");
			}
		} finally {
			isLoadingAtom(false);
		}
	};

	const handleCallBot = async () => {
		if (!coinflipData) return;
		if (coinflipData.player1.id !== tostring(Players.LocalPlayer.UserId)) return;
		const tut = peek(tutorialStateAtom);
		const onTutorialCallBotStep =
			tut.active && TUTORIAL_STEPS[tut.stepIndex]?.actionId === "coinflip_call_bot_success";

		if (!onTutorialCallBotStep && !isVipActiveInSubscriptionMap(clientStateController.SubscriptionData)) {
			isLoadingAtom(true);
			MarketplaceService.PromptSubscriptionPurchase(Players.LocalPlayer, VIP_SUBSCRIPTION_PRODUCT_ID);
			MarketplaceService.PromptSubscriptionPurchaseFinished.Once(() => isLoadingAtom(false));
			return;
		}
		isLoadingAtom(true);
		try {
			const result = await requestServer(Functions.Coinflip.CallBotCoinflip, "Failed to call bot", CoinflipId);
			if (result === -1) return;
			if (result.code !== 200) {
				clientStateController.NotificationEvent.Fire(
					`<font color="#${palette.lossRed.ToHex()}">${result.message ?? "Failed to call bot"}; Code ${result.code}</font>`,
					"rbxassetid://134904801170653",
				);
			} else if (onTutorialCallBotStep) {
				advanceTutorialAction("coinflip_call_bot_success");
			}
		} finally {
			isLoadingAtom(false);
		}
	};

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
					Text: coinflipData
						? replacePlaceholder(COINFLIP_VIEWING_TITLE, "{{name}}", coinflipData.player1.username)
						: "Error",
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
			<frame
				BackgroundColor3={palette.background2}
				BackgroundTransparency={0.65}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, px(60))}
				Size={new UDim2(1, px(-45), 0, px(35))}
			>
				<Corner roundness="small" />
				<SectionStroke />
				<imagelabel
					ImageColor3={palette.midText}
					ScaleType={Enum.ScaleType.Fit}
					AnchorPoint={new Vector2(0, 0.5)}
					BackgroundTransparency={1}
					Position={new UDim2(0, 13, 0.5, 0)}
					Rotation={180}
					Size={new UDim2(0, 18, 0, 18)}
					Image={"rbxassetid://114306723191635"}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: COINFLIP_VIEWING_STATUSES[coinflipData?.status || "waiting_for_player"],
						Position: new UDim2(1, 0, 0, 0),
						Size: new UDim2(1, -45, 1, 0),
						AnchorPoint: new Vector2(1, 0),
						TextSize: px(18),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<frame
					AnchorPoint={new Vector2(1, 0.5)}
					BackgroundColor3={statusIndicatorColor}
					Position={new UDim2(1, -10, 0.5, 0)}
					Size={new UDim2(0, 18, 0, 18)}
				>
					<Corner roundness="full" />
				</frame>
			</frame>
			<UserSection
				player={1}
				coin={coinflipData?.player1_coin || 1}
				userId={coinflipData?.player1.id || "1"}
				value={userInformations.player1.value}
				chance={userInformations.player1.chance}
				username={coinflipData?.player1.username || "Error"}
				exists={true}
			/>
			<UserSection
				player={2}
				coin={coinflipData?.player1_coin === 1 ? 2 : 1}
				userId={coinflipData?.player2?.id || "1"}
				value={userInformations.player2.value}
				chance={userInformations.player2.chance}
				username={coinflipData?.player2?.username || "Error"}
				exists={!!coinflipData?.player2}
			/>
			<ItemListSection
				player={1}
				items={coinflipData?.player1_items || []}
				player1Id={coinflipData?.player1.id || ""}
				joinable={joinable}
			/>
			<ItemListSection
				player={2}
				items={coinflipData?.player2_items || []}
				player1Id={coinflipData?.player1.id || ""}
				buttonActivated={handleJoinOrCancel}
				ownerCallBotActivated={handleCallBot}
				joinable={joinable}
			/>
			<ViewportWithCamera
				viewportProps={{
					Size: viewportFrameSize,
					Position: viewportFramePosition,
					AnchorPoint: new Vector2(0.5, 1),
					BackgroundTransparency: 1,
					Ambient: Color3.fromRGB(255, 255, 255),
					LightColor: Color3.fromRGB(255, 255, 255),
					ImageTransparency: viewportTransparency,
					Rotation: 90,
				}}
				cameraProps={{ CFrame: coinCameraCFrame, FieldOfView: coinCameraFOV }}
			>
				<CoinPart />
			</ViewportWithCamera>
			<imagelabel
				Image="rbxassetid://86092120336165"
				ImageColor3={coinGlowColor}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(500), 0, px(500))}
				BackgroundTransparency={1}
				ZIndex={-1}
				ImageTransparency={coinGlowTransparency}
				Position={new UDim2(0.5, 0, 0.5, px(-50))}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: COINFLIP_VIEWING_ENDED,
					TextSize: px(20),
					Size: new UDim2(0, px(230), 0, px(40)),
					Position: new UDim2(0.5, 0, 0.5, px(85)),
					AnchorPoint: new Vector2(0.5, 0.5),
					TextXAlignment: Enum.TextXAlignment.Center,
					TextColor3: palette.primaryText,
					TextTransparency: confirmTextTransparency,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="Regular"
				native={{
					Text: replacePlaceholder(
						COINFLIP_VIEWING_COUNT,
						"{{count}}",
						addCommasToNumber(coinflipData?.auto_id || 0),
					),
					TextSize: px(20),
					Size: new UDim2(0, px(230), 0, px(20)),
					Position: new UDim2(0.5, 0, 0.5, px(130)),
					AnchorPoint: new Vector2(0.5, 0.5),
					TextXAlignment: Enum.TextXAlignment.Center,
					TextColor3: palette.darkerText,
					TextTransparency: confirmTextTransparency,
				}}
			/>
			{children}
		</frame>
	);
}
