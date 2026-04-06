import { useState, useEffect } from "@rbxts/react";

export function useDebounce(value: string, delay: number): string {
	const [debouncedValue, setDebouncedValue] = useState(value);

	useEffect(() => {
		let cancelled = false;

		task.delay(delay / 1000, () => {
			if (!cancelled) {
				setDebouncedValue(value);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [value]);

	return debouncedValue;
}
