export const JACKPOT_INFINITY_VALUE_CAP = 1000000000000000;

const JACKPOT_INFINITY_TOKENS: Record<string, true> = {
	inf: true,
	infinity: true,
	infinite: true,
	inft: true,
	infty: true,
	unlimited: true,
	uncapped: true,
	nolimit: true,
	no_limit: true,
};

export function isInfinityLikeToken(value: string): boolean {
	const normalized = value.gsub("^%s*(.-)%s*$", "%1")[0].lower();
	return JACKPOT_INFINITY_TOKENS[normalized] === true;
}

export function normalizeJackpotValueCap(value: unknown, fallback = 1000000): number {
	const fallbackValue =
		typeIs(fallback, "number") && fallback === fallback && fallback > -math.huge && fallback < math.huge
			? math.max(1, math.floor(fallback))
			: 1000000;

	if (typeIs(value, "string")) {
		const trimmed = value.gsub("^%s*(.-)%s*$", "%1")[0];
		const compact = trimmed.gsub(",", "")[0];
		if (isInfinityLikeToken(compact)) return JACKPOT_INFINITY_VALUE_CAP;

		const parsed = tonumber(compact);
		if (parsed !== undefined) {
			return normalizeJackpotValueCap(parsed, fallbackValue);
		}

		return fallbackValue;
	}

	if (!typeIs(value, "number")) return fallbackValue;
	if (value !== value || value === math.huge || value === -math.huge) {
		return JACKPOT_INFINITY_VALUE_CAP;
	}

	const normalized = math.max(1, math.floor(value));
	return math.min(normalized, JACKPOT_INFINITY_VALUE_CAP);
}