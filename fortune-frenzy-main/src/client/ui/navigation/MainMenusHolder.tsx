import React, { useEffect, useRef } from "@rbxts/react";
import { TweenService } from "@rbxts/services";

interface Props extends React.PropsWithChildren {
	position: React.Binding<UDim2>;
	/** Final UIScale (1 = normal, ~1.12 desktop upscale, ~1.4 mobile upscale). */
	scale: number;
}

export function MainMenusHolder({ children, position, scale }: Props) {
	const upscaleRef = useRef<UIScale>();

	useEffect(() => {
		const uiScale = upscaleRef.current;
		if (!uiScale) return;

		const tween = TweenService.Create(
			uiScale,
			new TweenInfo(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out),
			{ Scale: scale },
		);
		tween.Play();
		return () => tween.Destroy();
	}, [scale]);

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
