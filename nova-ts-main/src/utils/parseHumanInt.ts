const MAX_I64 = 9223372036854775807n;

/**
 * Parses amounts like `500`, `1.5k`, `2m`, `10b`, `500000` (case-insensitive k/m/b).
 * Returns bigint in valid int64 range for the Go API, or an error string.
 */
export function parseHumanInt64(input: string): { ok: true; value: bigint } | { ok: false; error: string } {
	const raw = input.trim().toLowerCase().replace(/,/g, "");
	if (raw === "") {
		return { ok: false, error: "Empty amount." };
	}
	const m = raw.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
	if (!m) {
		return { ok: false, error: "Use a number like `500`, `1.5k`, `2m`, or `10b`." };
	}
	let n = parseFloat(m[1]!);
	if (!Number.isFinite(n) || n < 0) {
		return { ok: false, error: "Amount must be non-negative." };
	}
	const suf = m[2];
	if (suf === "k") n *= 1_000;
	else if (suf === "m") n *= 1_000_000;
	else if (suf === "b") n *= 1_000_000_000;
	let bi = BigInt(Math.floor(n + 0.5));
	if (bi > MAX_I64) {
		bi = MAX_I64;
	}
	if (bi <= 0n) {
		return { ok: false, error: "Amount must be positive." };
	}
	return { ok: true, value: bi };
}

/** Serialize for JSON body `amount` field (Go accepts number or string). */
export function amountJsonValue(v: bigint): number | string {
	if (v <= BigInt(Number.MAX_SAFE_INTEGER)) {
		return Number(v);
	}
	return v.toString();
}
