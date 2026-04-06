import React, { memo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { CaseBattleCase } from "typings/APIResponses";
import { TextLabel } from "../core/TextLabel";
import { palette } from "client/utils/palette";
import { addCommasToNumber } from "shared/util/number-utils";

export const CaseSelectorTile = memo(
	({
		caseData,
		layoutOrder,
		activated,
	}: {
		caseData: CaseBattleCase;
		layoutOrder: number;
		activated: () => void;
	}) => {
		const px = usePx();

		return (
			<imagebutton
				Image={"rbxassetid://86817020373131"}
				BackgroundTransparency={1}
				LayoutOrder={layoutOrder}
				Event={{
					Activated: activated,
				}}
			>
				<imagelabel
					Image={caseData.image}
					BackgroundTransparency={1}
					Size={new UDim2(0, px(100), 0, px(100))}
					Position={new UDim2(0.5, 0, 0.5, -px(25))}
					AnchorPoint={new Vector2(0.5, 0.5)}
					ScaleType={Enum.ScaleType.Fit}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Size: new UDim2(1, -px(25), 0, px(20)),
						Position: new UDim2(0.5, 0, 1, -px(28)),
						AnchorPoint: new Vector2(0.5, 1),
						BackgroundTransparency: 1,
						Text: caseData.name,
						TextSize: px(20),
						TextColor3: palette.primaryText,
						TextTruncate: Enum.TextTruncate.SplitWord,
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Size: new UDim2(1, -px(25), 0, px(15)),
						Position: new UDim2(0.5, 0, 1, -px(10)),
						AnchorPoint: new Vector2(0.5, 1),
						BackgroundTransparency: 1,
						Text: `$${addCommasToNumber(caseData.price)}`,
						TextSize: px(15),
						TextColor3: palette.primaryText,
						TextTruncate: Enum.TextTruncate.SplitWord,
						TextXAlignment: Enum.TextXAlignment.Left,
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
			</imagebutton>
		);
	},
);
