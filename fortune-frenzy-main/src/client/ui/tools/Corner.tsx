import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";

interface Props {
	roundness: "full" | "small";
}

function CornerComponent({ roundness }: Props) {
	const px = usePx();

	return <uicorner CornerRadius={roundness === "full" ? new UDim(1, 0) : new UDim(0, px(10))} />;
}

export const Corner = React.memo(CornerComponent);
