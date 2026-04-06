import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Case } from "typings/APIResponses";
import { TextLabel } from "../core/TextLabel";
import {
	ITEM_CASES_CASE_SPINNER_DESCRIPTION,
	ITEM_CASES_CASE_SPINNER_TITLE,
	ITEM_CASES_CLAIM_BUTTON,
	ITEM_CASES_OPEN_AGAIN_BUTTON,
} from "shared/util/strings";
import { formatItemName, replacePlaceholder } from "shared/util/string-utils";
import { ItemCard } from "./ItemCard";
import { Modding } from "@flamework/core";
import { Button } from "../core/Button";
import ShuffleCaseItems, { Entry } from "shared/util/shuffle-case-items";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { ClientStateController } from "client/controllers/ClientStateController";
import { setTimeout } from "@rbxts/set-timeout";
import openAgain from "./functions/openAgain";
import claim from "./functions/claim";
import { usePxScale } from "client/hooks/use-scale";
import { Corner } from "../tools/Corner";
import { activeMenuAtom, isNavigationVisibleAtom, overlayTransparencyAtom } from "client/utils/global-state";
import { SoundController } from "client/controllers/SoundController";
import { RunService, TweenService, Workspace } from "@rbxts/services";
import { peek } from "@rbxts/charm";
import { TUTORIAL_TARGET_IDS, advanceTutorialAction } from "client/tutorial/tutorial-state";

interface Props {
	visible: boolean;
	currentCase: Case | undefined;

	spinnerState: {
		status: "none" | "loading" | "spinning" | "done" | "ready";
		speed: number;
		winningItem?: string;
		isLucky?: boolean;
		winningIndex?: number;
	};
	setSpinnerState: React.Dispatch<
		React.SetStateAction<{
			status: "none" | "loading" | "spinning" | "done" | "ready";
			speed: number;
			winningItem?: string;
			isLucky?: boolean;
			winningIndex?: number;
		}>
	>;
}

