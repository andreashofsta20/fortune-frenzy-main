import React, { useCallback, useMemo, useState, useEffect } from "@rbxts/react";
import buttonClick from "client/utils/ui-effects/button-click";
import { UserInputService, Workspace } from "@rbxts/services";
import {
	TutorialActionId,
	isTutorialInteractionBlocked,
	registerTutorialTarget,
	unregisterTutorialTarget,
} from "client/tutorial/tutorial-state";

interface Props extends React.PropsWithChildren {
	native?: React.InstanceProps<ImageButton>;
	event?: React.InstanceEvent<ImageButton>;
	change?: React.InstanceChangeEvent<ImageButton>;
	ref?: React.Ref<ImageButton>;
	image?: string;
	tutorialActionId?: TutorialActionId;
	tutorialTargetId?: string;
}

const BASE_RESOLUTION = new Vector2(1367, 796);
const MIN_TOUCH_TARGET_PIXELS = 44;

function calculateViewportScale(viewport: Vector2): number {
	const widthRatio = BASE_RESOLUTION.X / viewport.X;
	const heightRatio = BASE_RESOLUTION.Y / viewport.Y;
	const limitingFactor = math.max(widthRatio, heightRatio);
	return 1 / limitingFactor;
}

function CloseButtonComponent({
	children,
	native,
	event,
	change,
	ref,
	image,
	tutorialActionId,
	tutorialTargetId,
}: Props) {
	const [buttonInstance, setButtonInstance] = useState<ImageButton | undefined>(undefined);

	useEffect(() => {
		if (!tutorialTargetId || !buttonInstance) return;
		registerTutorialTarget(tutorialTargetId, buttonInstance);

		return () => {
			unregisterTutorialTarget(tutorialTargetId, buttonInstance);
		};
	}, [tutorialTargetId, buttonInstance]);

	const setCombinedRef = (instance?: ImageButton) => {
		setButtonInstance(instance);

		if (!ref) return;
		if (typeIs(ref, "function")) {
			ref(instance);
			return;
		}

		(ref as { current?: ImageButton }).current = instance;
	};

	const defaultProps: React.InstanceProps<ImageButton> = {
		BackgroundTransparency: 1,
		ImageColor3: Color3.fromRGB(211, 211, 211),
		ScaleType: Enum.ScaleType.Fit,
	};

	const touchHitboxSize = useMemo(() => {
		if (!UserInputService.TouchEnabled) return undefined;

		const camera = Workspace.CurrentCamera;
		if (!camera) return new UDim2(0, MIN_TOUCH_TARGET_PIXELS, 0, MIN_TOUCH_TARGET_PIXELS);

		const viewportScale = math.max(calculateViewportScale(camera.ViewportSize), 0.2);
		const scaledMinimumTarget = math.ceil(MIN_TOUCH_TARGET_PIXELS / viewportScale);

		const requestedSize = native?.Size;
		if (requestedSize && typeIs(requestedSize, "UDim2")) {
			return new UDim2(
				requestedSize.X.Scale,
				math.max(requestedSize.X.Offset, scaledMinimumTarget),
				requestedSize.Y.Scale,
				math.max(requestedSize.Y.Offset, scaledMinimumTarget),
			);
		}

		return new UDim2(0, scaledMinimumTarget, 0, scaledMinimumTarget);
	}, [native?.Size]);

	const handleActivated = useCallback(
		(rbx: ImageButton, inputObject: InputObject, clickCount: number) => {
			if (isTutorialInteractionBlocked(tutorialActionId)) return;
			buttonClick("rbxassetid://96092607153311", 0.7);
			event?.Activated?.(rbx, inputObject, clickCount);
		},
		[event?.Activated, tutorialActionId],
	);

	return (
		<imagebutton
			Image={image ?? "rbxassetid://11848178846"}
			Event={{
				...event,
				Activated: handleActivated,
			}}
			Change={change ?? {}}
			ref={setCombinedRef}
			{...defaultProps}
			{...native}
		>
			{touchHitboxSize ? (
				<textbutton
					Text={""}
					AutoButtonColor={false}
					BackgroundTransparency={1}
					Selectable={false}
					Size={touchHitboxSize}
					Position={new UDim2(0.5, 0, 0.5, 0)}
					AnchorPoint={new Vector2(0.5, 0.5)}
					ZIndex={typeIs(native?.ZIndex, "number") ? native.ZIndex + 1 : 2}
					Event={{
						TouchTap: (button) => {
							const parentButton = button.Parent;
							if (parentButton?.IsA("GuiButton")) {
								handleActivated(parentButton as ImageButton, undefined as never, 1);
							}
						},
					}}
				/>
			) : undefined}
			{children}
		</imagebutton>
	);
}

export const CloseButton = React.memo(CloseButtonComponent);
