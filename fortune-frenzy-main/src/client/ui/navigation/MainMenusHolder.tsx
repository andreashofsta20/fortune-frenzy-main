import React from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { SidebarButton } from "./SidebarButton";

interface Props extends React.PropsWithChildren {
	position: React.Binding<UDim2>;
}

export function MainMenusHolder({ children, position }: Props) {
	return (
		<frame
			Size={new UDim2(1, 0, 1, 0)}
			Position={position}
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundTransparency={1}
			// GroupTransparency={transparency}
		>
			{children}
		</frame>
	);
}
