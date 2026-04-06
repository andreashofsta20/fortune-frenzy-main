import React from "@rbxts/react";

interface Props extends React.PropsWithChildren {
	displayOrder?: number;
	name?: string;
}

export function Layer({ displayOrder, children, name }: Props) {
	return (
		<screengui
			DisplayOrder={displayOrder}
			IgnoreGuiInset
			ResetOnSpawn={false}
			ZIndexBehavior={Enum.ZIndexBehavior.Sibling}
			ScreenInsets={Enum.ScreenInsets.CoreUISafeInsets}
			key={name || "Layer"}
		>
			{children}
		</screengui>
	);
}
