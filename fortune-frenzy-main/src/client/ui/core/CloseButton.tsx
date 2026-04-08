import React from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { menuUpscaledAtom } from "client/utils/global-state";

interface Props {
	native?: React.InstanceProps<ImageButton>;
	event?: React.InstanceEvent<ImageButton>;
	change?: React.InstanceChangeEvent<ImageButton>;
	image?: string;
	showUpscaleButton?: boolean;
	upscaleImage?: string;
}

export function CloseButton({
	native,
	event,
	change,
	image = "rbxassetid://11848178846",
	showUpscaleButton = true,
	upscaleImage = "rbxassetid://130405471808597",
}: Props) {
	const upscaled = useAtom(menuUpscaledAtom);
	const resolvedUpscaleImage = upscaled ? "rbxassetid://82001248062352" : upscaleImage;
	const closePosition = native?.Position ?? new UDim2();
	const closeSize = native?.Size ?? new UDim2(0, 21, 0, 21);
	const closeAnchorPoint = native?.AnchorPoint ?? new Vector2();
	const closeVisible = native?.Visible ?? true;
	const closeZIndex = native?.ZIndex ?? 20;
	const upscalePosition = typeIs(closePosition, "UDim2")
		? new UDim2(closePosition.X.Scale, closePosition.X.Offset - 37, closePosition.Y.Scale, closePosition.Y.Offset + 3)
		: new UDim2(0, -37, 0, 3);

	return (
		<>
			<imagebutton
				BackgroundTransparency={1}
				Image={image}
				ImageTransparency={0}
				ScaleType={Enum.ScaleType.Stretch}
				Position={closePosition}
				Size={closeSize}
				AnchorPoint={closeAnchorPoint}
				Visible={closeVisible}
				ZIndex={closeZIndex}
				Event={event}
				Change={change}
			/>
			{showUpscaleButton ? (
				<imagebutton
					BackgroundTransparency={1}
					Image={resolvedUpscaleImage}
					ImageTransparency={0}
					ScaleType={Enum.ScaleType.Stretch}
					Size={closeSize}
					Position={upscalePosition}
					AnchorPoint={closeAnchorPoint}
					Visible={closeVisible}
					ZIndex={closeZIndex}
					Event={{
						Activated: () => {
							menuUpscaledAtom(!upscaled);
						},
					}}
				/>
			) : undefined}
		</>
	);
}
