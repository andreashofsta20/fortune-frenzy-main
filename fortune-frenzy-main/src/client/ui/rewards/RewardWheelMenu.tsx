import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { MenuCore } from "../navigation/MenuCore";
import { usePx } from "client/hooks/use-px";
import { TextLabel } from "../core/TextLabel";
import { palette } from "client/utils/palette";
import { usePxScale } from "client/hooks/use-scale";
import { Button } from "../core/Button";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { formatWithSuffix } from "shared/util/number-utils";
import { timeUntil } from "shared/util/string-utils";
import { getConfig } from "shared/util/get-config";
import { CollectionService, Workspace, TweenService, Players, RunService, MarketplaceService } from "@rbxts/services";
import { handleCloseButton } from "client/utils/menu-utils";
import { isLoadingAtom, isNavigationVisibleAtom } from "client/utils/global-state";
import { useMotion } from "client/hooks/use-motion";
import { requestServer } from "client/utils/send-function";
import { Functions, Events } from "client/network";
import { rewardThemes } from "./DailyRewardMenu";

interface WheelButtonProps {
	theme: "green" | "blue";
	size: UDim2;
	position: UDim2;
	text: string;
	weight: "Bold" | "Medium" | "Regular" | "SemiBold" | "ExtraBold";
	textSize: number;
	children?: React.ReactNode;
	anchorPoint?: Vector2;
	enabled?: boolean;
	activated?: () => void;
}

const buttonThemes = {
	green: {
		gradient: [Color3.fromRGB(58, 170, 67), Color3.fromRGB(87, 255, 100), Color3.fromRGB(58, 170, 67)] as const,
		overlay: [Color3.fromRGB(15, 44, 17), Color3.fromRGB(21, 63, 25), Color3.fromRGB(15, 44, 17)] as const,
	},
	blue: {
		gradient: [Color3.fromRGB(57, 117, 170), Color3.fromRGB(124, 192, 255), Color3.fromRGB(57, 117, 170)] as const,
		overlay: [Color3.fromRGB(16, 33, 44), Color3.fromRGB(21, 43, 63), Color3.fromRGB(16, 33, 44)] as const,
	},
};

const WheelButton = (props: WheelButtonProps) => {
	const { theme, children, anchorPoint = new Vector2(0.5, 1), enabled = true, activated } = props;
	const { gradient, overlay } = buttonThemes[theme];

	const gradientSequence = new ColorSequence([
		new ColorSequenceKeypoint(0, gradient[0]),
		new ColorSequenceKeypoint(0.5, gradient[1]),
		new ColorSequenceKeypoint(1, gradient[2]),
	]);

	const overlaySequence = new ColorSequence([
		new ColorSequenceKeypoint(0, overlay[0]),
		new ColorSequenceKeypoint(0.5, overlay[1]),
		new ColorSequenceKeypoint(1, overlay[2]),
	]);

	return (
		<Button
			size={props.size}
			position={props.position}
			anchorPoint={anchorPoint}
			text={props.text}
			weight={props.weight}
			textSize={props.textSize}
			backgroundColor={palette.white}
			textColor={palette.white}
			labelChildren={<uigradient Color={gradientSequence} Rotation={-70} />}
			enabled={enabled}
			event={{
				Activated: activated,
			}}
		>
			<uistroke Color={palette.white}>
				<uigradient Color={gradientSequence} Rotation={-70} />
			</uistroke>
			<uigradient Color={overlaySequence} Rotation={-70} />
			{children}
		</Button>
	);
};

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

