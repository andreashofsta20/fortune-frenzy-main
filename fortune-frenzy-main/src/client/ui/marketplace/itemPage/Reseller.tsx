import React, { PropsWithChildren } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { SectionStroke } from "../../tools/SectionStroke";
import { TextLabel } from "../../core/TextLabel";
import { Button } from "../../core/Button";
import { Corner } from "client/ui/tools/Corner";
import { TutorialActionId } from "client/tutorial/tutorial-state";

interface Props extends PropsWithChildren {
	key?: string;
	subtitle: string;
	title: string;
	image: string;
	LayoutOrder: number;
	buttonText: string;
	buttonIcon?: string;
	size?: React.Binding<UDim2>;
	buttonTransparency?: React.Binding<number>;
	buttonBackgroundColor?: Color3;
	buttonTextColor?: Color3;
	activated: (rbx: ImageButton, inputObject: InputObject, clickCount: number) => void;
	tutorialActionId?: TutorialActionId;
	tutorialTargetId?: string;
}

export function ItemPageReseller({
	subtitle,
	title,
	image,
	LayoutOrder,
	activated,
	buttonIcon,
	buttonText,
	children,
	size,
	buttonTransparency,
	buttonBackgroundColor,
	buttonTextColor,
	key,
	tutorialActionId,
	tutorialTargetId,
}: Props) {
	const px = usePx();

	return (
		<frame
			key={key}
			BackgroundColor3={palette.background2}
			Size={size ?? new UDim2(1, 0, 0, px(70))}
			LayoutOrder={LayoutOrder}
			ClipsDescendants={true}
		>
			<SectionStroke />
			<Corner roundness="small" />
			<imagelabel
				BackgroundTransparency={1}
				Position={new UDim2(0, px(42), 0, px(35))}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(48), 0, px(48))}
				Image={image}
				ScaleType={Enum.ScaleType.Fit}
			>
				<uicorner CornerRadius={new UDim(1, 0)} />
			</imagelabel>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: title,
					Size: new UDim2(0, px(390), 0, px(21)),
					Position: new UDim2(0, px(275), 0, px(16)),
					AnchorPoint: new Vector2(0.5, 0),
					TextColor3: palette.primaryText,
					TextSize: px(19),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: subtitle,
					Size: new UDim2(0, px(390), 0, px(13)),
					Position: new UDim2(0, px(275), 0, px(39)),
					AnchorPoint: new Vector2(0.5, 0),
					TextColor3: palette.midText,
					TextSize: px(15),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<Button
				size={new UDim2(0, px(134), 0, px(35))}
				position={new UDim2(0, px(484), 0, px(35))}
				anchorPoint={new Vector2(0, 0.5)}
				text={buttonText}
				typeface="Sans"
				weight="Bold"
				image={buttonIcon}
				imageSize={px(15)}
				imagePadding={px(10)}
				backgroundColor={buttonBackgroundColor ?? palette.blue}
				textColor={buttonTextColor ?? palette.blueText}
				imageColor={buttonTextColor ?? palette.blueText}
				transparency={buttonTransparency ?? 0}
				tutorialActionId={tutorialActionId}
				tutorialTargetId={tutorialTargetId}
				event={{ Activated: activated }}
			/>
			{children}
		</frame>
	);
}
