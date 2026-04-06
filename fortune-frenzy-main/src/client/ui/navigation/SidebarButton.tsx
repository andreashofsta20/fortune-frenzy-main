import React, { useEffect, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { SquareRatio } from "../tools/SquareRatio";
import { useMotion } from "client/hooks/use-motion";
import { brighten } from "client/utils/color-utils";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import buttonClick from "client/utils/ui-effects/button-click";
import buttonHover from "client/utils/ui-effects/button-hover";
import { peek } from "@rbxts/charm";
import { activeMenuAtom } from "client/utils/global-state";
import { useAtom } from "@rbxts/react-charm";
import { registerTutorialTarget, unregisterTutorialTarget } from "client/tutorial/tutorial-state";

interface Props {
	imageUrl: string;
	name: string;
	layoutOrder?: number;
	onClick: () => void;
	tutorialTargetId?: string;
}

export function SidebarButton({ imageUrl, name, layoutOrder, onClick, tutorialTargetId }: Props) {
	const px = usePx();
	const [pressed, setPressed] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [buttonInstance, setButtonInstance] = useState<ImageButton | undefined>(undefined);
	const [buttonColor, buttonColorMotion] = useMotion(palette.background1);
	const [imageColor, imageColorMotion] = useMotion(palette.basicallyWhite);
	const [framePosition, framePositionMotion] = useMotion(new UDim2(0, 0, 0, 0));
	const currentMenu = useAtom(activeMenuAtom);

	useEffect(() => {
		if (!tutorialTargetId || !buttonInstance) return;
		registerTutorialTarget(tutorialTargetId, buttonInstance);

		return () => {
			unregisterTutorialTarget(tutorialTargetId, buttonInstance);
		};
	}, [tutorialTargetId, buttonInstance]);

	useEffect(() => {
		const tweenParams = {
			time: 0.1,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		};

		const currentMenu = peek(activeMenuAtom);
		const brightnessIncrease = pressed ? 0.1 : hovered ? 0.15 : 0;
		const targetButtonColor =
			currentMenu !== name
				? brightnessIncrease > 0
					? brighten(palette.background1, brightnessIncrease)
					: palette.background1
				: palette.basicallyWhite;

		const framePosition = hovered ? new UDim2(0, 0, 0, px(2)) : new UDim2(0, 0, 0, 0);
		const targetImageColor = currentMenu !== name ? palette.basicallyWhite : palette.background1;
		const shortTweenParams = { ...tweenParams, time: 0.2 };

		buttonColorMotion.tween(targetButtonColor, currentMenu !== name ? tweenParams : shortTweenParams);
		imageColorMotion.tween(targetImageColor, currentMenu !== name ? tweenParams : shortTweenParams);
		framePositionMotion.tween(framePosition, {
			...tweenParams,
			direction: Enum.EasingDirection.In,
		});
	}, [hovered, pressed, currentMenu]);

	return (
		<imagebutton
			ref={setButtonInstance}
			Size={new UDim2(0, px(54), 0, px(54))}
			BackgroundTransparency={1}
			LayoutOrder={layoutOrder}
			AutoButtonColor={false}
			Event={{
				Activated: () => {
					onClick();
					buttonClick();
				},
				MouseEnter: () => {
					setHovered(true);
					buttonHover();
				},
				MouseLeave: () => {
					setHovered(false);
					setPressed(false);
				},
				MouseButton1Down: () => setPressed(true),
				MouseButton1Up: () => setPressed(false),
			}}
		>
			<SquareRatio />
			<frame
				Size={new UDim2(1, 0, 1, 0)}
				Position={framePosition}
				BackgroundColor3={buttonColor}
				BackgroundTransparency={0}
			>
				<SquareRatio />
				<Corner roundness="small" />
				<imagelabel
					Size={new UDim2(0, px(26), 0, px(26))}
					Position={new UDim2(0.5, 0, 0.5, 0)}
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundTransparency={1}
					ImageColor3={imageColor}
					Image={imageUrl}
					ScaleType={Enum.ScaleType.Fit}
				>
					<SquareRatio />
				</imagelabel>
			</frame>
		</imagebutton>
	);
}
