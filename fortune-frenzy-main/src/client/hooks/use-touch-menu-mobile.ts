import { useCamera, useEventListener } from "@rbxts/pretty-react-hooks";
import { useMemo, useState } from "@rbxts/react";
import { computeIsTouchMenuMobile } from "client/utils/menu-mobile-upscale";

/** True when we should use the stronger mobile menu scale and default upscale-on. */
export function useTouchMenuMobile(): boolean {
	const cam = useCamera();
	const [viewport, setViewport] = useState(cam.ViewportSize);

	useEventListener(cam.GetPropertyChangedSignal("ViewportSize"), () => {
		setViewport(cam.ViewportSize);
	});

	return useMemo(() => computeIsTouchMenuMobile(viewport), [viewport]);
}
