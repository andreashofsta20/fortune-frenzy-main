import React, { useEffect, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { useMotion } from "client/hooks/use-motion";
import { brighten } from "client/utils/color-utils";
import getRarity from "shared/util/get-item-rarity";
import { Corner } from "../tools/Corner";
import buttonClick from "client/utils/ui-effects/button-click";

type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary" | "mythical";

const RARITY_COLORS: Record<Rarity, string> = {
	common: "ffffff",
	uncommon: "94ff81",
	rare: "5da3ff",
	epic: "cd3134",
	legendary: "dfb03a",
	mythical: "81eded",
};

interface Props {
	id: string;
	name: string;
	assetId: string;
	exclusive: boolean;
	subtitle: string;
	visible: boolean;
	color: string;
	value?: number;
	onSelect: (id: string, inputObject: InputObject) => void;
	onHover: (id: string) => void;
	onLeave: () => void;
	LayoutOrder?: number;
	faded?: boolean;
}

function ItemTileComponent({
	id,
	name,
	assetId,
	exclusive,
	subtitle,
	visible,
	LayoutOrder = 0,
	color,
	value,
	onSelect,
	onHover,
	onLeave,
	faded = false,
}: Props) {
	const px = usePx();
	const rarity = value !== undefined ? getRarity(value) : undefined;
	const baseColor = Color3.fromHex(rarity ? RARITY_COLORS[rarity] : color);
	const gradientMid = rarity === "common" ? baseColor : brighten(baseColor, -0.15);
	const [pressed, setPressed] = useState(false);
	const [hovered, setHovered] = useState(false);
	const [buttonColor, buttonColorMotion] = useMotion(palette.white);
	const [textColor, textColorMotion] = useMotion(palette.primaryText);
	const [buttonGradientRot, buttonGradientRotMotion] = useMotion(104);

	useEffect(() => {
		const tweenParams = {
			time: 0.2,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		};

		buttonColorMotion.tween(hovered ? brighten(palette.white, -0.15) : palette.white, tweenParams);
		textColorMotion.tween(hovered ? brighten(palette.primaryText, -0.15) : palette.primaryText, tweenParams);
		buttonGradientRotMotion.tween(buttonGradientRot.getValue() + 104, {
			time: 1,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.Out,
		});
	}, [pressed, hovered]);

	return (
		<imagebutton
			Visible={visible}
			LayoutOrder={LayoutOrder}
			BackgroundTransparency={1}
			Image={""}
			Event={{
				Activated: (_, inputObject) => {
					onSelect(id, inputObject);
					buttonClick();
				},
				MouseEnter: () => {
					setHovered(true);
					onHover(id);
				},
				MouseLeave: () => {
					setHovered(false);
					setPressed(false);
					onLeave();
				},
				MouseButton1Down: () => setPressed(true),
				MouseButton1Up: () => setPressed(false),
			}}
		>
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)}>
				<uilistlayout Padding={new UDim(0, px(5))} SortOrder={Enum.SortOrder.LayoutOrder} />
				<frame BackgroundTransparency={1} Size={new UDim2(0, px(93), 0, px(93))}>
					<Corner roundness="small" />
					<uistroke Color={buttonColor} Transparency={0} Thickness={px(0.7)}>
						<uigradient
							Color={
								new ColorSequence([
									new ColorSequenceKeypoint(0, baseColor),
									new ColorSequenceKeypoint(0.5, gradientMid),
									new ColorSequenceKeypoint(1, baseColor),
								])
							}
							Rotation={buttonGradientRot}
						/>
					</uistroke>
					<imagelabel
						BackgroundTransparency={1}
						ImageTransparency={0.6}
						Image={"rbxassetid://130857364675852"}
						ImageColor3={buttonColor}
						Size={new UDim2(1, 0, 1, 0)}
					>
						<uigradient
							Color={
								new ColorSequence([
									new ColorSequenceKeypoint(0, baseColor),
									new ColorSequenceKeypoint(0.5, gradientMid),
									new ColorSequenceKeypoint(1, baseColor),
								])
							}
							Rotation={buttonGradientRot}
						/>
					</imagelabel>
					<imagelabel
						BackgroundTransparency={1}
						Image={`rbxthumb://type=Asset&id=${assetId}&w=150&h=150`}
						Size={new UDim2(0.9, 0, 0.9, 0)}
						AnchorPoint={new Vector2(0.5, 0.5)}
						Position={new UDim2(0.5, 0, 0.5, 0)}
					/>
					{exclusive && (
						<imagelabel
							BackgroundTransparency={1}
							Image={`rbxassetid://128179898746148`}
							Size={new UDim2(1, 0, 1, 0)}
							AnchorPoint={new Vector2(0.5, 0.5)}
							Position={new UDim2(0.5, 0, 0.5, 0)}
							ImageColor3={Color3.fromRGB(119, 58, 211)}
						/>
					)}
				</frame>
				<frame BackgroundTransparency={1} Size={new UDim2(0, px(94), 0, px(32))}>
					<uilistlayout SortOrder={Enum.SortOrder.LayoutOrder} />
					<TextLabel
						typeface="Sans"
						weight="Bold"
						native={{
							Text: name,
							Size: new UDim2(0, px(94), 0, px(4)),
							AutomaticSize: Enum.AutomaticSize.Y,
							TextXAlignment: Enum.TextXAlignment.Left,
							TextSize: px(16),
							TextColor3: textColor,
							AutoLocalize: false,
						}}
					/>
					<TextLabel
						typeface="Sans"
						weight="SemiBold"
						native={{
							Text: subtitle,
							Size: new UDim2(0, px(94), 0, px(14)),
							TextXAlignment: Enum.TextXAlignment.Left,
							TextSize: px(14),
							AutoLocalize: false,
							TextColor3: palette.midText,
						}}
					/>
				</frame>
			</frame>
			<frame
				Size={new UDim2(1, px(2), 1, px(2))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundColor3={palette.background1}
				BackgroundTransparency={faded ? 0.3 : 1}
				ZIndex={2}
				BorderSizePixel={0}
			/>
		</imagebutton>
	);
}

export const ItemTile = React.memo(ItemTileComponent);
