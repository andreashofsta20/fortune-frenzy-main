import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { palette } from "client/utils/palette";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { ReplicatedStorage, TweenService, Workspace } from "@rbxts/services";
import { getConfig } from "shared/util/get-config";
import { formatWithSuffix, setDecimalPlaces } from "shared/util/number-utils";
import { useMotion } from "client/hooks/use-motion";
import { SoundController } from "client/controllers/SoundController";

function WheelSlice({
	slice,
	color,
	chance,
	mainText,
	subText,
	image,
	gradient,
}: {
	slice: number;
	color: Color3;
	chance: string;
	mainText: string;
	subText: string;
	image: string;
	gradient: ColorSequence;
}) {
	return (
		<imagelabel
			Image={"rbxassetid://74787200242049"}
			Rotation={(slice - 1) * 60}
			BackgroundColor3={color}
			Size={new UDim2(1, 0, 1, 0)}
			BackgroundTransparency={1}
			ImageColor3={color}
		>
			<uigradient Color={gradient} Rotation={90} />
			<TextLabel
				weight="SemiBold"
				native={{
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, 17),
					Size: new UDim2(0, 200, 0, 20),
					TextSize: 20,
					TextColor3: palette.primaryText,
					Text: chance,
				}}
			/>
			<TextLabel
				weight="ExtraBold"
				native={{
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, 105),
					Size: new UDim2(0, 200, 0, 30),
					TextSize: 30,
					TextColor3: palette.primaryText,
					Text: mainText,
					ZIndex: 2,
				}}
			/>
			<TextLabel
				weight="Bold"
				native={{
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, 37),
					Size: new UDim2(0, 200, 0, 20),
					TextSize: 20,
					TextColor3: palette.primaryText,
					Text: subText,
				}}
			/>
			<imagelabel
				Image={image}
				AnchorPoint={new Vector2(0.5, 0)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0, 48)}
				Size={new UDim2(0, 80, 0, 80)}
				ZIndex={1}
			>
				<uigradient
					Rotation={90}
					Transparency={
						new NumberSequence([
							new NumberSequenceKeypoint(0, 0),
							new NumberSequenceKeypoint(0.85, 0.95),
							new NumberSequenceKeypoint(1, 1),
						])
					}
				/>
			</imagelabel>
		</imagelabel>
	);
}

