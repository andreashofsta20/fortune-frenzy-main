import React, { memo, useEffect, useMemo, useRef, useCallback, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { addCommasToNumber } from "shared/util/number-utils";
import { brighten } from "client/utils/color-utils";
import { CaseBattleData } from "typings/APIResponses";
import { useMotion } from "client/hooks/use-motion";
import { usePxScale } from "client/hooks/use-scale";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Button } from "../core/Button";
import { Players, TweenService, Workspace } from "@rbxts/services";
import { Functions } from "client/network";
import { isLoadingAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";

interface BattlePlayerProps {
	battleData: CaseBattleData;
	playerPosition: number;
	viewingPlayerItems: number;
	setViewingPlayerItems: (playerItems: number) => void;
}

const BOT_THUMBNAIL_USER_IDS = ["1", "156", "1787431079", "3566000179", "5518226836"];

function pickDeterministicBotThumbnailUserId(seed: string, offset = 0): string {
	const digitsOnly = seed.gsub("%D", "")[0];
	const numericSeed = tonumber(digitsOnly.sub(1, 9));
	const normalizedSeed = numericSeed !== undefined ? math.abs(math.floor(numericSeed)) : seed.size();
	const index = (normalizedSeed + offset) % BOT_THUMBNAIL_USER_IDS.size();
	return BOT_THUMBNAIL_USER_IDS[index];
}

function resolveCaseBattleItemImage(item?: { image?: string; asset_id?: string }) {
	if (!item) return "";

	const image = tostring(item.image ?? "");
	if (image.size() > 0 && image.match("^rbx")[0] !== undefined) {
		return image;
	}

	const assetId = tostring(item.asset_id ?? "");
	const numericMatch = assetId.match("^(%d+)$")[0];
	if (numericMatch !== undefined) {
		return `rbxthumb://type=Asset&id=${numericMatch}&w=150&h=150`;
	}

	return "";
}

function getTeamFromPosition(teamMode: string, position: number): number {
	const teamSizes = teamMode.split("v").map((str) => tonumber(str) || 0);
	let total = 0;

	for (let i = 0; i < teamSizes.size(); i++) {
		total += teamSizes[i];
		if (position <= total) {
			return i + 1;
		}
	}

	return 0;
}

function getDisplayedBattleValue(
	battleData: CaseBattleData,
	playerPull: CaseBattleData["player_pulls"][string] | undefined,
	currentCaseIndex: number,
) {
	const total = playerPull?.total_value ?? 0;
	if (battleData.status !== "in_progress") return total;

	const currentItemValue = playerPull?.items.find((pull) => pull.case_index === currentCaseIndex)?.value ?? 0;
	return math.max(total - currentItemValue, 0);
}

function resolveAvatarThumbnailUserId(
	playerData: CaseBattleData["players"][number] | undefined,
	defaultUserId: string,
	battleId: string,
): string {
	if (!playerData) return "";

	if (playerData.bot) {
		const positionOffset = math.max(playerData.position - 1, 0);
		return pickDeterministicBotThumbnailUserId(`${battleId}:${playerData.id}`, positionOffset);
	}

	const directUserId = tonumber(playerData.id);
	if (directUserId !== undefined && directUserId > 0) {
		return tostring(math.floor(directUserId));
	}

	return defaultUserId;
}

export const BattlePlayer = memo(
	({ battleData, playerPosition, viewingPlayerItems, setViewingPlayerItems }: BattlePlayerProps) => {
		const clientStateController = Modding.resolveSingleton(ClientStateController);
		const px = usePx();
		const pxScale = usePxScale();
		const playerData = battleData.players.find((p) => p.position === playerPosition);
		const containerRef = useRef<Frame>(undefined);
		const hasMountedRef = useRef(false);
		const [containerFramePosition, containerFramePositionMotion] = useMotion(new UDim2(0, 0, 0, 0));
		const [overlayTransparency, overlayTransparencyMotion] = useMotion(1);

		const currentCaseIndex = battleData.current_spin_data.current_case_index;
		const currentCaseData = clientStateController.CaseBattleCases.find(
			(c) => c.id === battleData.cases[currentCaseIndex],
		);
		const initialTotalValue = (() => {
			const playerPulls = battleData.player_pulls;
			const playerPull = playerPulls ? playerPulls[playerData?.id ?? ""] : undefined;
			return getDisplayedBattleValue(battleData, playerPull, currentCaseIndex);
		})();

		const [displayedValue, setDisplayedValue] = useState(initialTotalValue);
		const [valueScale, valueScaleMotion] = useMotion(1);

		const onAvatarActivated = useCallback(() => {
			setViewingPlayerItems(playerPosition);
		}, [playerPosition, setViewingPlayerItems]);

		const onJoinBattle = useCallback(async () => {
			isLoadingAtom(true);
			const result = await requestServer(
				Functions.CaseBattles.JoinBattle,
				"Failed to join battle",
				battleData.id,
				playerPosition,
			);
			if (result === -1) return isLoadingAtom(false);
			if (result.code !== 200) {
				clientStateController.NotificationEvent.Fire(
					`<font color="#${palette.lossRed.ToHex()}">${result.message ?? (battleData.players[0].id === tostring(Players.LocalPlayer.UserId) ? "Failed to call bot" : "Failed to join battle")}; Code ${result.code}</font>`,
					"rbxassetid://134904801170653",
				);
			}
			isLoadingAtom(false);
		}, [battleData.id, playerPosition]);

		const { totalValue, teamColour, currentSpin, playerExists, avatarTransparency } = useMemo(() => {
			const playerPulls = battleData.player_pulls;
			const playerPull = playerPulls ? playerPulls[playerData?.id ?? ""] : undefined;
			const playerExists = battleData.players.find((p) => p.position === playerPosition) !== undefined;

			const winnerIds = new Set((battleData.winners_info ?? []).map((winner) => winner.player_id));
			const isWinner = playerData ? winnerIds.has(playerData.id) : false;

			return {
				totalValue: getDisplayedBattleValue(battleData, playerPull, currentCaseIndex),
				teamColour:
					palette.casebattle_teams[
						getTeamFromPosition(battleData.team_mode, playerPosition) as 1 | 2 | 3 | 4
					],
				currentSpin: {
					currentPull: playerPull?.items.find((p) => p.case_index === currentCaseIndex),
					currentCaseData,
				},
				playerExists,
				avatarTransparency: battleData.status === "completed" && playerExists && !isWinner ? 0.55 : 0,
			};
		}, [battleData, playerPosition]);

		const cards = useMemo(() => {
			if (!currentCaseData) return [];
			return table.create(150, 0).map((_, index) => {
				const item = currentCaseData.items[index % currentCaseData.items.size()];
				const image = resolveCaseBattleItemImage(item);
				return (
					<imagelabel
						key={`item-card-${index}#${item?.id}`}
						BackgroundTransparency={1}
						Size={new UDim2(0, px(65), 0, px(65))}
						Image={image}
						LayoutOrder={index}
					/>
				);
			});
		}, [currentCaseData]);

		useEffect(() => {
			if (displayedValue === totalValue) return;

			const numberValue = new Instance("IntValue");
			numberValue.Value = displayedValue;
			const diff = totalValue - displayedValue;
			const tween = TweenService.Create(
				numberValue,
				new TweenInfo(0.7, Enum.EasingStyle.Quart, Enum.EasingDirection.Out),
				{ Value: totalValue },
			);

			valueScaleMotion.tween(diff > 0 ? 1.1 : 0.95, {
				time: 0.5,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.Out,
			});

			const connection = numberValue.Changed.Connect(() => {
				setDisplayedValue(numberValue.Value);
			});

			tween.Play();

			task.delay(1.5, () => {
				valueScaleMotion.tween(1, {
					time: 0.5,
					style: Enum.EasingStyle.Exponential,
					direction: Enum.EasingDirection.Out,
				});
			});

			return () => {
				connection.Disconnect();
				tween.Pause();
				tween.Destroy();
				numberValue.Destroy();
			};
		}, [totalValue]);

		useEffect(() => {
			const container = containerRef.current;
			const currentPull = currentSpin.currentPull;
			if (!container || !currentPull || !currentCaseData) return;

			const findWinningItem = () => {
				const caseItems = currentCaseData.items;
				if (caseItems.size() === 0) return undefined;

				const matchingLayoutOrders = new Array<number>();
				for (let i = 0; i < 150; i++) {
					const mappedItem = caseItems[i % caseItems.size()];
					if ((mappedItem?.id ?? "") === currentPull.id && i > 15) {
						matchingLayoutOrders.push(i);
					}
				}

				if (matchingLayoutOrders.size() === 0) return undefined;
				const selectedOrder = matchingLayoutOrders[math.random(1, matchingLayoutOrders.size()) - 1];

				return (container.GetChildren() as Instance[])
					.filter((child): child is ImageLabel => child.IsA("ImageLabel"))
					.find((child) => child.LayoutOrder === selectedOrder);
			};

			const winningItem = findWinningItem();
			if (!winningItem) return;

			const calcOffset = () => {
				const winningItemCenter = winningItem.AbsolutePosition.X + winningItem.AbsoluteSize.X / 2;
				const containerCenter = container.AbsolutePosition.X + container.AbsoluteSize.X / 2;
				return (containerCenter - winningItemCenter) / pxScale();
			};

			const universalTime = Workspace.GetServerTimeNow() * 1000;
			const calculatedDuration = ((battleData.next_step_at ?? 0) - universalTime) / 1000 - 0.6;
			const totalDuration = math.max(calculatedDuration, 1.25);
			let cancelled = false;

			const spin = () => {
				if (cancelled) return;
				containerFramePositionMotion.immediate(new UDim2(0, 0, 0, 0));

				overlayTransparencyMotion.tween(1, {
					time: 0.3,
					style: Enum.EasingStyle.Exponential,
					direction: Enum.EasingDirection.InOut,
				});

				if (cancelled) return;

				containerFramePositionMotion.tween(new UDim2(0, calcOffset(), 0, 0), {
					time: totalDuration,
					style: Enum.EasingStyle.Exponential,
					direction: Enum.EasingDirection.InOut,
				});

				task.delay(totalDuration + 0.5, () => {
					if (cancelled) return;

					overlayTransparencyMotion.tween(0, {
						time: 0.3,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.InOut,
					});

					task.delay(0.3, () => {
						if (cancelled) return;
						containerFramePositionMotion.immediate(new UDim2(0, 0, 0, 0));
					});
				});
			};

			task.spawn(spin);

			return () => {
				cancelled = true;
			};
		}, [
			currentSpin.currentPull?.id,
			currentCaseIndex,
			currentCaseData?.id,
			battleData.next_step_at,
			playerData?.id,
		]);

		const avatarThumbnailUserId = useMemo(
			() => resolveAvatarThumbnailUserId(playerData, tostring(Players.LocalPlayer.UserId), battleData.id),
			[playerData?.id, playerData?.bot, playerData?.position, battleData.id],
		);

		return (
			<frame BackgroundTransparency={1} Size={new UDim2(0, px(130), 1, 0)}>
				<imagebutton
					BackgroundTransparency={1}
					Image={"rbxassetid://108897559176490"}
					ImageColor3={teamColour}
					AnchorPoint={new Vector2(0.5, 0)}
					Position={new UDim2(0.5, 0, 0, 0)}
					Size={new UDim2(0, px(96), 0, px(96))}
					Event={{
						Activated: onAvatarActivated,
					}}
				>
					<imagelabel
						BackgroundTransparency={1}
						AnchorPoint={new Vector2(0.5, 0.5)}
						Position={new UDim2(0.5, 0, 0.5, 0)}
						Size={new UDim2(0, px(65), 0, px(65))}
						Image={
							playerData ? `rbxthumb://type=AvatarHeadShot&id=${avatarThumbnailUserId}&w=150&h=150` : ""
						}
						ImageTransparency={playerData ? avatarTransparency : 1}
					>
						<Corner roundness="full" />
						<uistroke Color={teamColour} Thickness={1} Enabled={viewingPlayerItems === playerPosition} />
					</imagelabel>
				</imagebutton>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: playerData?.username ?? "Waiting",
						TextSize: px(20),
						Size: new UDim2(1, 0, 0, px(20)),
						AnchorPoint: new Vector2(0.5, 0),
						Position: new UDim2(0.5, 0, 0, px(90)),
						TextTruncate: Enum.TextTruncate.SplitWord,
					}}
				>
					<uigradient
						Color={
							new ColorSequence([
								new ColorSequenceKeypoint(0, brighten(teamColour, 0.5)),
								new ColorSequenceKeypoint(1, Color3.fromRGB(255, 255, 255)),
							])
						}
						Rotation={-90}
					/>
				</TextLabel>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `$${addCommasToNumber(displayedValue)}`,
						TextSize: px(17),
						Size: new UDim2(1, 0, 0, px(17)),
						AnchorPoint: new Vector2(0.5, 0),
						Position: new UDim2(0.5, 0, 0, px(110)),
						TextTruncate: Enum.TextTruncate.SplitWord,
					}}
				>
					<uiscale Scale={valueScale} />
					<uigradient
						Color={
							new ColorSequence([
								new ColorSequenceKeypoint(0, Color3.fromRGB(68, 255, 51)),
								new ColorSequenceKeypoint(1, Color3.fromRGB(255, 255, 255)),
							])
						}
						Rotation={-90}
					/>
				</TextLabel>
				{playerData?.bot === true && (
					<TextLabel
						typeface="Sans"
						weight="Bold"
						native={{
							Text: `Bot`,
							TextSize: px(15),
							Size: new UDim2(1, 0, 0, px(15)),
							AnchorPoint: new Vector2(0.5, 0),
							Position: new UDim2(0.5, 0, 0, -px(5)),
							TextColor3: teamColour,
						}}
					/>
				)}
				<frame
					BackgroundColor3={palette.background4}
					AnchorPoint={new Vector2(0.5, 0)}
					Position={new UDim2(0.5, 0, 0, px(134))}
					Size={new UDim2(0, px(100), 0, px(2))}
					BorderSizePixel={0}
				>
					<uigradient
						Transparency={
							new NumberSequence([
								new NumberSequenceKeypoint(0, 1),
								new NumberSequenceKeypoint(0.25, 0),
								new NumberSequenceKeypoint(0.5, 0),
								new NumberSequenceKeypoint(0.75, 0),
								new NumberSequenceKeypoint(1, 1),
							])
						}
					/>
				</frame>
				<frame
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 1, -px(65))}
					Size={new UDim2(1, 0, 0, px(80))}
					ClipsDescendants={true}
				>
					{playerExists ? (
						<>
							<frame
								AnchorPoint={new Vector2(0, 1)}
								BackgroundColor3={palette.background1}
								BorderSizePixel={0}
								Position={UDim2.fromScale(0, 1)}
								Size={UDim2.fromScale(0.5, 1)}
								ZIndex={2}
							>
								<uigradient
									Transparency={
										new NumberSequence([
											new NumberSequenceKeypoint(0, 0),
											new NumberSequenceKeypoint(1, 1),
										])
									}
								/>
							</frame>
							<frame
								AnchorPoint={new Vector2(1, 1)}
								BackgroundColor3={palette.background1}
								BorderSizePixel={0}
								Position={UDim2.fromScale(1, 1)}
								Size={UDim2.fromScale(0.5, 1)}
								ZIndex={2}
							>
								<uigradient
									Transparency={
										new NumberSequence([
											new NumberSequenceKeypoint(0, 0),
											new NumberSequenceKeypoint(1, 1),
										])
									}
									Rotation={180}
								/>
							</frame>
							<frame
								Size={new UDim2(1, 0, 1, 0)}
								Position={containerFramePosition}
								BackgroundTransparency={1}
								ref={containerRef}
							>
								<uilistlayout
									Padding={new UDim(0, -px(2))}
									FillDirection={Enum.FillDirection.Horizontal}
									HorizontalAlignment={Enum.HorizontalAlignment.Left}
									SortOrder={Enum.SortOrder.LayoutOrder}
									VerticalAlignment={Enum.VerticalAlignment.Center}
								/>
								{cards}
							</frame>
							<frame
								Size={new UDim2(1, 0, 1, 0)}
								Position={new UDim2(0, 0, 0, 0)}
								BackgroundColor3={palette.background1}
								BackgroundTransparency={overlayTransparency}
							/>
						</>
					) : (
						<Button
							size={new UDim2(0, px(120), 0, px(32))}
							position={new UDim2(0.5, 0, 0.5, 0)}
							anchorPoint={new Vector2(0.5, 0.5)}
							text={
								battleData.players[0]?.id === tostring(Players.LocalPlayer.UserId) ? "Call Bot" : "Join"
							}
							typeface="Sans"
							weight="SemiBold"
							backgroundColor={palette.background3}
							textColor={palette.primaryText}
							event={{
								Activated: onJoinBattle,
							}}
						/>
					)}
				</frame>
			</frame>
		);
	},
);
