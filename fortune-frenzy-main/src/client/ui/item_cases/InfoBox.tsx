import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { SectionStroke } from "../tools/SectionStroke";
import { Corner } from "../tools/Corner";

interface Props {
	image: string;
	color: Color3;
	title: string;
	subtitle: string;
	LayoutOrder: number;
}

export function InfoBox({ image, color, title, subtitle, LayoutOrder = 1 }: Props) {
	const px = usePx();

	return (
		<frame BackgroundColor3={palette.background2} Size={new UDim2(0, px(207), 1, 0)} LayoutOrder={LayoutOrder}>
			<SectionStroke />
			<Corner roundness="small" />
			<imagelabel
				BackgroundTransparency={1}
				Size={new UDim2(0, px(30), 0, px(30))}
				Position={new UDim2(0, px(16), 0, px(34))}
				AnchorPoint={new Vector2(0, 0.5)}
				ImageColor3={color}
				Image={image}
				ScaleType={Enum.ScaleType.Fit}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: title,
					TextColor3: palette.primaryText,
					TextSize: px(19),
					TextXAlignment: Enum.TextXAlignment.Left,
					Position: new UDim2(0, px(120), 0, px(15)),
					Size: new UDim2(0, px(122), 0, px(21)),
					AnchorPoint: new Vector2(0.5, 0),
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: subtitle,
					TextColor3: palette.midText,
					TextSize: px(15),
					TextXAlignment: Enum.TextXAlignment.Left,
					Position: new UDim2(0, px(120), 0, px(38)),
					Size: new UDim2(0, px(122), 0, px(13)),
					AnchorPoint: new Vector2(0.5, 0),
				}}
			/>
		</frame>
	);
}
