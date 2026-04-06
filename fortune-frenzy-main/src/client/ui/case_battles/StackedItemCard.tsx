import React, { memo, useEffect } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { useMotion } from "client/hooks/use-motion";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { addCommasToNumber, setDecimalPlaces } from "shared/util/number-utils";

interface Props {
	item: { id: number; case_index: number };
	quantity: number;
	itemData?: { asset_id?: string; image?: string; value?: number; min_ticket?: number; max_ticket?: number };
	layoutOrder: number;
}

function resolveCaseBattleItemImage(item?: { image?: string; asset_id?: string }) {
	if (!item) return "";

	const image = tostring(item.image ?? "");
	if (image.size() > 0 && image.match("^rbx")[0] !== undefined) {
		return image;
	}

	const assetId = tostring(item.asset_id ?? "");
	const numericMatch = assetId.match("^(%d+)$")[0];
	if (numericMatch !== undefined) {
		return `rbxthumb://type=Asset&id=${numericMatch}&w=150&h=150`;
	}

	return "";
}

export const StackedItemCard = memo(({ item, quantity, itemData, layoutOrder }: Props) => {
	const px = usePx();
	const [fadeTransparency, fadeMotion] = useMotion(0);

	// Fade-in effect on mount for a subtle entrance animation.
	useEffect(() => {
		fadeMotion.tween(1, {
			time: 0.35,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
	}, []);

	return (
		<imagelabel
			BackgroundTransparency={1}
			Size={new UDim2(0, px(102), 0, px(102))}
			Image={"rbxassetid://90455046930174"}
			LayoutOrder={layoutOrder}
		>
			{/* Item thumbnail */}
			<imagelabel
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				Size={new UDim2(0, px(70), 0, px(70))}
				Image={resolveCaseBattleItemImage(itemData)}
			/>

			{/* Total item value */}
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: `$${addCommasToNumber((itemData?.value ?? 0) * quantity)}`,
					TextSize: px(15),
					Size: new UDim2(1, -px(20), 0, px(18)),
					Position: new UDim2(0, px(10), 1, -px(5)),
					TextXAlignment: Enum.TextXAlignment.Left,
					AnchorPoint: new Vector2(0, 1),
				}}
			>
				<uigradient
					Color={
						new ColorSequence([
							new ColorSequenceKeypoint(0, Color3.fromHex("#44ff33")),
							new ColorSequenceKeypoint(1, Color3.fromHex("#ffffff")),
						])
					}
					Rotation={-90}
				/>
			</TextLabel>

			{/* Pull chance percentage */}
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: `${setDecimalPlaces((((itemData?.max_ticket ?? 0) - (itemData?.min_ticket ?? 0) + 1) / 100000) * 100, 2)}%`,
					TextSize: px(15),
					Size: new UDim2(1, -px(20), 0, px(18)),
					Position: new UDim2(0, px(10), 0, 5),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>

			{/* Quantity */}
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: quantity > 1 ? `x${quantity}` : "",
					TextSize: px(15),
					Size: new UDim2(1, -px(20), 0, px(18)),
					Position: new UDim2(0, px(10), 0, 5),
					TextXAlignment: Enum.TextXAlignment.Right,
				}}
			/>

			{/* Fade overlay for enter animation */}
			<frame
				BackgroundColor3={palette.background1}
				BackgroundTransparency={fadeTransparency}
				Size={new UDim2(1, 0, 1, 0)}
				Position={new UDim2(0, 0, 0, 0)}
				BorderSizePixel={0}
				ZIndex={5}
			/>
		</imagelabel>
	);
});
