import { useMemo } from "@rbxts/react";

export interface ScaleFunction {
	(pixels: number): number;
}

export function usePx(): ScaleFunction {
	return useMemo(() => {
		const api = {};

		setmetatable(api, {
			__call: (_, value) => math.round(value as number),
		});

		return api as ScaleFunction;
	}, []);
}
