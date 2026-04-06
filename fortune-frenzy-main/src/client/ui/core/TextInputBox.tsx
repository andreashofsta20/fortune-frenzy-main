import React, { None, useEffect, useState, forwardRef } from "@rbxts/react";
import { useMotion } from "client/hooks/use-motion";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { FONTS } from "shared/util/strings";
import { Corner } from "../tools/Corner";

interface Props extends React.PropsWithChildren {
	size: UDim2;
	position?: UDim2;
	autocompleteText?: string;
	placeholder?: string;
	typeface?: "Sans" | "Mono" | "Extended";
	weight?: "Light" | "Regular" | "Medium" | "SemiBold" | "Bold" | "ExtraBold";
	image?: string;
	text?: string;
	native?: React.InstanceProps<TextBox>;
	event?: React.InstanceEvent<TextBox>;
	change?: React.InstanceChangeEvent<TextBox>;
	visible?: boolean;
	textEditable?: boolean;
	layoutOrder?: number;
}

// Remove the named function and keep it as an anonymous function
export const TextInputBox = forwardRef<TextBox, Props>(
	(
		{
			children,
			size,
			position,
			native,
			event,
			change,
			typeface = "Sans",
			weight = "Regular",
			image,
			placeholder = "",
			autocompleteText = "",
			text = "",
			visible = true,
			textEditable = true,
			layoutOrder,
		}: Props,
		ref,
	) => {
		const px = usePx();
		const [focused, setFocused] = useState(false);
		const [strokeTransparency, strokeTransparencyMotion] = useMotion(1);

		useEffect(() => {
			strokeTransparencyMotion.tween(focused ? 0 : 1, {
				time: 0.2,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.InOut,
			});
		}, [focused]);

		return (
			<frame
				BackgroundColor3={palette.background3}
				Size={size}
				Position={position}
				AnchorPoint={native?.AnchorPoint}
				Visible={visible}
				LayoutOrder={layoutOrder}
			>
				<Corner roundness="small" />
				<uistroke
					Thickness={0.7}
					Transparency={strokeTransparency}
					ApplyStrokeMode={Enum.ApplyStrokeMode.Border}
					Color={palette.lightGray}
				/>
				<textbox
					PlaceholderColor3={palette.textboxPlaceholder}
					TextColor3={palette.primaryText}
					PlaceholderText={placeholder}
					Position={new UDim2(0, px(image ? 36 : 12), 0, 0)}
					BackgroundTransparency={1}
					Text={text}
					Size={new UDim2(1, px(-(image ? 36 : 12)), 1, 0)}
					TextSize={px(18)}
					FontFace={new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal)}
					ClearTextOnFocus={false}
					TextEditable={textEditable}
					TextXAlignment={Enum.TextXAlignment.Left}
					Event={{
						...(event ?? {}),
						Focused: (...args) => {
							setFocused(true);
							if (event?.Focused) {
								event.Focused(...args);
							}
						},
						FocusLost: (...args) => {
							setFocused(false);
							if (event?.FocusLost) {
								event.FocusLost(...args);
							}
						},
					}}
					Change={change ?? {}}
					{...native}
					AnchorPoint={new Vector2(0, 0)}
					ref={ref} // Forward the ref here
				/>
				<textlabel
					TextColor3={palette.textboxAutocomplete}
					Text={autocompleteText}
					Position={new UDim2(0, px(image ? 36 : 12), 0, 0)}
					BackgroundTransparency={1}
					Size={new UDim2(1, px(-(image ? 36 : 12)), 1, 0)}
					TextSize={px(18)}
					FontFace={new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal)}
					TextXAlignment={Enum.TextXAlignment.Left}
					ZIndex={-1}
				/>
				<imagelabel
					BackgroundTransparency={1}
					Image={image}
					Size={new UDim2(0, px(21), 0, px(21))}
					Position={new UDim2(0, px(10), 0.5, 0)}
					AnchorPoint={new Vector2(0, 0.5)}
				/>
			</frame>
		);
	},
);