export function SpinnerPage({ visible, currentCase, spinnerState, setSpinnerState }: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const soundController = Modding.resolveSingleton(SoundController);
	const [frameSize, frameSizeMotion] = useMotion(new UDim2(0, px(900), 0, px(200)));
	const [containerFramePosition, containerFramePositionMotion] = useMotion(new UDim2(0, 0, 0, 0));
	const [containerFade, containerFadeMotion] = useMotion(1);
	const containerRef = useRef<Frame>(undefined);
	const previousCaseRef = useRef<Case | undefined>(undefined);

	const [itemCards, setItemCards] = useState<JSX.Element[]>([]);
	const [itemCardsData, setItemCardsData] = useState<Entry[]>([]);
	const passedItemsRef = useRef(new Set<number>());
	const [strings, setStrings] = useState({
		spinPrimary: ITEM_CASES_CASE_SPINNER_TITLE,
		spinSecondary: ITEM_CASES_CASE_SPINNER_DESCRIPTION,
	});

	const ClaimButton = {
		text: ITEM_CASES_CLAIM_BUTTON,
		image: "rbxassetid://100521334566701",
		imageSize: 20,
		imagePadding: 5,
		textSize: 17,
		backgroundColor: palette.blue,
		textColor: palette.blueText,
		imageColor: palette.blueText,
		visible: true,
	};

	const OpenAgainButton = {
		text: ITEM_CASES_OPEN_AGAIN_BUTTON,
		image: "rbxassetid://113279164445329",
		imageSize: 20,
		imagePadding: 5,
		textSize: 17,
		backgroundColor: palette.background1,
		textColor: palette.blue,
		imageColor: palette.blue,
		visible: true,
	};

	const HiddenClaimButton = {
		...ClaimButton,
		visible: false,
	};

	const HiddenOpenAgainButton = {
		...OpenAgainButton,
		visible: false,
	};

	const [leftButtonData, setLeftButtonData] = useState({
		ui: HiddenClaimButton,
		action: "claim",
		enabled: false,
	});

	const [rightButtonData, setRightButtonData] = useState({
		ui: HiddenOpenAgainButton,
		action: "open_again",
		enabled: false,
	});

	useEffect(() => {
		if (peek(activeMenuAtom) !== "ItemCases") return;

		const handleSpinnerStatus = () => {
			switch (spinnerState.status) {
				case "done": {
					const currentCash = clientStateController.Cash;
					if (!currentCase || currentCash < currentCase.price) {
						setRightButtonData({
							ui: {
								...ClaimButton,
								visible: true,
							},
							action: "claim",
							enabled: true,
						});
						setLeftButtonData({
							ui: {
								...OpenAgainButton,
								visible: false,
							},
							action: "open_again",
							enabled: false,
						});
					} else {
						setRightButtonData({
							ui: OpenAgainButton,
							action: "open_again",
							enabled: true,
						});
						setLeftButtonData({
							ui: ClaimButton,
							action: "claim",
							enabled: true,
						});
					}

					frameSizeMotion.tween(new UDim2(0, px(900), 0, px(253)), {
						time: 0.3,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.Out,
					});
					containerFadeMotion.tween(0.3, {
						time: 0.3,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.Out,
					});
					break;
				}
				case "loading": {
					setLeftButtonData({
						ui: HiddenClaimButton,
						action: "claim",
						enabled: false,
					});
					setRightButtonData({
						ui: HiddenOpenAgainButton,
						action: "open_again",
						enabled: false,
					});
					break;
				}
				case "ready": {
					setLeftButtonData({
						ui: HiddenClaimButton,
						action: "claim",
						enabled: false,
					});
					setRightButtonData({
						ui: HiddenOpenAgainButton,
						action: "open_again",
						enabled: false,
					});

					if (!currentCase) return;

					setSpinnerState((prevState) => ({
						...prevState,
						status: "spinning",
					}));
					setStrings({
						spinPrimary: replacePlaceholder(
							ITEM_CASES_CASE_SPINNER_TITLE,
							"{{item}}",
							formatItemName(clientStateController.ItemInfo.get(spinnerState.winningItem!)!.name),
						),
						spinSecondary: ITEM_CASES_CASE_SPINNER_DESCRIPTION,
					});

					break;
				}
				case "spinning": {
					setLeftButtonData({
						ui: HiddenClaimButton,
						action: "claim",
						enabled: false,
					});
					setRightButtonData({
						ui: HiddenOpenAgainButton,
						action: "open_again",
						enabled: false,
					});

					const possibleItems = itemCardsData
						.map((entry, index) => ({ index, entry }))
						.filter(({ entry }) => entry.id === spinnerState.winningItem)
						.filter(({ index }) => index > 15);

					if (possibleItems.size() > 0) {
						const winningItem = possibleItems[math.random(possibleItems.size()) - 1];
						const winningItemCard = containerRef.current?.FindFirstChild(
							`item-card-${winningItem.index}`,
						) as Frame;

						if (winningItemCard) {
							const winningItemCenter =
								winningItemCard.AbsolutePosition.X + winningItemCard.AbsoluteSize.X / 2;
							const containerCenter =
								containerRef.current!.AbsolutePosition.X + containerRef.current!.AbsoluteSize.X / 2;
							let offset = containerCenter - winningItemCenter;
							const camera = Workspace.CurrentCamera;
							offset = offset / pxScale();

							containerFramePositionMotion.tween(
								new UDim2(0, containerRef.current!.Position.X.Offset + offset, 0, 0),
								{
									time: spinnerState.speed,
									style: Enum.EasingStyle.Exponential,
									direction: Enum.EasingDirection.InOut,
								},
							);

							if (camera && spinnerState.isLucky && spinnerState.speed > 0.5) {
								TweenService.Create(
									camera,
									new TweenInfo(
										spinnerState.speed,
										Enum.EasingStyle.Exponential,
										Enum.EasingDirection.InOut,
									),
									{
										FieldOfView: 90,
									},
								).Play();
							}

							setTimeout(() => {
								if (camera && spinnerState.isLucky && spinnerState.speed > 0.5) {
									TweenService.Create(
										camera,
										new TweenInfo(0.4, Enum.EasingStyle.Exponential, Enum.EasingDirection.InOut),
										{
											FieldOfView: 65,
										},
									).Play();
									task.delay(0.4, () => {
										TweenService.Create(
											camera,
											new TweenInfo(0.6, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
											{
												FieldOfView: 70,
											},
										).Play();
									});
								}

								soundController.PlaySound(
									spinnerState.isLucky
										? "rbxassetid://92021952384085"
										: "rbxassetid://94863538893140",
									"sfx",
									math.random(1, 1000000) === 1 ? 10 : 2,
								);
							}, spinnerState.speed - 0.1);

							setTimeout(() => {
								setSpinnerState((prevState) => ({
									...prevState,
									status: "done",
									winningIndex: winningItem.index,
								}));
							}, spinnerState.speed + 0.1);
						}
					}
					break;
				}
				case "none": {
					setLeftButtonData({
						ui: HiddenClaimButton,
						action: "claim",
						enabled: false,
					});
					setRightButtonData({
						ui: HiddenOpenAgainButton,
						action: "open_again",
						enabled: false,
					});
					break;
				}
				default:
					break;
			}
		};

		handleSpinnerStatus();

		if (spinnerState.status !== "none") {
			overlayTransparencyAtom(0.5);
		} else {
			overlayTransparencyAtom(1);
		}

		isNavigationVisibleAtom(!visible);
	}, [spinnerState, itemCardsData]);

	useEffect(() => {
		if (!currentCase) return;
		if (previousCaseRef.current?.id !== currentCase.id) {
			const itemArray = ShuffleCaseItems(currentCase.items, 100);
			setItemCardsData(itemArray);
		}

		previousCaseRef.current = currentCase;
	}, [currentCase]);

	useEffect(() => {
		if (!itemCardsData.size()) return;

		setItemCards(
			itemCardsData.map((item, index) => (
				<ItemCard
					data={{
						item: clientStateController.ItemInfo.get(item.id)!,
						chance: item.chance,
						claimed: item.claimed,
					}}
					layoutOrder={index}
					strokeThickness={0}
					key={`item-card-${index}`}
					showClaimed={false}
					isLucky={
						spinnerState.status === "done" && spinnerState.isLucky && index === spinnerState.winningIndex
					}
				/>
			)),
		);
	}, [itemCardsData, spinnerState.status, spinnerState.isLucky, spinnerState.winningIndex]);

	useEffect(() => {
		let heartbeatConnection: RBXScriptConnection | undefined;

		if (spinnerState.status === "spinning" && containerRef.current && spinnerState.speed > 0.5) {
			const itemWidth = px(172);
			const containerWidth = containerRef.current.AbsoluteSize.X;
			const centerX = containerWidth / 2;
			passedItemsRef.current.clear();

			heartbeatConnection = RunService.Heartbeat.Connect(() => {
				if (!containerRef.current) return;
				const currentPosition = -containerRef.current.Position.X.Offset;
				const itemAtCenter = math.floor((currentPosition + centerX) / itemWidth);
				const detectionWindow = math.clamp(spinnerState.speed * 2, 1, 3);

				for (let i = itemAtCenter - detectionWindow; i <= itemAtCenter + detectionWindow; i++) {
					if (i < 0 || i >= itemCardsData.size() || passedItemsRef.current.has(i)) continue;

					const itemCard = containerRef.current.FindFirstChild(`item-card-${i}`) as Frame;
					if (!itemCard) continue;
					const itemPosition = i * itemWidth;
					const distanceFromCenter = math.abs(currentPosition + centerX - itemPosition);

					if (distanceFromCenter < itemWidth / 4) {
						passedItemsRef.current.add(i);
						soundController.PlaySound("rbxassetid://72535281745898", "sfx", 0.3);
					}
				}
			});
		} else {
			passedItemsRef.current.clear();
		}

		return () => {
			if (heartbeatConnection) {
				heartbeatConnection.Disconnect();
			}
		};
	}, [spinnerState.status, spinnerState.speed]);

	return (
		<frame
			BackgroundColor3={palette.background1}
			AnchorPoint={new Vector2(0.5, 0.5)}
			Position={new UDim2(0.5, 0, 0.5, 0)}
			Size={frameSize}
			Visible={visible}
			ClipsDescendants={true}
		>
			<Corner roundness="small" />
			<frame
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, px(15))}
				Size={new UDim2(1, px(-30), 0, px(172))}
				ClipsDescendants={true}
			>
				<frame
					BackgroundTransparency={1}
					Size={new UDim2(1, 0, 1, 0)}
					Position={containerFramePosition}
					ref={containerRef}
				>
					<uilistlayout
						Padding={new UDim(0, px(10))}
						FillDirection={Enum.FillDirection.Horizontal}
						SortOrder={Enum.SortOrder.LayoutOrder}
						VerticalAlignment={Enum.VerticalAlignment.Center}
					/>
					{itemCards}
				</frame>
				<frame
					BackgroundColor3={palette.background1}
					BackgroundTransparency={containerFade}
					Size={new UDim2(0, px(373), 1, 0)}
					Position={new UDim2(0, 0, 0, 0)}
					BorderSizePixel={0}
				/>
				<frame
					BackgroundColor3={palette.background1}
					BackgroundTransparency={containerFade}
					Size={new UDim2(0, px(373), 1, 0)}
					Position={new UDim2(1, 0, 0, 0)}
					AnchorPoint={new Vector2(1, 0)}
					BorderSizePixel={0}
				/>
			</frame>

			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Position: new UDim2(0, px(20), 0, px(202)),
					Size: new UDim2(0, px(455), 0, px(18)),
					TextColor3: palette.primaryText,
					TextSize: px(18),
					Text: strings.spinPrimary,
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Position: new UDim2(0, px(20), 0, px(223)),
					Size: new UDim2(0, px(455), 0, px(15)),
					TextColor3: palette.midText,
					TextSize: px(15),
					Text: strings.spinSecondary,
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<Button
				size={new UDim2(0, px(190), 0, px(35))}
				position={new UDim2(0, px(500), 0, px(205))}
				typeface="Sans"
				weight="Bold"
				text={leftButtonData.ui.text}
				image={leftButtonData.ui.image}
				imageSize={leftButtonData.ui.imageSize}
				imagePadding={leftButtonData.ui.imagePadding}
				textSize={leftButtonData.ui.textSize}
				backgroundColor={leftButtonData.ui.backgroundColor}
				textColor={leftButtonData.ui.textColor}
				imageColor={leftButtonData.ui.imageColor}
				visible={leftButtonData.ui.visible}
				tutorialActionId={leftButtonData.action === "claim" ? "claim_case" : undefined}
				tutorialTargetId={leftButtonData.action === "claim" ? TUTORIAL_TARGET_IDS.caseClaimButton : undefined}
				event={{
					Activated: () => {
						if (leftButtonData.enabled === false) return;
						setLeftButtonData({
							...leftButtonData,
							enabled: false,
						});

						if (leftButtonData.action === "open_again") {
							openAgain(
								containerFramePositionMotion,
								frameSizeMotion,
								containerFadeMotion,
								px,
								setSpinnerState,
								currentCase!,
							);
						} else {
							claim(
								containerFramePositionMotion,
								frameSizeMotion,
								containerFadeMotion,
								px,
								setSpinnerState,
							);
							advanceTutorialAction("claim_case");
						}
					},
				}}
			/>
			<Button
				size={new UDim2(0, px(190), 0, px(35))}
				position={new UDim2(0, px(700), 0, px(205))}
				typeface="Sans"
				weight="Bold"
				text={rightButtonData.ui.text}
				image={rightButtonData.ui.image}
				imageSize={rightButtonData.ui.imageSize}
				imagePadding={rightButtonData.ui.imagePadding}
				textSize={rightButtonData.ui.textSize}
				backgroundColor={rightButtonData.ui.backgroundColor}
				textColor={rightButtonData.ui.textColor}
				imageColor={rightButtonData.ui.imageColor}
				visible={rightButtonData.ui.visible}
				tutorialActionId={rightButtonData.action === "claim" ? "claim_case" : undefined}
				tutorialTargetId={rightButtonData.action === "claim" ? TUTORIAL_TARGET_IDS.caseClaimButton : undefined}
				event={{
					Activated: () => {
						if (rightButtonData.enabled === false) return;
						setRightButtonData({
							...rightButtonData,
							enabled: false,
						});

						if (rightButtonData.action === "open_again") {
							openAgain(
								containerFramePositionMotion,
								frameSizeMotion,
								containerFadeMotion,
								px,
								setSpinnerState,
								currentCase!,
							);
						} else {
							claim(
								containerFramePositionMotion,
								frameSizeMotion,
								containerFadeMotion,
								px,
								setSpinnerState,
							);
							advanceTutorialAction("claim_case");
						}
					},
				}}
			>
				<uistroke Color={palette.blue} Thickness={px(1)} />
			</Button>
		</frame>
	);
}
