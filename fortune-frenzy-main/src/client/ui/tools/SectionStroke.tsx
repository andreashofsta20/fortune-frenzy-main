import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";

export function SectionStroke() {
	const px = usePx();
	return <uistroke Color={palette.stroke} Thickness={px(0.7)} />;
}
