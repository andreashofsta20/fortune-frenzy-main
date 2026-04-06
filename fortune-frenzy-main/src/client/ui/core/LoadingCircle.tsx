import { useEventListener } from "@rbxts/pretty-react-hooks";
import React, { useState } from "@rbxts/react";
import { RunService } from "@rbxts/services";

interface Props extends Partial<JSX.IntrinsicElements["imagelabel"]> {}

export function LoadingCircle(props: Props) {
	const [rotation, setRotation] = useState(0);

	useEventListener(RunService.RenderStepped, (delta) => {
		setRotation((rotation) => rotation + delta * 500);
	});

	return (
		<imagelabel {...props} Image={"rbxassetid://77214390031527"} Rotation={rotation} BackgroundTransparency={1} />
	);
}