export function DailyWheel({ adornee }: { adornee: BasePart }) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const soundController = Modding.resolveSingleton(SoundController);

	const [wheelData, setWheelData] = useState<{
		rewards: {
			type: "item" | "cash" | "gems" | "mystery";
			value: string;
			chance: number;
			id: string;
		}[];
		total_spins: number;
		last_rotation: number;
	}>();
	const [rotation, rotationMotion] = useMotion(0);

	useEffect(() => {
		setWheelData(getConfig("dailywheel"));
		const connection = ReplicatedStorage.GetAttributeChangedSignal("_config_dailywheel").Connect(() => {
			setWheelData(getConfig("dailywheel"));
		});

		return () => connection.Disconnect();
	}, []);

	const slices = useMemo(() => {
		return wheelData?.rewards.map((reward, sliceIndex) => {
			let color = Color3.fromRGB(255, 255, 255);
			let chance = "";
			let mainText = "";
			let subText = "";
			let image = "";
			let gradient = new ColorSequence([
				new ColorSequenceKeypoint(0, Color3.fromRGB(255, 255, 255)),
				new ColorSequenceKeypoint(0.9, Color3.fromRGB(0, 0, 0)),
				new ColorSequenceKeypoint(1, Color3.fromRGB(0, 0, 0)),
			]);

			if (reward.type === "cash") {
				color = Color3.fromRGB(51, 162, 66);
				chance = `${setDecimalPlaces(reward.chance, 2)}%`;
				mainText = `${formatWithSuffix(tonumber(reward.value) ?? 0)}`;
				image = "rbxassetid://86337070472077";
			} else if (reward.type === "gems") {
				color = Color3.fromRGB(75, 186, 255);
				chance = `${setDecimalPlaces(reward.chance, 2)}%`;
				mainText = `${reward.value}`;
				image = "rbxassetid://95990296841662";
			} else if (reward.type === "item") {
				const item = clientStateController.ItemInfo.get(reward.value);
				if (item) {
					color = Color3.fromHex(item.color);
					chance = `${setDecimalPlaces(reward.chance, 2)}%`;
					mainText = item.value === 0 ? "NEW" : `${formatWithSuffix(item.value)}`;
					subText = item.name;
					image = `rbxthumb://type=Asset&id=${item.asset_id}&w=150&h=150`;
				}
			} else if (reward.type === "mystery") {
				color = Color3.fromRGB(255, 255, 255);
				chance = `${setDecimalPlaces(reward.chance, 2)}%`;
				mainText = "????";
				image = "rbxassetid://105713183192433";
				gradient = new ColorSequence([
					new ColorSequenceKeypoint(0, Color3.fromRGB(238, 56, 0)),
					new ColorSequenceKeypoint(0.147, Color3.fromRGB(255, 231, 128)),
					new ColorSequenceKeypoint(0.277, Color3.fromRGB(132, 255, 129)),
					new ColorSequenceKeypoint(0.405, Color3.fromRGB(0, 170, 170)),
					new ColorSequenceKeypoint(0.581, Color3.fromRGB(0, 24, 104)),
					new ColorSequenceKeypoint(0.903, Color3.fromRGB(0, 0, 0)),
					new ColorSequenceKeypoint(1, Color3.fromRGB(0, 0, 0)),
				]);
			}

			return {
				slice: sliceIndex + 1,
				color,
				chance,
				mainText,
				subText,
				image,
				gradient,
				id: reward.id,
			};
		});
	}, [wheelData]);

	useEffect(() => {
		const connection = clientStateController.SpinRewardWheelEvent.Connect((rewardId) => {
			const slice = slices?.find((slice) => slice.id === rewardId);
			const camera = Workspace.CurrentCamera;
			if (slice) {
				const currentRotation = rotation.getValue();
				// Ensure we always end on the exact slice regardless of the current accumulated rotation
				const sliceAngle = (slice.slice - 1) * 60;
				const normalizedCurrent = ((currentRotation % 360) + 360) % 360; // 0 - 359
				const baseRotation = currentRotation - normalizedCurrent; // lower multiple of 360
				// We need the slice's absolute orientation (frame + sliceRotation) to end at 0°. Hence frame rotation must negate the slice's local rotation.
				const targetRotationExact = baseRotation + 360 * 3 - sliceAngle;

				// First tween with some random offset for visual flair
				const randomOffset = (math.random() - 0.5) * 40;
				rotationMotion.tween(targetRotationExact - randomOffset, {
					time: 4,
					style: Enum.EasingStyle.Cubic,
					direction: Enum.EasingDirection.InOut,
				});

				if (camera) {
					task.delay(0.7, () => {
						TweenService.Create(
							camera,
							new TweenInfo(4, Enum.EasingStyle.Quint, Enum.EasingDirection.InOut),
							{
								FieldOfView: 50,
							},
						).Play();
					});
				}

				task.wait(4.05);
				rotationMotion.tween(targetRotationExact, {
					time: 0.5,
					style: Enum.EasingStyle.Quint,
					direction: Enum.EasingDirection.Out,
				});
				task.wait(0.15);

				if (camera) {
					TweenService.Create(camera, new TweenInfo(0.6, Enum.EasingStyle.Back, Enum.EasingDirection.Out), {
						FieldOfView: 70,
					}).Play();
				}

				const VFX = adornee.Parent?.FindFirstChild("VFX") as Part;
				if (VFX) {
					soundController.PlaySound("rbxassetid://4612378086", "sfx");
					const vfxParts = VFX.GetDescendants().filter((child) => child.IsA("ParticleEmitter"));
					for (const vfxPart of vfxParts) {
						const delayTime = tonumber(vfxPart.GetAttribute("EmitDelay")) ?? 0;
						const emitCount = tonumber(vfxPart.GetAttribute("EmitCount")) ?? 10;
						task.delay(delayTime, () => {
							vfxPart.Emit(emitCount);
						});
					}
				}
			}
		});

		return () => connection.Disconnect();
	}, [slices]);

	return (
		<surfacegui
			LightInfluence={0.5}
			PixelsPerStud={50}
			SizingMode={Enum.SurfaceGuiSizingMode.PixelsPerStud}
			Adornee={adornee}
			ResetOnSpawn={false}
			Face={Enum.NormalId.Left}
		>
			<frame
				BackgroundColor3={Color3.fromRGB(33, 33, 33)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				Size={new UDim2(0, 500, 0, 500)}
				Rotation={rotation}
			>
				<Corner roundness="full" />
				<uiscale Scale={1.6} />
				<frame
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundColor3={Color3.fromRGB(33, 33, 33)}
					Position={UDim2.fromScale(0.5, 0.5)}
					Size={new UDim2(0, 73, 0, 73)}
					ZIndex={10}
				>
					<uicorner CornerRadius={new UDim(1, 0)} />
				</frame>
				{slices?.map((slice) => <WheelSlice key={slice.slice} {...slice} />)}
			</frame>
		</surfacegui>
	);
}
