import React, { useEffect, useRef, useState } from "@rbxts/react";
import { createPortal } from "@rbxts/react-roblox";
import { useAtom } from "@rbxts/react-charm";
import { RunService, TweenService, Workspace } from "@rbxts/services";
import { coinflipStateAtom, inventoryOverlayStateAtom } from "client/utils/global-state";
import { usePx } from "client/hooks/use-px";
import { usePxScale } from "client/hooks/use-scale";
import { palette } from "client/utils/palette";
import { TextLabel } from "client/ui/core/TextLabel";
import { Corner } from "client/ui/tools/Corner";
import {
	TUTORIAL_NO_HIGHLIGHT_TARGET,
	TUTORIAL_STEPS,
	TUTORIAL_TARGET_IDS,
	getTutorialTarget,
	tutorialPurchasedItemIdAtom,
	tutorialStateAtom,
} from "./tutorial-state";

const OVERLAY_ZINDEX = 500;
const PANEL_ZINDEX = OVERLAY_ZINDEX + 20;
const HIGHLIGHT_ZINDEX = OVERLAY_ZINDEX + 10;

type HighlightRect = {
	x: number;
	y: number;
	width: number;
	height: number;
};

function getViewportSize() {
	const camera = Workspace.CurrentCamera;
	if (camera) return camera.ViewportSize;
	return new Vector2(1920, 1080);
}

function toHighlightRect(target: GuiObject, overlayFrame?: Frame): HighlightRect {
	const padding = 4;
	const overlayOffset = overlayFrame ? overlayFrame.AbsolutePosition : new Vector2(0, 0);

	const absolutePosition = target.AbsolutePosition;
	const relativeX = absolutePosition.X - overlayOffset.X;
	const relativeY = absolutePosition.Y - overlayOffset.Y;

	const absoluteSize = target.AbsoluteSize;

	return {
		x: math.max(0, relativeX - padding),
		y: math.max(0, relativeY - padding),
		width: absoluteSize.X + padding * 2,
		height: absoluteSize.Y + padding * 2,
	};
}

