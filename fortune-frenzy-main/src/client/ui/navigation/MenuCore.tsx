import React from "@rbxts/react";
import { usePxScale } from "client/hooks/use-scale";

interface Props extends React.PropsWithChildren {
	scale?: boolean;
}

export function MenuCore({ children, scale = true }: Props) {
	return (
		<frame
			Size={new UDim2(1, 0, 1, 0)}
			Position={new UDim2(0.5, 0, 0.5, 0)}
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundTransparency={1}
		>
			{scale ? <uiscale Scale={usePxScale()()} /> : undefined}
			{children}
		</frame>
	);
}
