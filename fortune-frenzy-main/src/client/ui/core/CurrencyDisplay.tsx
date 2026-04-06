import React, { useEffect, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { TextLabel } from "./TextLabel";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core";
import Signal from "@rbxts/signal";
import { TextService, TweenService } from "@rbxts/services";
import { FONTS } from "shared/util/strings";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { addCommasToNumber, formatWithSuffix } from "shared/util/number-utils";
import { Corner } from "../tools/Corner";
import { setValue } from "client/utils/color-utils";

interface Props {
	currency: string;
	icon: string;
	color: Color3;
}

const MAX_CHARS = 10;

export function CurrencyDisplay({ currency, icon, color }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [buttonSize, buttonSizeMotion] = useMotion(new UDim2(0, 0, 0, px(40)));
	const initialAmt = clientStateController[`${currency}` as keyof ClientStateController] as number;
	const [currentText, setCurrentText] = useState(`${addCommasToNumber(initialAmt)}`);
	const [currentValue, setCurrentValue] = useState(initialAmt);
	const [scale, scaleMotion] = useMotion(1);

	useEffect(() => {
		const event = clientStateController[`${currency}ChangedEvent` as keyof ClientStateController] as Signal<
			(amt: number) => void,
			false
		>;

		let currentTween: Tween | undefined;
		const connection = event.Connect((amt) => {
			const numberValue = new Instance("IntValue");
			currentTween?.Pause();
			currentTween?.Destroy();
			numberValue.Value = currentValue;

			const diff = amt - currentValue;
			const tween = TweenService.Create(
				numberValue,
				new TweenInfo(0.7, Enum.EasingStyle.Quart, Enum.EasingDirection.Out),
				{ Value: amt },
			);

			if (diff > 0) {
				scaleMotion.tween(1.1, {
					time: 0.5,
					style: Enum.EasingStyle.Exponential,
					direction: Enum.EasingDirection.Out,
				});
			} else {
				scaleMotion.tween(0.95, {
					time: 0.5,
					style: Enum.EasingStyle.Exponential,
					direction: Enum.EasingDirection.Out,
				});
			}

			setCurrentValue(amt);
			numberValue.Changed.Connect(() => {
				const len = addCommasToNumber(numberValue.Value).size();

				if (len > MAX_CHARS) {
					setCurrentText(formatWithSuffix(numberValue.Value, 2));
				} else {
					setCurrentText(addCommasToNumber(numberValue.Value));
				}
			});

			currentTween = tween;
			tween.Play();

			task.delay(0.35, () => {
				currentTween?.Destroy();
			});

			task.delay(1.5, () => {
				scaleMotion.tween(1, {
					time: 0.5,
					style: Enum.EasingStyle.Exponential,
					direction: Enum.EasingDirection.Out,
				});
			});
		});

		return () => {
			connection.Disconnect();
		};
	}, [currency, currentValue]);

	useEffect(() => {
		const textBoundParams = new Instance("GetTextBoundsParams");
		textBoundParams.Text = currentText;
		textBoundParams.Font = new Font(FONTS["Extended"], Enum.FontWeight.Bold, Enum.FontStyle.Normal);
		textBoundParams.Size = px(20);
		textBoundParams.Width = px(500);
		const textSize = TextService.GetTextBoundsAsync(textBoundParams);
		buttonSizeMotion.set(new UDim2(0, px(textSize.X) + px(25), 0, px(40)));
	}, [currentText]);

	return (
		<frame Size={new UDim2(1, 0, 0, px(44))}>
			<uiscale Scale={scale} />
			<Corner roundness="small" />
			<uigradient
				Color={
					new ColorSequence([
						new ColorSequenceKeypoint(0, setValue(color, 44)),
						new ColorSequenceKeypoint(0.5, setValue(color, 63)),
						new ColorSequenceKeypoint(1, setValue(color, 44)),
					])
				}
				Rotation={-70}
			/>
			<uistroke Thickness={px(1)} Color={Color3.fromRGB(255, 255, 255)}>
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, setValue(color, 170)),
							new ColorSequenceKeypoint(0.5, setValue(color, 255)),
							new ColorSequenceKeypoint(1, setValue(color, 170)),
						])
					}
					Rotation={-70}
				/>
			</uistroke>
			<imagelabel
				BackgroundTransparency={1}
				Image={icon}
				Size={new UDim2(0, px(30), 0, px(30))}
				Position={new UDim2(0, px(14), 0.5, 0)}
				AnchorPoint={new Vector2(0, 0.5)}
			/>
			<TextLabel
				weight="Bold"
				typeface="Sans"
				native={{
					AnchorPoint: new Vector2(0, 0.5),
					Position: new UDim2(0, px(52), 0.5, 0),
					Size: buttonSize,
					Text: currentText,
					TextColor3: Color3.fromRGB(255, 255, 255),
					TextSize: px(21),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			>
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, setValue(color, 170)),
							new ColorSequenceKeypoint(0.5, setValue(color, 255)),
							new ColorSequenceKeypoint(1, setValue(color, 170)),
						])
					}
					Rotation={-70}
				/>
			</TextLabel>
		</frame>
	);
}
