import { useMotion } from "@rbxts/pretty-react-hooks";
import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { LoadingCircle } from "client/ui/core/LoadingCircle";
import { isLoadingAtom } from "client/utils/global-state";
import { useAtom } from "@rbxts/react-charm";

export function LoadingScreen() {
	const px = usePx();
	const loadingEnabled = useAtom(isLoadingAtom);

	const [overlayTransparency, overlayTransparencyMotion] = useMotion(1);
	const [spinnerTransparency, spinnerTransparencyMotion] = useMotion(1);

	const tweenConfig = useMemo(
		() => ({
			time: 0.4,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		}),
		[],
	);

	// keep component mounted for fade-out
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		if (loadingEnabled) {
			setVisible(true);
			overlayTransparencyMotion.immediate(1);
			spinnerTransparencyMotion.immediate(1);

			overlayTransparencyMotion.tween(0.35, tweenConfig);
			spinnerTransparencyMotion.tween(0, tweenConfig);
		} else if (visible) {
			overlayTransparencyMotion.tween(1, tweenConfig);
			spinnerTransparencyMotion.tween(1, tweenConfig);

			task.delay(tweenConfig.time, () => setVisible(false));
		}
	}, [loadingEnabled, visible]);

	if (!visible) return undefined;

	return (
		<frame
			BackgroundColor3={new Color3(0, 0, 0)}
			BackgroundTransparency={overlayTransparency}
			Size={new UDim2(1, 0, 1, 0)}
			ZIndex={10}
		>
			<LoadingCircle
				Size={new UDim2(0, px(60), 0, px(60))}
				AnchorPoint={new Vector2(0.5, 0.5)}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				ImageTransparency={spinnerTransparency}
			/>
		</frame>
	);
}

export default React.memo(LoadingScreen);
