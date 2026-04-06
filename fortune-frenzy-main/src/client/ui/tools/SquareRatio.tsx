import React from "@rbxts/react";

function SquareRatioComponent() {
	return (
		<uiaspectratioconstraint
			AspectRatio={1}
			AspectType={Enum.AspectType.FitWithinMaxSize}
		></uiaspectratioconstraint>
	);
}
export const SquareRatio = React.memo(SquareRatioComponent);
