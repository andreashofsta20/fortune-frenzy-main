import React, { memo, useEffect } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { useMotion } from "client/hooks/use-motion";
import { palette } from "client/utils/palette";

interface Props {
	onClick: () => void;
	canAddMore: boolean;
}

export const EmptySlot = memo(({ onClick, canAddMore }: Props) => {
	const px = usePx();
	const [rotation, rotationMotion] = useMotion(0);
	const [imageColor, imageColorMotion] = useMotion(palette.background6);

	useEffect(() => {
		rotationMotion.tween(canAddMore ? 0 : 45, {
			time: 0.3,
			style: Enum.EasingStyle.Quart,
			direction: Enum.EasingDirection.Out,
		});

		imageColorMotion.tween(canAddMore ? palette.background6 : Color3.fromHex("#22242f"), {
			time: 0.3,
			style: Enum.EasingStyle.Quart,
			direction: Enum.EasingDirection.Out,
		});
	}, [canAddMore, rotationMotion]);

	return (
		<imagebutton
			BackgroundTransparency={1}
			Image={"rbxassetid://84266044016632"}
			ImageColor3={imageColor}
			Event={{
				Activated: () => canAddMore && onClick(),
			}}
			LayoutOrder={7}
		>
			<imagelabel
				BackgroundTransparency={1}
				Image={"rbxassetid://82058407140864"}
				ImageColor3={imageColor}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(25), 0, px(25))}
				Rotation={rotation}
			/>
		</imagebutton>
	);
});
