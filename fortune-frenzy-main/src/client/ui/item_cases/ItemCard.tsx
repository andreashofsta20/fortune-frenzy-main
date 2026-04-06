import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { brighten, setValue } from "client/utils/color-utils";
import { palette } from "client/utils/palette";
import { formatPercentage, formatWithSuffix } from "shared/util/number-utils";
import { Item } from "typings/APIResponses";
import { TextLabel } from "../core/TextLabel";
import { Button } from "../core/Button";
import { usePxScale } from "client/hooks/use-scale";
import { Corner } from "../tools/Corner";
import { useMotion } from "client/hooks/use-motion";

interface Props {
	data: {
		item: Item;
		chance: number;
		claimed: number;
	};
	position?: UDim2;
	size?: UDim2;
	layoutOrder?: number;
	strokeThickness?: number;
	showClaimed?: boolean;
	isLucky?: boolean;
}

export function ItemCard({
	data,
	position = new UDim2(0, 0, 0, 0),
	size,
	layoutOrder,
	strokeThickness,
	showClaimed = true,
	isLucky = false,
}: Props) {
	const px = usePx();
	const pxScale = usePxScale();

	// Create motion values for color transitions
	const baseColor = Color3.fromHex(data.item.color);
	const [bgColorBinding, bgColorMotion] = useMotion(
		!isLucky ? setValue(baseColor, 220) : Color3.fromRGB(220, 220, 220),
	);
	const [strokeColorBinding, strokeColorMotion] = useMotion(setValue(baseColor, 110));
	const [imageColorBinding, imageColorMotion] = useMotion(
		!isLucky ? setValue(baseColor, 220) : Color3.fromRGB(206, 184, 115),
	);

	// Update motion goals when isLucky changes
	React.useEffect(() => {
		const tweenOptions = {
			time: 0.3,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		};

		bgColorMotion.tween(!isLucky ? setValue(baseColor, 220) : Color3.fromRGB(220, 220, 220), tweenOptions);
		strokeColorMotion.tween(setValue(baseColor, 110), tweenOptions);
		imageColorMotion.tween(!isLucky ? setValue(baseColor, 220) : Color3.fromRGB(206, 184, 115), tweenOptions);
	}, [isLucky, baseColor]);

	return (
		<frame
			BackgroundColor3={bgColorBinding}
			Position={position}
			Size={size ?? new UDim2(0, px(122), 0, px(170))}
			ClipsDescendants={true}
			LayoutOrder={layoutOrder}
		>
			<Corner roundness="small" />
			<uistroke Color={strokeColorBinding} Thickness={strokeThickness ?? px(1)} />
			{!isLucky ? (
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromRGB(77, 77, 77)),
							new ColorSequenceKeypoint(0.32, Color3.fromRGB(115, 115, 115)),
							new ColorSequenceKeypoint(1, Color3.fromRGB(59, 59, 59)),
						])
					}
					Rotation={-135}
				/>
			) : (
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromRGB(249, 230, 151)),
							new ColorSequenceKeypoint(1, Color3.fromRGB(186, 130, 43)),
						])
					}
				/>
			)}
			<imagelabel
				Image={"rbxassetid://16301282541"}
				ImageColor3={imageColorBinding}
				ImageTransparency={0}
				ScaleType={Enum.ScaleType.Fit}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundTransparency={1}
				Position={new UDim2(0, px(64), 0, px(64))}
				Size={new UDim2(0, px(310), 0, px(310))}
				ZIndex={-1}
			/>
			<imagelabel
				Image={`rbxthumb://type=Asset&id=${data.item.asset_id}&w=420&h=420`}
				ScaleType={Enum.ScaleType.Fit}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0, px(40))}
				Size={new UDim2(0, px(100), 0, px(68))}
			/>
			<frame BackgroundTransparency={1} Position={new UDim2(0, 0, 0, px(64))} Size={new UDim2(1, 0, 0, px(100))}>
				<uilistlayout
					Padding={new UDim(0, px(3))}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					SortOrder={Enum.SortOrder.LayoutOrder}
					VerticalAlignment={Enum.VerticalAlignment.Center}
				/>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						TextColor3: palette.white,
						AutomaticSize: Enum.AutomaticSize.Y,
						TextSize: px(15),
						TextTruncate: Enum.TextTruncate.AtEnd,
						Size: new UDim2(0, px(90), 0, px(1)),
						Text: `${data.item.name}`,
						LayoutOrder: 1,
						AutoLocalize: false,
					}}
				>
					<uisizeconstraint MaxSize={new Vector2(math.huge, px(35) * pxScale())} />
				</TextLabel>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						TextColor3: !isLucky ? setValue(baseColor, 220) : Color3.fromRGB(220, 198, 126),
						AutomaticSize: Enum.AutomaticSize.Y,
						Text: formatPercentage(data.chance),
						TextSize: px(15),
						Size: new UDim2(0, px(100), 0, px(15)),
						LayoutOrder: 2,
					}}
				/>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						TextColor3: !isLucky ? brighten(setValue(baseColor, 220), 0.7) : Color3.fromRGB(255, 212, 126),
						Text: `${formatWithSuffix(data.item.value, 1)} Value`,
						TextSize: px(13),
						Size: new UDim2(0, px(100), 0, px(13)),
						LayoutOrder: 3,
					}}
				/>
				{showClaimed ? (
					<TextLabel
						weight="Bold"
						typeface="Sans"
						native={{
							TextColor3: brighten(setValue(Color3.fromHex(data.item.color), 220), 0.7),
							Text: `${formatWithSuffix(data.claimed, 0)} Claimed`,
							TextSize: px(13),
							Size: new UDim2(0, px(100), 0, px(13)),
							LayoutOrder: 4,
						}}
					/>
				) : undefined}
				{isLucky ? (
					<TextLabel
						weight="ExtraBold"
						typeface="Sans"
						native={{
							TextColor3: Color3.fromRGB(255, 243, 197),
							Text: `LUCKY ROLL`,
							TextSize: px(17),
							Size: new UDim2(0, px(100), 0, px(17)),
							LayoutOrder: 5,
						}}
					/>
				) : undefined}
			</frame>
		</frame>
	);
}
