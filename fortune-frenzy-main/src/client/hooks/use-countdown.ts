import { useEffect, useState } from "@rbxts/react";
import { RunService, Workspace } from "@rbxts/services";

/**
 * useCountdown returns a string like "02:03.456", "4:02:03.456" or "1:03:02:04.567" (D:HH:MM:SS.mmm)
 * that counts down towards the given
 * timestamp (in milliseconds). It sets up a single Heartbeat listener
 * (one per hook instance) that updates the string every frame. If
 * `targetTime` is undefined, the hook returns an empty string and no listener
 * is created.
 */
export function useCountdown(targetTime?: number): LuaTuple<[string, boolean]> {
	const [display, setDisplay] = useState("");
	const [finished, setFinished] = useState(false);

	useEffect(() => {
		if (!targetTime) {
			setDisplay("");
			setFinished(false);
			return;
		}

		const update = () => {
			const timeLeft = math.max(targetTime - Workspace.GetServerTimeNow() * 1000, 0);

			setFinished(timeLeft === 0);
			if (timeLeft === 0) {
				setDisplay("00:00.000");
				return;
			}

			const days = math.floor(timeLeft / 86400000);
			const hours = math.floor((timeLeft % 86400000) / 3600000);
			const minutes = math.floor((timeLeft % 3600000) / 60000);
			const seconds = math.floor((timeLeft % 60000) / 1000);
			const milliseconds = math.floor(timeLeft % 1000);

			const pad2 = (value: number) => (value < 10 ? `0${value}` : tostring(value));
			const pad3 = (value: number) => (value < 10 ? `00${value}` : value < 100 ? `0${value}` : tostring(value));

			const parts: string[] = [];
			if (days > 0) parts.push(tostring(days));
			if (hours > 0 || days > 0) parts.push(pad2(hours));
			parts.push(pad2(minutes));
			parts.push(pad2(seconds));

			const timeWithoutMs = parts.join(":");
			setDisplay(`${timeWithoutMs}.${pad3(milliseconds)}`);
		};

		update();
		const connection = RunService.Heartbeat.Connect(update);

		return () => connection.Disconnect();
	}, [targetTime]);

	return $tuple(display, finished);
}
