import React, { useEffect, useRef } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { SidebarButton } from "./SidebarButton";
import { TweenService } from "@rbxts/services";

interface Props extends React.PropsWithChildren {
	position: React.Binding<UDim2>;
	upscaled: boolean;
}

export function MainMenusHolder({ children, position, upscaled }: Props) {
	const upscaleRef = useRef<UIScale>();

	useEffect(() => {
		const scale = upscaleRef.current;
		if (!scale) return;

		const tween = TweenService.Create(
			scale,
			new TweenInfo(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{ Scale: upscaled ? 1.12 : 1 },
		);
		tween.Play();
		return () => tween.Destroy();
	}, [upscaled]);

	return (
		<frame
			Size={new UDim2(1, 0, 1, 0)}
			Position={position}
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundTransparency={1}
			// GroupTransparency={transparency}
		>
			<uiscale ref={upscaleRef} Scale={1} />
			{children}
		</frame>
	);
}
