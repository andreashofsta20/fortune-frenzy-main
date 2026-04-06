import React, { memo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { addCommasToNumber } from "shared/util/number-utils";
import { TextLabel } from "../core/TextLabel";
import { Button } from "../core/Button";
import { SectionStroke } from "../tools/SectionStroke";
import { Corner } from "../tools/Corner";
import { CaseBattleCase } from "typings/APIResponses";

interface Props {
	caseData: CaseBattleCase;
	quantity: number;
	index: number;
	handleCaseChange: (method: "add" | "sub", caseId: string, quantity: number) => void;
	topEnabled: boolean;
	bottomEnabled: boolean;
}

export const CaseSlot = memo(({ caseData, quantity, index, handleCaseChange, topEnabled, bottomEnabled }: Props) => {
	const px = usePx();

	return (
		<imagelabel
			BackgroundTransparency={1}
			Image={"rbxassetid://132513195251610"}
			ScaleType={Enum.ScaleType.Stretch}
			LayoutOrder={index}
		>
			<imagelabel
				BackgroundTransparency={1}
				Image={caseData.image}
				Position={new UDim2(0, px(14), 0, px(4))}
				Size={new UDim2(0, px(100), 0, px(100))}
				ScaleType={Enum.ScaleType.Fit}
			/>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: caseData.name,
					TextSize: px(20),
					Position: new UDim2(0, px(12), 1, -px(28)),
					Size: new UDim2(0, px(150), 0, px(20)),
					AnchorPoint: new Vector2(0, 1),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.SplitWord,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: `$${addCommasToNumber(caseData.price * quantity)}`,
					TextSize: px(15),
					Position: new UDim2(0, px(12), 1, -px(10)),
					Size: new UDim2(0, px(150), 0, px(15)),
					AnchorPoint: new Vector2(0, 1),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.SplitWord,
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
			<Button
				anchorPoint={new Vector2(1, 0)}
				position={new UDim2(1, -px(13), 0, px(23))}
				size={new UDim2(0, px(32), 0, px(32))}
				backgroundColor={palette.background1}
				text=""
				enabled={topEnabled}
				event={{
					Activated: () => handleCaseChange("add", caseData.id, 1),
				}}
			>
				<SectionStroke />
				<Corner roundness="small" />
				<imagelabel
					Image={"rbxassetid://82058407140864"}
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundTransparency={1}
					Position={UDim2.fromScale(0.5, 0.5)}
					Size={UDim2.fromOffset(17, 17)}
				/>
			</Button>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					AnchorPoint: new Vector2(1, 0.5),
					Position: new UDim2(1, -px(13), 0.5, 0),
					Size: new UDim2(0, px(32), 0, px(32)),
					Text: `x${quantity}`,
					TextSize: px(20),
					TextTransparency: 0.3,
					TextColor3: palette.primaryText,
					TextXAlignment: Enum.TextXAlignment.Center,
				}}
			/>
			<Button
				anchorPoint={new Vector2(1, 1)}
				position={new UDim2(1, -px(13), 1, -px(23))}
				size={new UDim2(0, px(32), 0, px(32))}
				backgroundColor={palette.background1}
				text=""
				enabled={bottomEnabled}
				event={{
					Activated: () => handleCaseChange("sub", caseData.id, 1),
				}}
			>
				<SectionStroke />
				<Corner roundness="small" />
				<imagelabel
					Image={quantity === 1 ? "rbxassetid://92759976976733" : "rbxassetid://119204105465247"}
					AnchorPoint={new Vector2(0.5, 0.5)}
					BackgroundTransparency={1}
					Position={UDim2.fromScale(0.5, 0.5)}
					Size={UDim2.fromOffset(17, 17)}
				/>
			</Button>
		</imagelabel>
	);
});
