import { JackpotData } from "typings/APIResponses";

function normalizeEpochMs(value?: number | string): number | undefined {
	if (value === undefined) return undefined;
	let n: number;
	if (typeIs(value, "string")) {
		const parsed = tonumber(value);
		if (parsed === undefined) return undefined;
		n = parsed;
	} else if (typeIs(value, "number")) {
		if (value !== value || value === math.huge || value === -math.huge) return undefined;
		n = value;
	} else {
		return undefined;
	}
	// Backend may emit seconds; client countdown hooks expect milliseconds.
	return n < 100000000000 ? n * 1000 : n;
}

export default function filterServerSeed(pot: JackpotData) {
	const autoMs = normalizeEpochMs(pot.auto_start_at as number | string | undefined);
	const endMs = normalizeEpochMs(pot.countdown_end_at as number | string | undefined);
	const normalized: JackpotData = {
		...pot,
		auto_start_at: autoMs,
		countdown_end_at: endMs ?? (typeIs(pot.countdown_end_at, "number") ? pot.countdown_end_at : 0),
	};

	if (normalized.status !== "complete") {
		return {
			...normalized,
			server_seed: "[REDACTED]",
		};
	}

	return normalized;
}
