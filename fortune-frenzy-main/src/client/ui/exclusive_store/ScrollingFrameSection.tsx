import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { TextLabel } from "../core/TextLabel";
import { palette } from "client/utils/palette";

export interface ScrollingFrameSectionProps {
	title: string;
	children: React.ReactNode;
	layoutOrder?: number;
}

const ScrollingFrameSection = React.memo(({ title, children, layoutOrder }: ScrollingFrameSectionProps) => {
	const px = usePx();

	return (
		<frame
			AutomaticSize={Enum.AutomaticSize.Y}
			Size={new UDim2(1, px(-5), 0, 1)}
			LayoutOrder={layoutOrder}
			BackgroundTransparency={1}
		>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: title,
					TextSize: px(20),
					Size: new UDim2(1, 0, 0, px(20)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: palette.midText,
				}}
			/>
			<uilistlayout
				Padding={new UDim(0, px(10))}
				Wraps={true}
				FillDirection={Enum.FillDirection.Horizontal}
				SortOrder={Enum.SortOrder.LayoutOrder}
				HorizontalAlignment={Enum.HorizontalAlignment.Left}
				HorizontalFlex={Enum.UIFlexAlignment.Fill}
				ItemLineAlignment={Enum.ItemLineAlignment.Automatic}
			/>
			{children}
		</frame>
	);
});

export default ScrollingFrameSection;
