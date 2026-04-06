export function formatWithSuffix(value: number, decimalPlaces = 2): string {
	if (value === 0) return "0";
	const suffixes = ["", "K", "M", "B", "T"];
	const validTier = math.max(0, math.min(math.floor(math.log10(math.abs(value)) / 3), suffixes.size() - 1));
	if (validTier === 0) return tostring(math.floor(value));
	return customRound(value / math.pow(10, validTier * 3), decimalPlaces) + suffixes[validTier];
}

function customRound(value: number, decimalPlaces: number): string {
	const multiplier = math.pow(10, decimalPlaces);
	const roundedValue = math.round(value * multiplier) / multiplier;

	return string.format("%." + tostring(decimalPlaces) + "f", roundedValue);
}

export function addCommasToNumber(num: number): string {
	return tostring(num).reverse().gsub("(%d%d%d)", "%1,")[0].reverse().gsub("^,", "")[0];
}

export function formatPercentage(value: number, decimalPlaces = 2): string {
	const threshold = math.pow(10, -decimalPlaces);
	if (value > 0 && value < threshold) {
		return `<${customRound(threshold, decimalPlaces)}%`;
	}
	return customRound(value, decimalPlaces) + "%";
}

export function setDecimalPlaces(value: number, decimalPlaces = 3): number {
	const multiplier = math.pow(10, decimalPlaces);
	return math.round(value * multiplier) / multiplier;
}

export function formatDuration(seconds: number): string {
	const units = [
		{ label: "month", seconds: 2629800 },
		{ label: "week", seconds: 604800 },
		{ label: "day", seconds: 86400 },
		{ label: "hour", seconds: 3600 },
		{ label: "minute", seconds: 60 },
		{ label: "second", seconds: 1 },
	];

	const result: string[] = [];

	for (const unit of units) {
		const count = math.floor(seconds / unit.seconds);
		if (count > 0) {
			result.push(`${count} ${unit.label}${count > 1 ? "s" : ""}`);
			seconds %= unit.seconds;
		}
		if (result.size() === 2) break;
	}

	return result.join(", ") || "0 seconds";
}

export function padNumber(num: number, length: number): string {
	return string.format("%0" + length + "d", num);
}
