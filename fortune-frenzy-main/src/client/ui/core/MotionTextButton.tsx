import React, { useEffect } from "@rbxts/react";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { palette } from "client/utils/palette";
import buttonClick from "client/utils/ui-effects/button-click";

interface Props {
	option: string;
	selected: boolean;
	onSelect: () => void;
	font: Font;
	textSize: number;
	buttonWidth: number;
	buttonHeight?: number;
}

export function MotionTextButton({
	option,
	selected,
	onSelect,
	font,
	textSize,
	buttonWidth,
	buttonHeight = 45,
}: Props) {
	const initialColor = selected ? palette.blueText : palette.primaryText;
	const [textColor, textColorMotion] = useMotion(initialColor);

	useEffect(() => {
		const targetColor = selected ? palette.blueText : palette.primaryText;
		textColorMotion.tween(targetColor, {
			time: 0.2,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.InOut,
		});
	}, [selected]);

	return (
		<textbutton
			FontFace={font}
			BackgroundTransparency={1}
			Text={option}
			TextSize={textSize}
			Size={new UDim2(0, buttonWidth, 0, buttonHeight)}
			TextColor3={textColor}
			TextYAlignment={Enum.TextYAlignment.Center}
			TextXAlignment={Enum.TextXAlignment.Center}
			Event={{
				Activated: () => {
					onSelect();
					buttonClick();
				},
			}}
		/>
	);
}
