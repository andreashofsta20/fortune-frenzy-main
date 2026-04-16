import Ripple from "@rbxts/ripple";
import { ScaleFunction } from "client/hooks/use-px";
import { Functions } from "client/network";
import { isLoadingAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";
import { Case } from "typings/APIResponses";

export default async function (
	containerFramePositionMotion: Ripple.Motion<UDim2>,
	frameSizeMotion: Ripple.Motion<UDim2>,
	containerFadeMotion: Ripple.Motion<number>,
	px: ScaleFunction,
	setSpinnerState: React.Dispatch<
		React.SetStateAction<{
			status: "none" | "loading" | "spinning" | "done" | "ready";
			speed: number;
			winningItem?: string;
			winningIndex?: number;
			isLucky?: boolean;
		}>
	>,
	currentCase: Case,
) {
	setSpinnerState((prev) => ({
		...prev,
		status: "loading",
		winningItem: undefined,
		winningIndex: undefined,
		isLucky: false,
	}));

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

	task.wait(0.3);

	containerFramePositionMotion.tween(new UDim2(0, 0, 0, 0), {
		time: 0.5,
		style: Enum.EasingStyle.Exponential,
		direction: Enum.EasingDirection.InOut,
	});

	const currentTime = tick();
	isLoadingAtom(true);
	const result = await requestServer(Functions.ItemCases.OpenCase, "Failed to open case", currentCase.id);
	if (result === -1 || result.code !== 200) {
		setSpinnerState({
			speed: 5,
			status: "none",
			winningItem: undefined,
			winningIndex: undefined,
			isLucky: false,
		});
		return;
	}
	const [id, speed, isLucky] = result.message!.split("|");

	isLoadingAtom(false);
	task.wait(0.7 - (tick() - currentTime));
	setSpinnerState({
		speed: tonumber(speed) ?? 5,
		status: "ready",
		winningItem: id,
		winningIndex: undefined,
		isLucky: isLucky === "true",
	});
}
