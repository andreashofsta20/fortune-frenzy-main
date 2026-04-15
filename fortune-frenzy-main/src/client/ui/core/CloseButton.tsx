import React, { useMemo } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { menuUpscaledAtom } from "client/utils/global-state";
import { isTutorialBlockingMenuClose } from "client/tutorial/tutorial-state";
import { MOBILE_TOOLBAR_ICON_MIN_PX } from "client/utils/menu-mobile-upscale";
import { useTouchMenuMobile } from "client/hooks/use-touch-menu-mobile";
import buttonClick from "client/utils/ui-effects/button-click";

/** Matches public NovawareRBX/fortune-frenzy CloseButton: Fit icons; touch-small UI uses larger hit areas. */
const CLOSE_CLICK_SOUND = "rbxassetid://96092607153311";

const defaultImageButtonProps: Partial<React.InstanceProps<ImageButton>> = {
	BackgroundTransparency: 1,
	ImageColor3: Color3.fromRGB(211, 211, 211),
	ScaleType: Enum.ScaleType.Fit,
};

interface Props {
	native?: React.InstanceProps<ImageButton>;
	event?: React.InstanceEvent<ImageButton>;
	change?: React.InstanceChangeEvent<ImageButton>;
	image?: string;
	showUpscaleButton?: boolean;
	upscaleImage?: string;
}

function mergeNative(native?: React.InstanceProps<ImageButton>): React.InstanceProps<ImageButton> {
	return { ...defaultImageButtonProps, ...native } as React.InstanceProps<ImageButton>;
}

function mergeCloseEvent(
	event: React.InstanceEvent<ImageButton> | undefined,
): React.InstanceEvent<ImageButton> | undefined {
	const userActivated = event?.Activated;
	if (!userActivated) {
		return {
			Activated: () => {
				if (isTutorialBlockingMenuClose()) return;
				buttonClick(CLOSE_CLICK_SOUND, 0.7);
			},
		};
	}
	return {
		...event,
		Activated: (...args: Parameters<NonNullable<typeof userActivated>>) => {
			if (isTutorialBlockingMenuClose()) return;
			buttonClick(CLOSE_CLICK_SOUND, 0.7);
			userActivated(...args);
		},
	};
}

/** Pixel gap between upscale and close in the toolbar row. */
function gapBetweenIcons(visualWidth: number): number {
	return math.max(10, math.min(24, math.floor(visualWidth * 0.76 + 0.5)));
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
	const touchMenuMobile = useTouchMenuMobile();
	const resolvedUpscaleImage = upscaled ? "rbxassetid://82001248062352" : upscaleImage;

	const closePositionRaw = native?.Position ?? new UDim2();
	const closeSize = native?.Size ?? new UDim2(0, 21, 0, 21);
	const closeAnchorRaw = native?.AnchorPoint ?? new Vector2();
	const closePosition = typeIs(closePositionRaw, "UDim2") ? closePositionRaw : new UDim2();
	const closeAnchorPoint = typeIs(closeAnchorRaw, "Vector2") ? closeAnchorRaw : new Vector2();
	const closeVisible = native?.Visible ?? true;
	const closeZIndex = native?.ZIndex ?? 50;
	const rawCloseImage = native?.Image;
	const closeImage = typeIs(rawCloseImage, "string") && rawCloseImage !== "" ? rawCloseImage : image;

	const resolvedCloseSize = (typeIs(closeSize, "UDim2") ? closeSize : closeSize) as UDim2;
	const baseW = resolvedCloseSize.X.Offset;
	const baseH = resolvedCloseSize.Y.Offset;
	const iconW = touchMenuMobile ? math.max(baseW, MOBILE_TOOLBAR_ICON_MIN_PX) : baseW;
	const iconH = touchMenuMobile ? math.max(baseH, MOBILE_TOOLBAR_ICON_MIN_PX) : baseH;
	const upscaleVisualSize = new UDim2(
		resolvedCloseSize.X.Scale,
		iconW,
		resolvedCloseSize.Y.Scale,
		iconH,
	);

	const gap = gapBetweenIcons(iconW);
	const rowWidth = upscaleVisualSize.X.Offset + gap + iconW;
	const rowHeight = math.max(upscaleVisualSize.Y.Offset, iconH);

	const pinToRight = closeAnchorPoint.X >= 0.5;
	const rowPosition = pinToRight
		? closePosition
		: new UDim2(
				closePosition.X.Scale,
				closePosition.X.Offset - upscaleVisualSize.X.Offset - gap,
				closePosition.Y.Scale,
				closePosition.Y.Offset,
			);
	const rowAnchorPoint = pinToRight ? closeAnchorPoint : new Vector2(0, closeAnchorPoint.Y);

	const closeNativeMerged = useMemo(() => {
		const m = mergeNative(native);
		return {
			...m,
			Size: new UDim2(resolvedCloseSize.X.Scale, iconW, resolvedCloseSize.Y.Scale, iconH),
			Image: closeImage,
		} as React.InstanceProps<ImageButton>;
	}, [native, resolvedCloseSize, closeImage, iconW, iconH]);

	/** List layout owns placement; strip absolute Position/AnchorPoint from callers. */
	const closeNativeForRow = useMemo(() => {
		return {
			...closeNativeMerged,
			Position: new UDim2(0, 0, 0, 0),
			AnchorPoint: new Vector2(0, 0),
		} as React.InstanceProps<ImageButton>;
	}, [closeNativeMerged]);

	const closeEventMerged = useMemo(() => mergeCloseEvent(event), [event]);

	if (showUpscaleButton) {
		return (
			<frame
				BackgroundTransparency={1}
				Position={rowPosition}
				AnchorPoint={rowAnchorPoint}
				Size={new UDim2(0, rowWidth, 0, rowHeight)}
				Visible={closeVisible}
				ZIndex={closeZIndex}
			>
				<uilistlayout
					FillDirection={Enum.FillDirection.Horizontal}
					HorizontalAlignment={pinToRight ? Enum.HorizontalAlignment.Right : Enum.HorizontalAlignment.Left}
					VerticalAlignment={Enum.VerticalAlignment.Center}
					Padding={new UDim(0, gap)}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{pinToRight ? (
					<>
						<imagebutton
							BackgroundTransparency={1}
							ImageColor3={defaultImageButtonProps.ImageColor3}
							ScaleType={Enum.ScaleType.Fit}
							Image={resolvedUpscaleImage}
							Size={upscaleVisualSize}
							LayoutOrder={0}
							Event={{
								Activated: () => {
									buttonClick(CLOSE_CLICK_SOUND, 0.7);
									menuUpscaledAtom(!upscaled);
								},
							}}
						/>
						<imagebutton
							{...closeNativeForRow}
							LayoutOrder={1}
							Event={closeEventMerged}
							Change={change}
						/>
					</>
				) : (
					<>
						<imagebutton
							{...closeNativeForRow}
							LayoutOrder={0}
							Event={closeEventMerged}
							Change={change}
						/>
						<imagebutton
							BackgroundTransparency={1}
							ImageColor3={defaultImageButtonProps.ImageColor3}
							ScaleType={Enum.ScaleType.Fit}
							Image={resolvedUpscaleImage}
							Size={upscaleVisualSize}
							LayoutOrder={1}
							Event={{
								Activated: () => {
									buttonClick(CLOSE_CLICK_SOUND, 0.7);
									menuUpscaledAtom(!upscaled);
								},
							}}
						/>
					</>
				)}
			</frame>
		);
	}

	return (
		<imagebutton {...closeNativeMerged} Event={closeEventMerged} Change={change} />
	);
}
