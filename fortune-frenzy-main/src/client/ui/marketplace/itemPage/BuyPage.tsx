import React, { useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { TextLabel } from "client/ui/core/TextLabel";
import { palette } from "client/utils/palette";
import { MARKETPLACE_INITIAL_BUY_BUTTON } from "shared/util/strings";
import { addCommasToNumber } from "shared/util/number-utils";
import { replacePlaceholder } from "shared/util/string-utils";
import { Item, ItemListing } from "typings/APIResponses";
import { ItemPageReseller } from "./Reseller";

interface Props {
	itemData?: Item;
	position: React.Binding<UDim2>;
	currentConfirmationPrompt: {
		enabled: boolean;
		listing: ItemListing | undefined;
		directItemId?: string;
		directPrice?: number;
		directItemName?: string;
	};
	setCurrentConfirmationPrompt: (
		value: React.SetStateAction<{
			enabled: boolean;
			listing: ItemListing | undefined;
			directItemId?: string;
			directPrice?: number;
			directItemName?: string;
		}>,
	) => void;
	confirmationPromptTransparencyMotion: Ripple.Motion<number>;
	confirmationPromptBGTransparencyMotion: Ripple.Motion<number>;
}

export function BuyPage({
	itemData,
	position,
	currentConfirmationPrompt,
	setCurrentConfirmationPrompt,
	confirmationPromptTransparencyMotion,
	confirmationPromptBGTransparencyMotion,
}: Props) {
	const px = usePx();
	const directPurchasePrice = useMemo(() => {
		if (!itemData) return undefined;

		const basePrice = itemData.value;
		if (basePrice <= 0) return undefined;

		return math.max(1, math.ceil(basePrice * 2));
	}, [itemData]);

	if (!itemData || directPurchasePrice === undefined) {
		return (
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} Position={position}>
				<TextLabel
					weight="SemiBold"
					typeface="Sans"
					native={{
						Position: new UDim2(0.5, 0, 0.5, 0),
						AnchorPoint: new Vector2(0.5, 0.5),
						Size: new UDim2(0, px(420), 0, px(25)),
						Text: "Direct buy is unavailable for this item.",
						TextColor3: palette.midText,
						TextSize: px(20),
					}}
				/>
			</frame>
		);
	}

	return (
		<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 1, 0)} Position={position}>
			<ItemPageReseller
				title={replacePlaceholder(MARKETPLACE_INITIAL_BUY_BUTTON, "{{price}}", addCommasToNumber(directPurchasePrice))}
				subtitle={`${itemData.name} direct purchase (+100% fee)`}
				image={`rbxthumb://type=Asset&id=${itemData.asset_id}&w=420&h=420`}
				buttonIcon="rbxassetid://11833005733"
				buttonText="Purchase"
				LayoutOrder={0}
				activated={() => {
					if (currentConfirmationPrompt.listing || currentConfirmationPrompt.directItemId) return;

					setCurrentConfirmationPrompt({
						enabled: true,
						listing: undefined,
						directItemId: itemData.id,
						directItemName: itemData.name,
						directPrice: directPurchasePrice,
					});

					confirmationPromptTransparencyMotion.tween(0, {
						time: 0.15,
						style: Enum.EasingStyle.Quad,
						direction: Enum.EasingDirection.Out,
					});
					confirmationPromptBGTransparencyMotion.tween(0.1, {
						time: 0.15,
						style: Enum.EasingStyle.Quad,
						direction: Enum.EasingDirection.Out,
					});
				}}
			/>
			<TextLabel
				weight="Medium"
				typeface="Sans"
				native={{
					Position: new UDim2(0, px(4), 0, px(83)),
					Size: new UDim2(1, -px(8), 0, px(16)),
					Text: "Direct purchases charge a fixed 100% fee over item value.",
					TextColor3: palette.darkerText,
					TextSize: px(14),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
		</frame>
	);
}