import React, { None, PropsWithChildren, ReactNode, useEffect, useState } from "@rbxts/react";
import { useMotion } from "client/hooks/use-motion";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextService } from "@rbxts/services";
import { FONTS } from "shared/util/strings";
import { brighten, isBright } from "client/utils/color-utils";
import { Corner } from "../tools/Corner";
import buttonHover from "client/utils/ui-effects/button-hover";
import buttonClick from "client/utils/ui-effects/button-click";
import { peek } from "@rbxts/charm";
import { isLoadingAtom } from "client/utils/global-state";
import { hasRichText } from "shared/util/string-utils";
import {
	TutorialActionId,
	isTutorialInteractionBlocked,
	registerTutorialTarget,
	unregisterTutorialTarget,
} from "client/tutorial/tutorial-state";

interface Props extends PropsWithChildren {
	size: React.Binding<UDim2> | UDim2;
	position: UDim2;
	text: string;
	typeface?: "Sans" | "Mono" | "Extended";
	weight?: "Light" | "Regular" | "Medium" | "SemiBold" | "Bold" | "ExtraBold";
	image?: string;
	textSize?: number;
	backgroundColor?: Color3;
	textColor?: Color3;
	imageColor?: Color3;
	layoutOrder?: number;
	pressDip?: number;
	imageRotation?: React.Binding<number> | number;
	anchorPoint?: Vector2;
	imagePadding?: number;
	imageSize?: number;
	visible?: boolean;
	transparency?: React.Binding<number> | number;
	zindex?: number;
	enabled?: boolean;
	animate?: boolean;
	// new optional prop for parent width (in pixels)
	parentWidth?: number;
	event?: React.InstanceEvent<ImageButton>;
	change?: React.InstanceChangeEvent<ImageButton>;
	ref?: React.Ref<ImageButton>;
	labelChildren?: ReactNode;
	tutorialActionId?: TutorialActionId;
	tutorialTargetId?: string;
}

