import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { Players } from "@rbxts/services";
import { useMotion } from "client/hooks/use-motion";
import { usePx } from "client/hooks/use-px";
import { usePxScale } from "client/hooks/use-scale";
import { activeMenuAtom } from "client/utils/global-state";
import { addCommasToNumber } from "shared/util/number-utils";
import { TextLabel } from "./TextLabel";
import { palette } from "client/utils/palette";

const BACKGROUND_COLOR = Color3.fromRGB(28, 29, 39);
const STROKE_COLOR = Color3.fromRGB(38, 39, 49);
const BACKGROUND_IMAGE = "rbxassetid://110247325843938";
const PAYCHECK_CYCLE_SECONDS = 60;
const PAYCHECK_PROGRESS_COLOR = Color3.fromHex("#2596be");

export function PaycheckWidget() {
	const px = usePx();
	const pxScale = usePxScale();
	const activeMenu = useAtom(activeMenuAtom);
	const [timeLeft, setTimeLeft] = useState<number | undefined>(undefined);
	const [amount, setAmount] = useState<number | undefined>(undefined);
	const [widgetPosition, widgetPositionMotion] = useMotion<UDim2>(new UDim2(1, 0, 1, px(70)));
	const [widgetTransparency, widgetTransparencyMotion] = useMotion(1);
	const [paycheckProgressBinding, paycheckProgressMotion] = useMotion(0);

	useEffect(() => {
		const player = Players.LocalPlayer;

		const updatePaycheck = () => {
			const timeRaw = player.GetAttribute("TimeUntilNextPaycheck");
			const amountRaw = player.GetAttribute("PaycheckAmount");

			setTimeLeft(typeIs(timeRaw, "number") ? timeRaw : undefined);
			setAmount(typeIs(amountRaw, "number") ? amountRaw : undefined);
		};

		updatePaycheck();
		const timeConn = player.GetAttributeChangedSignal("TimeUntilNextPaycheck").Connect(updatePaycheck);
		const amountConn = player.GetAttributeChangedSignal("PaycheckAmount").Connect(updatePaycheck);

		return () => {
			timeConn.Disconnect();
			amountConn.Disconnect();
		};
	}, []);

	const [countdownText, amountText] = useMemo(() => {
		if (timeLeft === undefined) return $tuple("", "");

		const safeTime = math.max(0, math.floor(timeLeft));
		const minutes = math.floor(safeTime / 60);
		const seconds = safeTime % 60;
		const secondsText = seconds < 10 ? `0${seconds}` : tostring(seconds);
		const amountValue = math.max(0, math.floor(amount ?? 0));

		return $tuple(`Paycheck in ${minutes}:${secondsText}`, `Next: +$${addCommasToNumber(amountValue)}`);
	}, [timeLeft, amount]);

	const paycheckProgress = useMemo(() => {
		if (timeLeft === undefined) return 0;
		const safeTime = math.max(0, math.floor(timeLeft));
		return math.clamp(1 - safeTime / PAYCHECK_CYCLE_SECONDS, 0, 1);
	}, [timeLeft]);

	useEffect(() => {
		if (timeLeft === undefined) {
			paycheckProgressMotion.immediate(0);
			return;
		}

		paycheckProgressMotion.tween(paycheckProgress, {
			time: 0.35,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
	}, [paycheckProgress, timeLeft]);

	const hasPaycheckData = countdownText.size() > 0;
	const isDailyRewardOpen = activeMenu === "DailyReward";
	const shouldShowWidget = hasPaycheckData && !isDailyRewardOpen;

	useEffect(() => {
		const visiblePosition = new UDim2(1, 0, 1, 0);
		const hiddenPosition = new UDim2(1, 0, 1, px(70));

		if (shouldShowWidget) {
			widgetPositionMotion.tween(visiblePosition, {
				time: 0.25,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.Out,
			});
			widgetTransparencyMotion.tween(0, {
				time: 0.25,
				style: Enum.EasingStyle.Exponential,
				direction: Enum.EasingDirection.Out,
			});
		} else {
			widgetPositionMotion.tween(hiddenPosition, {
				time: 0.15,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.In,
			});
			widgetTransparencyMotion.tween(1, {
				time: 0.15,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.In,
			});
		}
	}, [shouldShowWidget, px]);

	if (!hasPaycheckData) return undefined;

	return (
		<canvasgroup
			Active={shouldShowWidget}
			AnchorPoint={new Vector2(1, 1)}
			GroupTransparency={widgetTransparency}
			Position={widgetPosition}
			Size={new UDim2(0, px(240), 0, px(62))}
			BackgroundColor3={BACKGROUND_COLOR}
			BorderSizePixel={0}
			ZIndex={5}
		>
			<uiscale Scale={pxScale()} />
			<uicorner CornerRadius={new UDim(0, px(2))} />
			<uistroke Color={STROKE_COLOR} Thickness={px(1.5)} Transparency={0.75} />
			<imagelabel
				BackgroundTransparency={1}
				Image={BACKGROUND_IMAGE}
				ImageTransparency={1}
				Size={UDim2.fromScale(1, 1)}
				ZIndex={0}
			>
				<uigradient
					Transparency={
						new NumberSequence([
							new NumberSequenceKeypoint(0, 0.2),
							new NumberSequenceKeypoint(0.7, 0.1),
							new NumberSequenceKeypoint(1, 0.35),
						])
					}
					Rotation={180}
				/>
			</imagelabel>
			<frame BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ZIndex={2}>
				<uipadding
					PaddingLeft={new UDim(0, px(12))}
					PaddingRight={new UDim(0, px(12))}
					PaddingTop={new UDim(0, px(8))}
					PaddingBottom={new UDim(0, px(8))}
				/>
				<uilistlayout Padding={new UDim(0, px(4))} SortOrder={Enum.SortOrder.LayoutOrder} />
				<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(20))} LayoutOrder={1} ZIndex={2}>
					<uipadding PaddingLeft={new UDim(0, px(4))} />
					<TextLabel
						weight="Bold"
						typeface="Sans"
						native={{
							Text: countdownText,
							TextSize: px(17),
							TextXAlignment: Enum.TextXAlignment.Left,
							TextColor3: palette.primaryText,
							Size: new UDim2(1, 0, 1, 0),
							TextTruncate: Enum.TextTruncate.AtEnd,
							AutoLocalize: false,
							LayoutOrder: 1,
							ZIndex: 2,
						}}
					/>
				</frame>
				<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(16))} LayoutOrder={2} ZIndex={2}>
					<uipadding PaddingLeft={new UDim(0, px(4))} />
					<TextLabel
						weight="SemiBold"
						typeface="Sans"
						native={{
							Text: amountText,
							TextSize: px(14),
							TextXAlignment: Enum.TextXAlignment.Left,
							TextColor3: palette.midText,
							Size: new UDim2(1, 0, 1, 0),
							TextTruncate: Enum.TextTruncate.AtEnd,
							AutoLocalize: false,
							LayoutOrder: 1,
							ZIndex: 2,
						}}
					/>
				</frame>
			</frame>
			<frame
				BackgroundColor3={STROKE_COLOR}
				BorderSizePixel={0}
				Position={new UDim2(0, 0, 1, -px(3))}
				Size={new UDim2(1, 0, 0, px(3))}
				ZIndex={3}
			>
				<frame
					BackgroundColor3={PAYCHECK_PROGRESS_COLOR}
					BorderSizePixel={0}
					Position={UDim2.fromScale(0, 0)}
					Size={paycheckProgressBinding.map((value) => new UDim2(value, 0, 1, 0))}
					ZIndex={4}
				/>
			</frame>
		</canvasgroup>
	);
}
