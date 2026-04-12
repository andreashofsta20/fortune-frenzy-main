import React from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { menuUpscaledAtom } from "client/utils/global-state";
import { UserInputService } from "@rbxts/services";

const IS_TOUCH = UserInputService.TouchEnabled;
const MIN_TAP_TARGET = 48;

interface Props {
	native?: React.InstanceProps<ImageButton>;
	event?: React.InstanceEvent<ImageButton>;
	change?: React.InstanceChangeEvent<ImageButton>;
	image?: string;
	showUpscaleButton?: boolean;
	upscaleImage?: string;
}

function makeTapTarget(visualSize: UDim2): { hitSize: UDim2; iconSize: UDim2; needsWrapper: boolean } {
	if (!IS_TOUCH) return { hitSize: visualSize, iconSize: visualSize, needsWrapper: false };

	const padX = math.max(0, MIN_TAP_TARGET - visualSize.X.Offset);
	const padY = math.max(0, MIN_TAP_TARGET - visualSize.Y.Offset);
	if (padX === 0 && padY === 0) return { hitSize: visualSize, iconSize: visualSize, needsWrapper: false };

	return {
		hitSize: new UDim2(visualSize.X.Scale, visualSize.X.Offset + padX, visualSize.Y.Scale, visualSize.Y.Offset + padY),
		iconSize: visualSize,
		needsWrapper: true,
	};
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

	const resolvedCloseSize = (typeIs(closeSize, "UDim2") ? closeSize : closeSize) as UDim2;
	const { hitSize, iconSize, needsWrapper } = makeTapTarget(resolvedCloseSize);

	const upscalePosition = typeIs(closePosition, "UDim2")
		? new UDim2(closePosition.X.Scale, closePosition.X.Offset - 37, closePosition.Y.Scale, closePosition.Y.Offset + 3)
		: new UDim2(0, -37, 0, 3);
	const { hitSize: upscaleHitSize, iconSize: upscaleIconSize, needsWrapper: upscaleNeedsWrapper } = makeTapTarget(hitSize);

	const closeButton = needsWrapper ? (
		<imagebutton
			BackgroundTransparency={1}
			Image={""}
			Position={closePosition}
			Size={hitSize}
			AnchorPoint={closeAnchorPoint}
			Visible={closeVisible}
			ZIndex={closeZIndex}
			Event={event}
			Change={change}
		>
			<imagelabel
				BackgroundTransparency={1}
				Image={image}
				ScaleType={Enum.ScaleType.Stretch}
				Size={iconSize}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
			/>
		</imagebutton>
	) : (
		<imagebutton
			BackgroundTransparency={1}
			Image={image}
			ImageTransparency={0}
			ScaleType={Enum.ScaleType.Stretch}
			Position={closePosition}
			Size={hitSize}
			AnchorPoint={closeAnchorPoint}
			Visible={closeVisible}
			ZIndex={closeZIndex}
			Event={event}
			Change={change}
		/>
	);

	const upscaleButton = showUpscaleButton ? (
		upscaleNeedsWrapper ? (
			<imagebutton
				BackgroundTransparency={1}
				Image={""}
				Size={upscaleHitSize}
				Position={upscalePosition}
				AnchorPoint={closeAnchorPoint}
				Visible={closeVisible}
				ZIndex={closeZIndex}
				Event={{
					Activated: () => {
						menuUpscaledAtom(!upscaled);
					},
				}}
			>
				<imagelabel
					BackgroundTransparency={1}
					Image={resolvedUpscaleImage}
					ScaleType={Enum.ScaleType.Stretch}
					Size={upscaleIconSize}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 0.5, 0)}
				/>
			</imagebutton>
		) : (
			<imagebutton
				BackgroundTransparency={1}
				Image={resolvedUpscaleImage}
				ImageTransparency={0}
				ScaleType={Enum.ScaleType.Stretch}
				Size={upscaleHitSize}
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
		)
	) : undefined;

	return (
		<>
			{closeButton}
			{upscaleButton}
		</>
	);
}
