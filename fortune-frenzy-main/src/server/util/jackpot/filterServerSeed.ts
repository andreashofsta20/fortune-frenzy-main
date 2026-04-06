import { JackpotData } from "typings/APIResponses";

function normalizeEpochMs(value?: number): number | undefined {
	if (value === undefined) return undefined;
	// Backend may emit seconds; client countdown hooks expect milliseconds.
	return value < 100000000000 ? value * 1000 : value;
}

export default function filterServerSeed(pot: JackpotData) {
	const normalized: JackpotData = {
		...pot,
		auto_start_at: normalizeEpochMs(pot.auto_start_at),
		countdown_end_at: normalizeEpochMs(pot.countdown_end_at) ?? pot.countdown_end_at,
	};

	if (normalized.status !== "complete") {
		return {
			...normalized,
			server_seed: "[REDACTED]",
		};
	}

	return normalized;
}
