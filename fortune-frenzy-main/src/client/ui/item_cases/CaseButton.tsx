import React, { useEffect, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { setValue } from "client/utils/color-utils";
import { palette } from "client/utils/palette";
import { addCommasToNumber } from "shared/util/number-utils";
import { capitalizeFirstChar } from "shared/util/string-utils";
import { Case, Item } from "typings/APIResponses";
import { TextLabel } from "../core/TextLabel";
import { Corner } from "../tools/Corner";
import {
	TutorialActionId,
	advanceTutorialAction,
	isTutorialInteractionBlocked,
	registerTutorialTarget,
	unregisterTutorialTarget,
} from "client/tutorial/tutorial-state";

interface Props {
	caseData: Case;
	LayoutOrder?: number;
	Activated: (rbx: ImageButton, inputObject: InputObject, clickCount: number) => void;
	tutorialActionId?: TutorialActionId;
	tutorialTargetId?: string;
}

export function CaseButton({ caseData, LayoutOrder = 0, Activated, tutorialActionId, tutorialTargetId }: Props) {
	const px = usePx();
	const [buttonInstance, setButtonInstance] = useState<ImageButton | undefined>(undefined);

	useEffect(() => {
		if (!tutorialTargetId || !buttonInstance) return;
		registerTutorialTarget(tutorialTargetId, buttonInstance);

		return () => {
			unregisterTutorialTarget(tutorialTargetId, buttonInstance);
		};
	}, [tutorialTargetId, buttonInstance]);

	return (
		<imagebutton
			ref={setButtonInstance}
			ClipsDescendants={true}
			LayoutOrder={LayoutOrder}
			Event={{
				Activated: (rbx, inputObject, clickCount) => {
					if (isTutorialInteractionBlocked(tutorialActionId)) return;
					Activated(rbx, inputObject, clickCount);
					if (tutorialActionId) {
						advanceTutorialAction(tutorialActionId);
					}
				},
			}}
			BackgroundColor3={setValue(Color3.fromHex(caseData.ui_data.colour), 165)}
		>
			<Corner roundness="small" />
			<uigradient
				Color={
					new ColorSequence([
						new ColorSequenceKeypoint(0, Color3.fromRGB(79, 88, 118)),
						new ColorSequenceKeypoint(1, Color3.fromRGB(105, 117, 156)),
					])
				}
				Rotation={-45}
			/>
			<uistroke Color={setValue(Color3.fromHex(caseData.ui_data.colour), 150)} Thickness={px(1)} />
			<frame Size={new UDim2(1, 0, 1, px(-20))} BackgroundTransparency={1}>
				<uilistlayout
					Padding={new UDim(0, px(3))}
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					VerticalAlignment={Enum.VerticalAlignment.Bottom}
				/>
				<TextLabel
					weight="Bold"
					typeface="Sans"
					native={{
						Text: caseData.id
							.gsub("(%a)(%w*)", (first, rest) => `${first.upper()}${rest}`)[0]
							.gsub("_", " ")[0],
						TextSize: px(20),
						Size: new UDim2(1, 0, 0, px(20)),
						TextColor3: palette.primaryText,
						TextXAlignment: Enum.TextXAlignment.Center,
					}}
				/>
				<TextLabel
					weight="Medium"
					typeface="Sans"
					native={{
						Text: `$${addCommasToNumber(caseData.price)}`,
						TextSize: px(15),
						Size: new UDim2(1, 0, 0, px(15)),
						TextColor3: setValue(Color3.fromHex(caseData.ui_data.colour), 225),
						TextXAlignment: Enum.TextXAlignment.Center,
					}}
				/>
			</frame>
			<imagelabel
				Position={new UDim2(0.5, 0, 0.5, px(-10))}
				Size={new UDim2(0, px(200), 0, px(200))}
				AnchorPoint={new Vector2(0.5, 0.5)}
				BackgroundTransparency={1}
				Image={caseData.ui_data.primary}
				ZIndex={0}
			>
				<uigradient
					Rotation={90}
					Transparency={
						new NumberSequence([
							new NumberSequenceKeypoint(0, 0),
							new NumberSequenceKeypoint(0.538, 0),
							new NumberSequenceKeypoint(0.678, 0.585),
							new NumberSequenceKeypoint(0.879, 0.989),
							new NumberSequenceKeypoint(1, 1),
						])
					}
				/>
			</imagelabel>
			<imagelabel
				Position={new UDim2(0, px(-90), 0.5, 0)}
				Size={new UDim2(0, px(310), 0, px(310))}
				AnchorPoint={new Vector2(0, 0.5)}
				BackgroundTransparency={1}
				Image={"rbxassetid://86092120336165"}
				ImageColor3={setValue(Color3.fromHex(caseData.ui_data.colour), 225)}
				ZIndex={-1}
			/>
		</imagebutton>
	);
}