export function TutorialOverlay() {
	const px = usePx();
	const pxScale = usePxScale();
	const overlayRef = useRef<Frame>();
	const tutorialState = useAtom(tutorialStateAtom);
	const coinflipState = useAtom(coinflipStateAtom);
	const inventoryOverlay = useAtom(inventoryOverlayStateAtom);
	const tutorialPurchasedId = useAtom(tutorialPurchasedItemIdAtom);
	const [highlightTarget, setHighlightTarget] = useState<GuiObject | undefined>(undefined);
	const [highlightRect, setHighlightRect] = useState<HighlightRect | undefined>(undefined);
	const [outerStroke, setOuterStroke] = useState<UIStroke | undefined>(undefined);
	const [innerStroke, setInnerStroke] = useState<UIStroke | undefined>(undefined);

	useEffect(() => {
		if (!tutorialState.active) {
			setHighlightTarget(undefined);
			setHighlightRect(undefined);
			setOuterStroke(undefined);
			setInnerStroke(undefined);
			return;
		}

		const updateHighlight = () => {
			const step = TUTORIAL_STEPS[tutorialState.stepIndex];
			if (!step) {
				setHighlightTarget(undefined);
				setHighlightRect(undefined);
				setOuterStroke(undefined);
				setInnerStroke(undefined);
				return;
			}

			const stakeSelectionUi =
				step.actionId === "coinflip_create_complete" &&
				coinflipState === "create" &&
				inventoryOverlay?.visible === true;

			if (stakeSelectionUi) {
				if (tutorialPurchasedId && tutorialPurchasedId.size() > 0) {
					const target = getTutorialTarget(TUTORIAL_TARGET_IDS.coinflipStakePurchasedItem);
					if (!target || !target.IsDescendantOf(game)) {
						setHighlightTarget(undefined);
						setHighlightRect(undefined);
						setOuterStroke(undefined);
						setInnerStroke(undefined);
						return;
					}
					setHighlightTarget(target);
					setHighlightRect(toHighlightRect(target, overlayRef.current));
				} else {
					setHighlightTarget(undefined);
					setHighlightRect(undefined);
					setOuterStroke(undefined);
					setInnerStroke(undefined);
				}
				return;
			}

			const target = getTutorialTarget(step.targetId);
			if (!target || !target.IsDescendantOf(game)) {
				setHighlightTarget(undefined);
				setHighlightRect(undefined);
				setOuterStroke(undefined);
				setInnerStroke(undefined);
				return;
			}

			setHighlightTarget(target);
			setHighlightRect(toHighlightRect(target, overlayRef.current));
		};

		updateHighlight();
		const connection = RunService.RenderStepped.Connect(updateHighlight);
		return () => connection.Disconnect();
	}, [
		tutorialState.active,
		tutorialState.stepIndex,
		coinflipState,
		inventoryOverlay,
		tutorialPurchasedId,
	]);

	useEffect(() => {
		if (!tutorialState.active) return;

		let outerTween: Tween | undefined;
		let innerTween: Tween | undefined;

		if (outerStroke) {
			const targetTransparency = math.max(0, outerStroke.Transparency - 0.2);
			const targetThickness = outerStroke.Thickness + px(1);
			outerTween = TweenService.Create(
				outerStroke,
				new TweenInfo(0.85, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
				{
					Transparency: targetTransparency,
					Thickness: targetThickness,
				},
			);
			outerTween.Play();
		}

		if (innerStroke) {
			const targetTransparency = math.max(0, innerStroke.Transparency - 0.08);
			const targetThickness = innerStroke.Thickness + px(1);
			innerTween = TweenService.Create(
				innerStroke,
				new TweenInfo(0.85, Enum.EasingStyle.Sine, Enum.EasingDirection.InOut, -1, true),
				{
					Transparency: targetTransparency,
					Thickness: targetThickness,
				},
			);
			innerTween.Play();
		}

		return () => {
			outerTween?.Cancel();
			innerTween?.Cancel();
		};
	}, [tutorialState.active, outerStroke, innerStroke, px]);

	if (!tutorialState.active && !tutorialState.completionPending) {
		return undefined;
	}

	const step = tutorialState.active ? TUTORIAL_STEPS[tutorialState.stepIndex] : undefined;
	const suppressTutorialDim =
		tutorialState.active &&
		step !== undefined &&
		step.actionId === "coinflip_create_complete" &&
		coinflipState === "create" &&
		inventoryOverlay?.visible === true;
	const fullscreenTutorialDim =
		tutorialState.active &&
		step !== undefined &&
		step.targetId === TUTORIAL_NO_HIGHLIGHT_TARGET &&
		!suppressTutorialDim;
	const hasHighlight = tutorialState.active && highlightTarget !== undefined;

	const panelTitle = tutorialState.completionPending ? "Finishing Tutorial" : (step?.title ?? "Loading Tutorial");
	const panelDescription = tutorialState.completionPending
		? "Applying your completion bonus rewards..."
		: (step?.description ?? "Preparing the next tutorial step...");
	const progressLabel = tutorialState.completionPending
		? `${TUTORIAL_STEPS.size()} / ${TUTORIAL_STEPS.size()}`
		: `${math.min(tutorialState.stepIndex + 1, TUTORIAL_STEPS.size())} / ${TUTORIAL_STEPS.size()}`;
	const viewportSize = getViewportSize();
	const overlayWidth = math.max(0, math.floor(overlayRef.current?.AbsoluteSize.X ?? viewportSize.X));
	const overlayHeight = math.max(0, math.floor(overlayRef.current?.AbsoluteSize.Y ?? viewportSize.Y));
	const glowOuterThickness = px(3);
	const glowOuterTransparency = 0.6;
	const glowInnerThickness = px(2);
	const glowInnerTransparency = 0.1;
	const glowOuterColor = Color3.fromRGB(80, 150, 255);
	const glowInnerColor = Color3.fromRGB(165, 220, 255);
	const overlayColor = Color3.fromRGB(6, 9, 16);
	const overlayTransparency = 0.55;
	const hasHighlightRect =
		!suppressTutorialDim && hasHighlight && highlightRect !== undefined;
	const holeLeft = hasHighlightRect ? math.clamp(math.floor(highlightRect!.x), 0, overlayWidth) : 0;
	const holeTop = hasHighlightRect ? math.clamp(math.floor(highlightRect!.y), 0, overlayHeight) : 0;
	const holeRight = hasHighlightRect
		? math.clamp(math.ceil(highlightRect!.x + highlightRect!.width), 0, overlayWidth)
		: overlayWidth;
	const holeBottom = hasHighlightRect
		? math.clamp(math.ceil(highlightRect!.y + highlightRect!.height), 0, overlayHeight)
		: overlayHeight;
	const topHeight = hasHighlightRect ? holeTop : 0;
	const middleY = hasHighlightRect ? holeTop : 0;
	const middleHeight = hasHighlightRect ? math.max(0, holeBottom - holeTop) : 0;
	const leftWidth = hasHighlightRect ? holeLeft : 0;
	const rightX = hasHighlightRect ? holeRight : overlayWidth;
	const rightWidth = hasHighlightRect ? math.max(0, overlayWidth - holeRight) : 0;
	const bottomY = hasHighlightRect ? holeBottom : overlayHeight;
	const bottomHeight = hasHighlightRect ? math.max(0, overlayHeight - holeBottom) : 0;
	let highlightPortal: React.ReactNode | undefined;
	if (hasHighlight && highlightTarget) {
		highlightPortal = createPortal(
			<>
				<uistroke
					ref={setOuterStroke}
					Color={glowOuterColor}
					Thickness={glowOuterThickness}
					Transparency={glowOuterTransparency}
					ApplyStrokeMode={Enum.ApplyStrokeMode.Border}
					LineJoinMode={Enum.LineJoinMode.Round}
				/>
				<uistroke
					ref={setInnerStroke}
					Color={glowInnerColor}
					Thickness={glowInnerThickness}
					Transparency={glowInnerTransparency}
					ApplyStrokeMode={Enum.ApplyStrokeMode.Border}
					LineJoinMode={Enum.LineJoinMode.Round}
				/>
			</>,
			highlightTarget,
		);
	}

	return (
		<frame ref={overlayRef} BackgroundTransparency={1} Size={UDim2.fromScale(1, 1)} ZIndex={OVERLAY_ZINDEX}>
			{tutorialState.active && fullscreenTutorialDim ? (
				<frame
					BackgroundColor3={overlayColor}
					BackgroundTransparency={overlayTransparency}
					BorderSizePixel={0}
					Size={UDim2.fromScale(1, 1)}
					Position={UDim2.fromOffset(0, 0)}
					ZIndex={OVERLAY_ZINDEX}
					Active={false}
					Selectable={false}
				/>
			) : undefined}
			{tutorialState.active && hasHighlightRect ? (
				<>
					<frame
						BackgroundColor3={overlayColor}
						BackgroundTransparency={overlayTransparency}
						BorderSizePixel={0}
						Size={UDim2.fromOffset(overlayWidth, topHeight)}
						Position={UDim2.fromOffset(0, 0)}
						ZIndex={OVERLAY_ZINDEX}
						Active={false}
						Selectable={false}
					/>
					<frame
						BackgroundColor3={overlayColor}
						BackgroundTransparency={overlayTransparency}
						BorderSizePixel={0}
						Size={UDim2.fromOffset(leftWidth, middleHeight)}
						Position={UDim2.fromOffset(0, middleY)}
						ZIndex={OVERLAY_ZINDEX}
						Active={false}
						Selectable={false}
					/>
					<frame
						BackgroundColor3={overlayColor}
						BackgroundTransparency={overlayTransparency}
						BorderSizePixel={0}
						Size={UDim2.fromOffset(rightWidth, middleHeight)}
						Position={UDim2.fromOffset(rightX, middleY)}
						ZIndex={OVERLAY_ZINDEX}
						Active={false}
						Selectable={false}
					/>
					<frame
						BackgroundColor3={overlayColor}
						BackgroundTransparency={overlayTransparency}
						BorderSizePixel={0}
						Size={UDim2.fromOffset(overlayWidth, bottomHeight)}
						Position={UDim2.fromOffset(0, bottomY)}
						ZIndex={OVERLAY_ZINDEX}
						Active={false}
						Selectable={false}
					/>
				</>
			) : undefined}
			{highlightPortal}

			<frame
				BackgroundColor3={palette.background2}
				Position={new UDim2(0.5, 0, 1, -px(24))}
				Size={new UDim2(0, px(680), 0, px(150))}
				AnchorPoint={new Vector2(0.5, 1)}
				ZIndex={PANEL_ZINDEX}
			>
				<uiscale Scale={pxScale()} />
				<Corner roundness="small" />
				<uistroke Color={Color3.fromRGB(63, 76, 112)} Thickness={px(1)} />
				<frame
					BackgroundColor3={Color3.fromRGB(66, 118, 234)}
					BackgroundTransparency={0.15}
					Size={new UDim2(0, px(10), 1, 0)}
					Position={new UDim2(0, 0, 0, 0)}
					ZIndex={PANEL_ZINDEX + 1}
				>
					<Corner roundness="small" />
				</frame>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: `Step ${progressLabel}`,
						TextSize: px(16),
						Position: new UDim2(0, px(26), 0, px(12)),
						Size: new UDim2(0, px(180), 0, px(18)),
						TextColor3: Color3.fromRGB(160, 199, 255),
						TextXAlignment: Enum.TextXAlignment.Left,
						ZIndex: PANEL_ZINDEX + 2,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: panelTitle,
						TextSize: px(24),
						Position: new UDim2(0, px(24), 0, px(34)),
						Size: new UDim2(1, -px(48), 0, px(30)),
						TextColor3: palette.primaryText,
						TextXAlignment: Enum.TextXAlignment.Left,
						ZIndex: PANEL_ZINDEX + 2,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						Text: panelDescription,
						TextSize: px(18),
						Position: new UDim2(0, px(24), 0, px(70)),
						Size: new UDim2(1, -px(48), 0, px(52)),
						TextColor3: palette.midText,
						TextXAlignment: Enum.TextXAlignment.Left,
						TextYAlignment: Enum.TextYAlignment.Top,
						ZIndex: PANEL_ZINDEX + 2,
					}}
				/>
			</frame>
		</frame>
	);
}