export const RewardWheelMenu = ({ visible, flashMenu }: Props) => {
	const px = usePx();
	const pxScale = usePxScale();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const originalCFrameRef = useRef<CFrame | undefined>(undefined);
	const [corePosition, corePositionMotion] = useMotion<UDim2>(new UDim2(0.5, 0, 1, 0));
	const [noticeTransparency, noticeTransparencyMotion] = useMotion<number>(0);
	const [spinning, setSpinning] = useState(false);

	const [rewardWheelSpins, setRewardWheelSpins] = useState(clientStateController.RewardWheelSpins);
	useEffect(() => {
		const connection = Events.RewardWheelSpinsUpdated.connect((spins) => {
			setRewardWheelSpins(spins);
		});
		return () => connection.Disconnect();
	}, []);

	useEffect(() => {
		if (!visible || spinning) return;

		let connection: RBXScriptConnection | undefined;
		const delayThread = task.delay(0.5, () => {
			connection = RunService.Heartbeat.Connect(() => {
				const player = Players.LocalPlayer;
				const character = player.Character;
				const humanoid = character?.FindFirstChild("Humanoid") as Humanoid;

				if (humanoid && humanoid.MoveDirection.Magnitude > 0) {
					handleCloseButton();
					isNavigationVisibleAtom(true);
				}
			});
		});

		return () => {
			task.cancel(delayThread);
			if (connection) {
				connection.Disconnect();
			}
		};
	}, [visible, spinning]);

	useEffect(() => {
		const camera = Workspace.CurrentCamera;
		const taggedWheel = CollectionService.GetTagged("DailyWheel")[0];
		const dailyWheel = taggedWheel && taggedWheel.IsA("Model") ? taggedWheel : undefined;
		const cameraAttachment = dailyWheel?.PrimaryPart?.FindFirstChild("Camera") as Attachment | undefined;
		const player = Players.LocalPlayer;

		if (!camera || !cameraAttachment) return;
		const tweenInfo = new TweenInfo(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out);

		if (visible) {
			if (originalCFrameRef.current === undefined) originalCFrameRef.current = camera.CFrame;
			camera.CameraType = Enum.CameraType.Scriptable;
			const targetCFrame = cameraAttachment.WorldCFrame;
			const tween = TweenService.Create(camera, tweenInfo, { CFrame: targetCFrame });
			tween.Play();
			return () => tween.Cancel();
		} else {
			if (originalCFrameRef.current && player.Character && player.Character.PrimaryPart) {
				const characterPosition = player.Character.PrimaryPart.Position;
				const characterCFrame = new CFrame(characterPosition.add(new Vector3(0, 5, 10)), characterPosition);
				const tween = TweenService.Create(camera, tweenInfo, { CFrame: characterCFrame });
				tween.Play();

				tween.Completed.Connect((playbackState) => {
					if (playbackState === Enum.PlaybackState.Completed) {
						camera.CameraType = Enum.CameraType.Custom;
						originalCFrameRef.current = undefined;
					}
				});

				return () => tween.Cancel();
			}
		}
	}, [visible]);

	useEffect(() => {
		if (spinning) {
			noticeTransparencyMotion.tween(1, {
				time: 0.5,
				style: Enum.EasingStyle.Quint,
				direction: Enum.EasingDirection.Out,
			});
			corePositionMotion.tween(new UDim2(0.5, 0, 2, 0), {
				time: 0.5,
				style: Enum.EasingStyle.Quint,
				direction: Enum.EasingDirection.In,
			});
		} else {
			noticeTransparencyMotion.tween(0, {
				time: 0.5,
				style: Enum.EasingStyle.Quint,
				direction: Enum.EasingDirection.Out,
			});
			corePositionMotion.tween(new UDim2(0.5, 0, 1, 0), {
				time: 0.5,
				style: Enum.EasingStyle.Quint,
				direction: Enum.EasingDirection.Out,
			});
		}
	}, [spinning]);

	const spinProductIds = useMemo(() => {
		const ids: string[] = [];
		clientStateController.RobuxProducts.DeveloperProducts.forEach((category, productId) => {
			if (category === "RewardWheelSpins") ids.push(productId);
		});

		const info = ids.map((id) => {
			return clientStateController.ProductInfo.get(id);
		});

		return info as ProductInfo[];
	}, [clientStateController.RobuxProducts.DeveloperProducts, clientStateController.ProductInfo]);

	const firstSpinProduct = spinProductIds[0];
	const secondSpinProduct = spinProductIds[1];
	const firstSpinCountLabel = firstSpinProduct?.Name?.match("%d+")?.[0] ?? "3";
	const secondSpinCountLabel = secondSpinProduct?.Name?.match("%d+")?.[0] ?? "10";

	return (
		<MenuCore scale={false}>
			<frame
				Size={new UDim2(1, 0, 1, 0)}
				Position={corePosition}
				AnchorPoint={new Vector2(0.5, 1)}
				BackgroundTransparency={1}
				Visible={visible}
			>
				<uiscale Scale={pxScale()} />
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text:
							"You get 1 free spin in " +
							timeUntil(DateTime.fromUnixTimestamp(rewardWheelSpins.nextFreeAt).ToIsoDate()) +
							"!",
						TextSize: px(20),
						TextColor3: palette.white,
						Size: new UDim2(1, -px(20), 0, px(20)),
						AnchorPoint: new Vector2(0.5, 1),
						Position: new UDim2(0.5, 0, 1, -px(100)),
						TextXAlignment: Enum.TextXAlignment.Center,
					}}
				>
					<uistroke Thickness={px(1.5)} Color={palette.black} />
				</TextLabel>
				<WheelButton
					theme="green"
					size={new UDim2(0, px(185), 0, px(55))}
					position={new UDim2(0.5, 0, 1, -px(130))}
					text="Spin"
					weight="Bold"
					textSize={px(30)}
					enabled={!spinning && rewardWheelSpins.spins > 0}
					activated={async () => {
						if (spinning) return;
						isLoadingAtom(true);
						setSpinning(true);

						const spinData = await requestServer(
							Functions.Commerce.SpinRewardWheel,
							"Failed to spin reward wheel",
						);
						isLoadingAtom(false);

						if (spinData === -1) return setSpinning(false);
						if (spinData.status === "error")
							return clientStateController.NotificationEvent.Fire(
								`<font color="#${palette.lossRed.ToHex()}">${spinData.message ?? "Failed to spin reward wheel"}</font>`,
							);

						const [rewardId, rewardType, rewardValue] = spinData.reward_data?.split(":") ?? [];
						warn(spinData, rewardId, rewardType, rewardValue);
						clientStateController.SpinRewardWheelEvent.Fire(rewardId);

						task.spawn(async () => {
							const newRewardWheelSpins = await requestServer(Functions.Commerce.GetRewardWheelSpins);
							if (newRewardWheelSpins === -1) return;
							clientStateController.RewardWheelSpins = newRewardWheelSpins;
							setRewardWheelSpins(newRewardWheelSpins);
						});

						task.delay(6, () => {
							let notificationText = "";
							if (rewardType === "gems") {
								notificationText = `You received <font color="#${rewardThemes.Gems.BackgroundColor3.ToHex()}">${rewardValue} Gems</font>!`;
							} else if (rewardType === "cash") {
								const cash = tonumber(rewardValue) ?? 0;
								notificationText = `You received <font color="#${rewardThemes.Cash.BackgroundColor3.ToHex()}">$${formatWithSuffix(cash, 2)}</font>!`;
							} else if (rewardType === "item") {
								const itemInfo = clientStateController.ItemInfo.get(rewardValue);
								const itemName = itemInfo ? itemInfo.name : "an item";
								notificationText = `You won a <font color="${itemInfo?.color}">${itemName}</font>, worth <font color="#${palette.profitGreen.ToHex()}">${formatWithSuffix(itemInfo?.value ?? 0, 2)}</font> value!`;
							} else if (rewardType === "mystery") {
								const itemInfo = clientStateController.ItemInfo.get(rewardValue);
								const itemName = itemInfo ? itemInfo.name : "an item";
								notificationText = `You won a <font color="${itemInfo?.color}">${itemName}</font>, worth <font color="#${palette.profitGreen.ToHex()}">${formatWithSuffix(itemInfo?.value ?? 0, 2)}</font> value!`;
							}

							clientStateController.NotificationEvent.Fire(notificationText);
							setSpinning(false);
						});
					}}
				>
					<TextLabel
						typeface="Sans"
						weight="Bold"
						native={{
							Text: rewardWheelSpins.spins === 0 ? "No Spins" : `${rewardWheelSpins.spins}x Spins`,
							TextSize: px(20),
							TextColor3: palette.white,
							Size: new UDim2(1, 0, 0, px(20)),
							AnchorPoint: new Vector2(0.5, 0.5),
							Position: new UDim2(0.5, 0, 0, 0),
							TextXAlignment: Enum.TextXAlignment.Center,
						}}
					>
						<uistroke Thickness={px(1.5)} Color={Color3.fromRGB(18, 53, 21)} />
					</TextLabel>
				</WheelButton>

				<WheelButton
					theme="blue"
					size={new UDim2(0, px(110), 0, px(40))}
					position={new UDim2(0.5, -px(170), 1, -px(138))}
					text={`\u{E002} <b>${firstSpinProduct?.PriceInRobux ?? 0}</b>`}
					weight="Medium"
					textSize={px(24)}
					enabled={firstSpinProduct !== undefined}
					activated={() => {
						if (!firstSpinProduct?.ProductId) return;
						MarketplaceService.PromptProductPurchase(Players.LocalPlayer, firstSpinProduct.ProductId);
					}}
				>
					<TextLabel
						typeface="Sans"
						weight="Bold"
						native={{
							Text: `+${firstSpinCountLabel} Spins`,
							TextSize: px(20),
							TextColor3: palette.white,
							Size: new UDim2(0, px(120), 0, px(20)),
							AnchorPoint: new Vector2(0.5, 0.5),
							Rotation: -px(10),
							Position: new UDim2(0, -px(10), 0, 0),
							TextXAlignment: Enum.TextXAlignment.Center,
						}}
					>
						<uistroke Thickness={px(1.5)} Color={Color3.fromRGB(17, 31, 53)} />
					</TextLabel>
				</WheelButton>

				<WheelButton
					theme="blue"
					size={new UDim2(0, px(110), 0, px(40))}
					position={new UDim2(0.5, px(170), 1, -px(138))}
					text={`\u{E002} <b>${secondSpinProduct?.PriceInRobux ?? 0}</b>`}
					weight="Medium"
					textSize={px(24)}
					enabled={secondSpinProduct !== undefined}
					activated={() => {
						if (!secondSpinProduct?.ProductId) return;
						MarketplaceService.PromptProductPurchase(Players.LocalPlayer, secondSpinProduct.ProductId);
					}}
				>
					<TextLabel
						typeface="Sans"
						weight="Bold"
						native={{
							Text: `+${secondSpinCountLabel} Spins`,
							TextSize: px(20),
							TextColor3: palette.white,
							Size: new UDim2(0, px(120), 0, px(20)),
							AnchorPoint: new Vector2(0.5, 0.5),
							Rotation: px(10),
							Position: new UDim2(1, -px(10), 0, 0),
							TextXAlignment: Enum.TextXAlignment.Center,
						}}
					>
						<uistroke Thickness={px(1.5)} Color={Color3.fromRGB(17, 31, 53)} />
					</TextLabel>
				</WheelButton>
			</frame>
			<frame
				AnchorPoint={new Vector2(0, 1)}
				BackgroundColor3={Color3.fromRGB(25, 72, 28)}
				BackgroundTransparency={0.5}
				Position={new UDim2(0, 0, 1, 0)}
				Size={new UDim2(1, 0, 1, -px(200))}
				ZIndex={-1}
				Visible={visible}
			>
				<uigradient
					Rotation={-90}
					Transparency={
						new NumberSequence([new NumberSequenceKeypoint(0, 0), new NumberSequenceKeypoint(1, 1)])
					}
				/>
			</frame>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: "Note: Purchased spins expire after 12 hours if unused",
					TextSize: px(20),
					TextColor3: palette.lossRed,
					Size: new UDim2(1, -px(20), 0, px(23)),
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, px(10)),
					TextXAlignment: Enum.TextXAlignment.Right,
					TextTransparency: noticeTransparency,
					Visible: visible,
				}}
			>
				<uistroke Thickness={px(1.5)} Color={palette.black} Transparency={noticeTransparency} />
			</TextLabel>
		</MenuCore>
	);
};
