import React, { useEffect, useState, useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { FONTS } from "shared/util/strings";
import { TextService } from "@rbxts/services";
import { SectionStroke } from "../tools/SectionStroke";
import { palette } from "client/utils/palette";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { MotionTextButton } from "./MotionTextButton";
import { Corner } from "../tools/Corner";

interface Props extends React.PropsWithChildren {
	typeface?: "Sans" | "Mono" | "Extended";
	weight?: "Light" | "Regular" | "Medium" | "SemiBold" | "Bold" | "ExtraBold";
	options: Array<string>;
	setState: (value: string) => void;
	state: string;
	position: UDim2;
	anchorPoint?: Vector2;
	backgroundColor: Color3;
	direction?: "horizontal" | "vertical";
	minimumVerticalWidth?: number;
	minimumHorizontalWidth?: number;
}

const CONSTANTS = {
	TEXT_SIZE: 18,
	BUTTON_PADDING: 12,
	BUTTON_HEIGHT: 45,
	BUTTON_SPACING: 12,
	VERTICAL_SPACING: 4,
	CONTAINER_PADDING: 24,
	SELECTION_PADDING: 6,
	SELECTION_MARGIN: 3,
	SELECTION_OFFSET: 12,
} as const;

interface ButtonDimensions {
	width: number;
	height: number;
}

interface LayoutCalculations {
	buttonDimensions: Record<string, ButtonDimensions>;
	totalWidth: number;
	totalHeight: number;
	maxButtonWidth: number;
}

export function ButtonGroup({
	typeface = "Sans",
	weight = "Regular",
	options,
	setState,
	state,
	position,
	anchorPoint,
	backgroundColor,
	direction = "horizontal",
	minimumVerticalWidth = 0,
	minimumHorizontalWidth = 0,
}: Props) {
	const px = usePx();

	const getTextBounds = (text: string): Vector2 => {
		const textBoundParams = new Instance("GetTextBoundsParams");
		textBoundParams.Text = text;
		textBoundParams.Font = new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal);
		textBoundParams.Size = px(CONSTANTS.TEXT_SIZE);
		return TextService.GetTextBoundsAsync(textBoundParams);
	};

	const layout = useMemo((): LayoutCalculations => {
		const buttonDimensions: Record<string, ButtonDimensions> = {};

		options.forEach((option) => {
			const textBounds = getTextBounds(option);
			buttonDimensions[option] = {
				width: textBounds.X + px(CONSTANTS.BUTTON_PADDING),
				height: textBounds.Y + px(CONSTANTS.BUTTON_PADDING),
			};
		});

		const maxButtonWidth = options.reduce((max, option) => math.max(max, buttonDimensions[option].width), 0);

		let totalWidth: number;
		let totalHeight: number;

		if (direction === "horizontal") {
			const calculatedWidth =
				options.reduce((sum, option) => sum + buttonDimensions[option].width, 0) +
				(options.size() - 1) * px(CONSTANTS.BUTTON_SPACING) +
				px(CONSTANTS.CONTAINER_PADDING);

			totalWidth = math.max(calculatedWidth, minimumHorizontalWidth);
			totalHeight = px(CONSTANTS.BUTTON_HEIGHT);
		} else {
			totalWidth = math.max(maxButtonWidth, minimumVerticalWidth) + px(CONSTANTS.CONTAINER_PADDING);
			totalHeight =
				options.reduce((sum, option) => sum + buttonDimensions[option].height, 0) +
				(options.size() - 1) * px(CONSTANTS.VERTICAL_SPACING) +
				px(CONSTANTS.CONTAINER_PADDING);
		}

		return {
			buttonDimensions,
			totalWidth,
			totalHeight,
			maxButtonWidth,
		};
	}, [options, typeface, weight, direction, px, minimumHorizontalWidth, minimumVerticalWidth]);

	const [selectFramePosition, selectFramePositionMotion] = useMotion(new UDim2());
	const [selectFrameSize, selectFrameSizeMotion] = useMotion(new UDim2());

	const animationConfig = {
		time: 0.2,
		easing: Enum.EasingStyle.Quad,
		direction: Enum.EasingDirection.InOut,
	};

	useEffect(() => {
		if (options.indexOf(state) < 0 && options.size() > 0) {
			setState(options[0]);
		}
	}, [options, state, setState]);

	const updateSelectionFrame = () => {
		const selectedIndex = options.indexOf(state);
		const selectedDimensions = layout.buttonDimensions[state];

		if (direction === "horizontal") {
			let offsetToSelected = 0;
			for (let i = 0; i < selectedIndex; i++) {
				offsetToSelected += layout.buttonDimensions[options[i]].width + px(CONSTANTS.BUTTON_SPACING);
			}

			const totalButtonWidth =
				options.reduce((sum, option) => sum + layout.buttonDimensions[option].width, 0) +
				(options.size() - 1) * px(CONSTANTS.BUTTON_SPACING);
			const centerOffset = (layout.totalWidth - totalButtonWidth - px(CONSTANTS.CONTAINER_PADDING)) / 2;

			selectFramePositionMotion.tween(
				new UDim2(
					0,
					offsetToSelected +
						centerOffset +
						px(CONSTANTS.CONTAINER_PADDING / 2) -
						px(CONSTANTS.SELECTION_MARGIN),
					0.5,
					0,
				),
				animationConfig,
			);
			selectFrameSizeMotion.tween(
				new UDim2(
					0,
					selectedDimensions.width + px(CONSTANTS.SELECTION_PADDING),
					1,
					-px(CONSTANTS.SELECTION_OFFSET),
				),
				animationConfig,
			);
		} else {
			let offsetToSelected = px(CONSTANTS.CONTAINER_PADDING / 2);
			for (let i = 0; i < selectedIndex; i++) {
				offsetToSelected += layout.buttonDimensions[options[i]].height + px(CONSTANTS.VERTICAL_SPACING);
			}

			selectFramePositionMotion.tween(new UDim2(0.5, 0, 0, offsetToSelected), animationConfig);
			selectFrameSizeMotion.tween(
				new UDim2(0, math.max(layout.maxButtonWidth, minimumVerticalWidth), 0, selectedDimensions.height),
				animationConfig,
			);
		}
	};

	useEffect(() => {
		updateSelectionFrame();
	}, [state, layout]);

	const renderButtons = () => {
		return options.map((option) => (
			<MotionTextButton
				key={option}
				font={new Font(FONTS[typeface], Enum.FontWeight[weight], Enum.FontStyle.Normal)}
				option={option}
				textSize={px(CONSTANTS.TEXT_SIZE)}
				buttonWidth={
					direction === "vertical"
						? math.max(layout.maxButtonWidth, minimumVerticalWidth)
						: layout.buttonDimensions[option].width
				}
				buttonHeight={direction === "vertical" ? layout.buttonDimensions[option].height : undefined}
				selected={state === option}
				onSelect={() => setState(option)}
			/>
		));
	};

	return (
		<frame
			Size={new UDim2(0, layout.totalWidth, 0, layout.totalHeight)}
			Position={position}
			BackgroundColor3={backgroundColor}
			AnchorPoint={anchorPoint}
		>
			<SectionStroke />
			<Corner roundness="small" />

			<frame Size={new UDim2(1, 0, 1, 0)} Position={new UDim2(0, 0, 0, 0)} BackgroundTransparency={1}>
				<uilistlayout
					Padding={
						new UDim(
							0,
							direction === "horizontal" ? px(CONSTANTS.BUTTON_SPACING) : px(CONSTANTS.VERTICAL_SPACING),
						)
					}
					FillDirection={
						direction === "horizontal" ? Enum.FillDirection.Horizontal : Enum.FillDirection.Vertical
					}
					SortOrder={Enum.SortOrder.LayoutOrder}
					VerticalAlignment={Enum.VerticalAlignment.Center}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
				/>
				{renderButtons()}
			</frame>
			<frame
				Position={selectFramePosition}
				Size={selectFrameSize}
				AnchorPoint={direction === "horizontal" ? new Vector2(0, 0.5) : new Vector2(0.5, 0)}
				BackgroundColor3={palette.blue}
				BorderSizePixel={0}
				ZIndex={0}
			>
				<Corner roundness="small" />
			</frame>
		</frame>
	);
}
