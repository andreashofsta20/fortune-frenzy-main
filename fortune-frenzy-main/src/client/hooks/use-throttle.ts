import { useState, useEffect, useRef } from "@rbxts/react";

export function useThrottle(value: string, limit: number): string {
	const [throttledValue, setThrottledValue] = useState(value);
	const lastRan = useRef(0);

	useEffect(() => {
		const now = tick();

		if (now - lastRan.current >= limit / 1000) {
			setThrottledValue(value);
			lastRan.current = now;
		} else {
			const remainingTime = limit / 1000 - (now - lastRan.current);
			const timer = task.delay(remainingTime, () => {
				setThrottledValue(value);
				lastRan.current = tick();
			});

			return () => {
				task.cancel(timer);
			};
		}
	}, [value]);

	return throttledValue;
}