export function Button({
	size,
	position,
	event,
	change,
	ref,
	typeface = "Sans",
	weight = "Regular",
	image,
	text,
	textSize = 18,
	backgroundColor = palette.background3,
	textColor = palette.primaryText,
	imageColor = Color3.fromRGB(255, 255, 255),
	layoutOrder,
	pressDip = 2,
	imageRotation = 0,
	anchorPoint = new Vector2(),
	imagePadding = 5,
	imageSize = 21,
	visible = true,
	transparency = 0,
	zindex = 1,
	enabled = true,
	animate = true,
	parentWidth,
	tutorialActionId,
	tutorialTargetId,
	event: buttonEvent,
	change: buttonChange,
	labelChildren,
	children,
}: Props) {
	const px = usePx();
	const [hovered, setHovered] = useState(false);
	const [pressed, setPressed] = useState(false);
	const [buttonInstance, setButtonInstance] = useState<ImageButton | undefined>(undefined);
	const [buttonColor, buttonColorMotion] = useMotion(backgroundColor);
	const [buttonPosition, buttonPositionMotion] = useMotion(position);

	useEffect(() => {
		if (!tutorialTargetId || !buttonInstance || !visible) return;
		registerTutorialTarget(tutorialTargetId, buttonInstance);

		return () => {
			unregisterTutorialTarget(tutorialTargetId, buttonInstance);
		};
	}, [tutorialTargetId, buttonInstance, visible]);

	const setCombinedRef = (instance?: ImageButton) => {
		setButtonInstance(instance);

		if (!ref) return;
		if (typeIs(ref, "function")) {
			ref(instance);
			return;
		}

		(ref as { current?: ImageButton }).current = instance;
	};

	let effectiveWidth: number;
	if (typeIs(size, "UDim2")) {
		if (parentWidth !== undefined) {
			effectiveWidth = parentWidth * size.X.Scale + size.X.Offset;
		} else {
			effectiveWidth = size.X.Offset;
		}
	} else {
		const udim = size.getValue();
		if (parentWidth !== undefined) {
			effectiveWidth = parentWidth * udim.X.Scale + udim.X.Offset;
		} else {
			effectiveWidth = udim.X.Offset;
		}
	}

	// setup text bounds
	const textBoundParams = new Instance("GetTextBoundsParams");
	textBoundParams.Text = text;
	textBoundParams.Font = new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal);
	textBoundParams.Size = px(textSize);
	textBoundParams.Width = effectiveWidth;
	const trueTextSize = TextService.GetTextBoundsAsync(textBoundParams);

	let textPosition: UDim2;
	let textAnchor: Vector2;
	let textLabelSize: UDim2;

	if (image) {
		// if there's an image, calculate positions for both image and text
		const trueImageSize = px(imageSize);
		const space = px(imagePadding);
		const totalWidth = trueTextSize.X + 1 + space + trueImageSize;
		const imageLabelX = (effectiveWidth - totalWidth) / 2;
		const textLabelX = imageLabelX + trueImageSize + space;

		textPosition = new UDim2(0, textLabelX, 0.5, 0);
		textAnchor = new Vector2(0, 0.5);
		textLabelSize = new UDim2(0, trueTextSize.X + 5, 1, 0);
	} else {
		// no image? center the text
		textPosition = new UDim2(0.5, 0, 0.5, 0);
		textAnchor = new Vector2(0.5, 0.5);
		textLabelSize = new UDim2(0, trueTextSize.X + 5, 1, 0);
	}

	useEffect(() => {
		if (!animate) return;
		if (!enabled) {
			let darkenedColor = brighten(backgroundColor, -0.3);
			if (!isBright(backgroundColor)) {
				darkenedColor = brighten(backgroundColor, -0.05);
			}
			buttonColorMotion.tween(darkenedColor, {
				time: 0.1,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
			buttonPositionMotion.tween(position, {
				time: 0.1,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
			return;
		}

		const brightnessIncrease = pressed ? 0.1 : hovered ? 0.15 : 0;
		const targetButtonColor =
			brightnessIncrease > 0 ? brighten(backgroundColor, brightnessIncrease) : backgroundColor;
		const framePosition =
			hovered && pressed
				? new UDim2(position.X.Scale, position.X.Offset, position.Y.Scale, position.Y.Offset + px(pressDip))
				: position;
		buttonPositionMotion.tween(framePosition, {
			time: 0.1,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
		buttonColorMotion.tween(targetButtonColor, {
			time: 0.1,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
	}, [enabled, hovered, pressed, backgroundColor, textColor]);

	return (
		<imagebutton
			Size={size}
			Position={buttonPosition}
			BackgroundColor3={buttonColor}
			AutoButtonColor={false}
			ImageTransparency={1}
			LayoutOrder={layoutOrder}
			BackgroundTransparency={transparency}
			Image={""}
			AnchorPoint={anchorPoint}
			BorderSizePixel={0}
			Visible={visible}
			Event={{
				MouseEnter: (...args) => {
					setHovered(true);
					buttonHover();
					event?.MouseEnter?.(...args);
				},
				MouseLeave: (...args) => {
					setHovered(false);
					setPressed(false);
					event?.MouseLeave?.(...args);
				},
				MouseButton1Down: (...args) => {
					setPressed(true);
					event?.MouseButton1Down?.(...args);
				},
				MouseButton1Up: (...args) => {
					setPressed(false);
					event?.MouseButton1Up?.(...args);
				},
				Activated: (...args) => {
					if (isTutorialInteractionBlocked(tutorialActionId)) return;
					if (peek(isLoadingAtom)) return;
					if (enabled && buttonEvent && buttonEvent.Activated) {
						buttonEvent.Activated(...args);
						buttonClick();
					}
				},
			}}
			Change={change ?? {}}
			ref={setCombinedRef}
			ZIndex={zindex}
		>
			<Corner roundness="small" />
			{image ? (
				<imagelabel
					Size={new UDim2(0, px(imageSize), 0, px(imageSize))}
					Position={
						new UDim2(
							0,
							(effectiveWidth - (trueTextSize.X + 1 + px(imagePadding) + px(imageSize))) / 2,
							0.5,
							0,
						)
					}
					AnchorPoint={new Vector2(0, 0.5)}
					Image={image}
					ImageColor3={imageColor}
					BackgroundTransparency={1}
					ImageTransparency={transparency}
					Rotation={imageRotation}
				/>
			) : (
				<></>
			)}
			<textlabel
				Size={textLabelSize}
				Position={textPosition}
				AnchorPoint={textAnchor}
				Text={text}
				FontFace={new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal)}
				TextColor3={textColor}
				TextSize={px(textSize)}
				TextWrapped={true}
				TextTransparency={transparency}
				TextXAlignment={image ? Enum.TextXAlignment.Left : Enum.TextXAlignment.Center}
				BackgroundTransparency={1}
				RichText={hasRichText(text)}
			>
				{labelChildren}
			</textlabel>
			{children}
		</imagebutton>
	);
}
