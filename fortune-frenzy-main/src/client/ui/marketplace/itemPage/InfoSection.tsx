import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { SectionStroke } from "../../tools/SectionStroke";
import { Item } from "typings/APIResponses";
import { TextLabel } from "../../core/TextLabel";
import { usePxScale } from "client/hooks/use-scale";
import { Corner } from "client/ui/tools/Corner";

interface Props {
	data:
		| {
				data: Item;
				rarity: string;
		  }
		| undefined;
}

export function ItemPageInfoSection({ data }: Props) {
	const px = usePx();
	const pxScale = usePxScale();
	const displayName = data?.data.name !== undefined && data.data.name !== "" ? data.data.name : "Unknown";
	const subtitleText = "Limited Collectible";

	return (
		<frame
			AnchorPoint={new Vector2(0, 0.5)}
			BackgroundColor3={palette.background2}
			BackgroundTransparency={0}
			Size={new UDim2(0, px(207), 0, px(340))}
			Position={new UDim2(0, px(20), 0, px(193))}
		>
			<Corner roundness="small" />
			<uilistlayout
				Padding={new UDim(0, px(-5))}
				HorizontalAlignment={Enum.HorizontalAlignment.Center}
				SortOrder={Enum.SortOrder.LayoutOrder}
				VerticalAlignment={Enum.VerticalAlignment.Center}
			/>
			<SectionStroke />
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(20))} LayoutOrder={3} />
			<imagelabel
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(124), 0, px(124))}
				LayoutOrder={1}
				Image={`rbxthumb://type=Asset&id=${data?.data.asset_id || "0"}&w=420&h=420`}
				BackgroundTransparency={1}
			/>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					TextColor3: palette.primaryText,
					AutomaticSize: Enum.AutomaticSize.Y,
					Size: new UDim2(0, px(163), 0, 0),
					Text: displayName,
					TextSize: px(23),
					LayoutOrder: 2,
				}}
			/>
			{data !== undefined ? (
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						TextColor3: palette.midText,
						AutomaticSize: Enum.AutomaticSize.Y,
						Size: new UDim2(0, px(157), 0, 0),
						Text: subtitleText,
						TextSize: px(18),
						LayoutOrder: 4,
						TextTruncate: Enum.TextTruncate.AtEnd,
					}}
				>
					<uisizeconstraint MaxSize={new Vector2(math.huge, px(120) * pxScale())} />
				</TextLabel>
			) : undefined}
		</frame>
	);
}
