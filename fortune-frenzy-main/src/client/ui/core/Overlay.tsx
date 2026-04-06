import React, { useEffect } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { useMotion } from "client/hooks/use-motion";
import { overlayTransparencyAtom } from "client/utils/global-state";

const ANIMATION_DURATION = 0.25;
const TWEEN_PARAMS = {
	time: ANIMATION_DURATION,
	style: Enum.EasingStyle.Exponential,
	direction: Enum.EasingDirection.Out,
};

function Overlay() {
	const darkOverlayTransparencyState = useAtom(overlayTransparencyAtom);
	const [darkOverlayTransparency, darkOverlayTransparencyMotion] = useMotion(darkOverlayTransparencyState);

	useEffect(() => {
		darkOverlayTransparencyMotion.tween(darkOverlayTransparencyState, TWEEN_PARAMS);
	}, [darkOverlayTransparencyState]);

	if (darkOverlayTransparencyState >= 1) {
		return undefined;
	}

	return (
		<frame
			BackgroundColor3={Color3.fromRGB(0, 0, 0)}
			Transparency={darkOverlayTransparency}
			Size={new UDim2(1, 0, 1, 0)}
			ZIndex={-1}
		/>
	);
}

export default React.memo(Overlay);
