import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { addCommasToNumber } from "shared/util/number-utils";
import { ItemPageSubBox } from "./InfoBox";
import { capitalizeFirstChar } from "shared/util/string-utils";
import { Item } from "typings/APIResponses";
import {
	MARKETPLACE_ITEM_STATS_AVERAGE_PRICE,
	MARKETPLACE_ITEM_STATS_QUANTITY,
	MARKETPLACE_ITEM_STATS_RARITY,
	MARKETPLACE_ITEM_STATS_VALUE,
} from "shared/util/strings";

interface Props {
	data:
		| {
				data: Item;
				rarity: string;
		  }
		| undefined;
}

export function ItemPageStatsSection({ data }: Props) {
	const px = usePx();

	return (
		<frame
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundTransparency={1}
			Position={new UDim2(0.5, 0, 0, px(410))}
			Size={new UDim2(0, px(860), 0, px(70))}
		>
			<uilistlayout
				Padding={new UDim(0, px(10))}
				FillDirection={Enum.FillDirection.Horizontal}
				HorizontalAlignment={Enum.HorizontalAlignment.Center}
				SortOrder={Enum.SortOrder.LayoutOrder}
				VerticalAlignment={Enum.VerticalAlignment.Center}
			/>
			{[
				[MARKETPLACE_ITEM_STATS_QUANTITY, "{{s}} Exist Globally", "rbxassetid://77525717960367"],
				[MARKETPLACE_ITEM_STATS_VALUE, "{{s}}", "rbxassetid://120000048331921"],
				[MARKETPLACE_ITEM_STATS_AVERAGE_PRICE, "${{s}}", "rbxassetid://124386301085688"],
				[MARKETPLACE_ITEM_STATS_RARITY, "{{s}}", "rbxassetid://87151112535180"],
			].map((info, index) => {
				let subtitle = "Unknown";

				switch (info[0]) {
					case MARKETPLACE_ITEM_STATS_QUANTITY:
						subtitle = addCommasToNumber(data?.data.total_unboxed || 0);
						break;
					case MARKETPLACE_ITEM_STATS_VALUE:
						subtitle = addCommasToNumber(data?.data.value || 0);
						break;
					case MARKETPLACE_ITEM_STATS_RARITY:
						subtitle = capitalizeFirstChar(data?.rarity || "");
						break;
					case MARKETPLACE_ITEM_STATS_AVERAGE_PRICE:
						subtitle = addCommasToNumber(data?.data.average_price || 0);
						break;
				}

				return (
					<ItemPageSubBox
						image={info[2]}
						color={palette.blue}
						title={info[0]}
						subtitle={info[1].gsub("{{s}}", subtitle)[0]}
						LayoutOrder={index}
					/>
				);
			})}
		</frame>
	);
}
