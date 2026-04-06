import { useCamera, useDebounceState, useEventListener } from "@rbxts/pretty-react-hooks";
import { useMemo } from "@rbxts/react";
const BASE_RESOLUTION = new Vector2(1367, 796);

export interface DeviceScaleFunction {
	(): number;
	viewportSize: <T extends "UDim2" | "Vector2">(dataType: T) => T extends "UDim2" ? UDim2 : Vector2;
}

function calculateScale(viewport: Vector2): number {
	const widthRatio = BASE_RESOLUTION.X / viewport.X;
	const heightRatio = BASE_RESOLUTION.Y / viewport.Y;
	const limitingFactor = math.max(widthRatio, heightRatio);
	const scaleFactor = 1 / limitingFactor;
	return scaleFactor;
}

export function usePxScale(): DeviceScaleFunction {
	const camera = useCamera();

	const [scale, setScale] = useDebounceState(calculateScale(camera.ViewportSize), {
		wait: 0.2,
		leading: true,
	});
	const [viewportSize, setViewportSize] = useDebounceState(camera.ViewportSize);

	useEventListener(camera.GetPropertyChangedSignal("ViewportSize"), () => {
		setScale(calculateScale(camera.ViewportSize));
		setViewportSize(camera.ViewportSize);
	});

	return useMemo(() => {
		const api = {
			viewportSize: (dataType: "UDim2" | "Vector2") => {
				if (dataType === "UDim2") {
					return new UDim2(0, viewportSize.X, 0, viewportSize.Y);
				}
				return viewportSize;
			},
		};

		setmetatable(api, {
			__call: () => scale,
		});

		return api as DeviceScaleFunction;
	}, [viewportSize]);
}
