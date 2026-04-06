import React, { useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { FONTS } from "shared/util/strings";

interface Props extends React.PropsWithChildren {
	typeface?: "Sans" | "Mono" | "Extended";
	weight?: "Light" | "Regular" | "Medium" | "SemiBold" | "Bold" | "ExtraBold";
	native?: React.InstanceProps<TextLabel>;
	event?: React.InstanceEvent<TextLabel>;
	change?: React.InstanceChangeEvent<TextLabel>;
	ref?: React.Ref<TextLabel>;
}

function TextLabelComponent({ children, typeface = "Sans", weight = "Regular", native, event, change, ref }: Props) {
	const px = usePx();

	const defaultProps: React.InstanceProps<TextLabel> = {
		BackgroundTransparency: 1,
		TextColor3: palette.primaryText,
		TextSize: px(25),
		TextWrapped: true,
	};

	const fontFace = useMemo(
		() => new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal),
		[typeface, weight],
	);

	return (
		<textlabel FontFace={fontFace} Event={event} Change={change} ref={ref} {...defaultProps} {...native}>
			{children}
		</textlabel>
	);
}

export const TextLabel = React.memo(TextLabelComponent);
