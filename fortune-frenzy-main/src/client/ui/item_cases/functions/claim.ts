import Ripple from "@rbxts/ripple";
import { ScaleFunction } from "client/hooks/use-px";

export default function (
	containerFramePositionMotion: Ripple.Motion<UDim2>,
	frameSizeMotion: Ripple.Motion<UDim2>,
	containerFadeMotion: Ripple.Motion<number>,
	px: ScaleFunction,
	setSpinnerState: React.Dispatch<
		React.SetStateAction<{
			status: "none" | "loading" | "spinning" | "done" | "ready";
			speed: number;
			winningItem?: string;
		}>
	>,
) {
	frameSizeMotion.tween(new UDim2(0, px(900), 0, px(200)), {
		time: 0.3,
		style: Enum.EasingStyle.Exponential,
		direction: Enum.EasingDirection.Out,
	});
	containerFadeMotion.tween(1, {
		time: 0.3,
		style: Enum.EasingStyle.Exponential,
		direction: Enum.EasingDirection.Out,
	});

	task.wait(0.35);
	setSpinnerState({
		speed: 5,
		status: "none",
		winningItem: undefined,
	});
	containerFramePositionMotion.tween(new UDim2(0, 0, 0, 0), { time: 0.05 });
}
