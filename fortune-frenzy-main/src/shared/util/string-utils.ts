import { formatWithSuffix } from "shared/util/number-utils";
import {
	JACKPOT_INFINITY_VALUE_CAP,
	isInfinityLikeToken,
	normalizeJackpotValueCap,
} from "shared/util/jackpot-value-cap";

export function escapeSpecialChars(text: string): string {
	return text.gsub("[%[%]%(%)%.%+%-%*%?%^%$%%]", "\\%1")[0];
}

export function capitalizeFirstChar(str: string): string {
	if (str.size() === 0) {
		return str;
	}
	return str.sub(1, 1).upper() + str.sub(2);
}

export function smartStringToNumber(str: string): number | undefined {
	str = str.gsub(",", "")[0].upper();

	const suffixes: { [key: string]: number } = {
		K: 1e3,
		M: 1e6,
		B: 1e9,
		T: 1e12,
		QD: 1e15,
	};

	const suffix = str.sub(-1);
	if (suffixes[suffix]) {
		const num = tonumber(str.sub(1, -2));
		return num !== undefined ? num * suffixes[suffix] : undefined;
	}

	const twoCharSuffix = str.sub(-2);
	if (suffixes[twoCharSuffix]) {
		const num = tonumber(str.sub(1, -3));
		return num !== undefined ? num * suffixes[twoCharSuffix] : undefined;
	}

	const num = tonumber(str);
	if (num !== num || num === math.huge) return undefined;
	return num !== undefined ? num : undefined;
}

export function timeUntil(dateString: string): string {
	const targetDate = DateTime.fromIsoDate(dateString);
	if (!targetDate) {
		return "Invalid date";
	}

	const currentTime = DateTime.fromUnixTimestamp(os.time());
	let timeDifference = targetDate.UnixTimestamp - currentTime.UnixTimestamp;

	if (timeDifference === 0) {
		return "now";
	}

	const isPast = timeDifference < 0;
	timeDifference = math.abs(timeDifference);

	const units = [
		{ label: "year", seconds: 365 * 24 * 60 * 60 },
		{ label: "month", seconds: 30 * 24 * 60 * 60 },
		{ label: "week", seconds: 7 * 24 * 60 * 60 },
		{ label: "day", seconds: 24 * 60 * 60 },
		{ label: "hour", seconds: 60 * 60 },
		{ label: "minute", seconds: 60 },
		{ label: "second", seconds: 1 },
	];

	for (const unit of units) {
		const amount = math.floor(timeDifference / unit.seconds);
		if (amount >= 1) {
			if (isPast) {
				return `${amount} ${unit.label}${amount > 1 ? "s" : ""} ago`;
			} else {
				return `in ${amount} ${unit.label}${amount > 1 ? "s" : ""}`;
			}
		}
	}

	return isPast ? "just now" : "any moment now";
}

/**
 * Returns a colour on a red→green gradient depending on how close `dateString` is.
 * @param dateString ISO-8601 date string to compare against current time.
 * @param rangeInSeconds Maximum time span that maps to full green (defaults to 24 h).
 */
export function getColorBasedOnTime(dateString: string, rangeInSeconds = 24 * 60 * 60): Color3 {
	const START_COLOR = Color3.fromRGB(195, 54, 54);
	const END_COLOR = Color3.fromRGB(116, 220, 93);
	const targetDate = DateTime.fromIsoDate(dateString);
	if (!targetDate) return END_COLOR;
	const now = DateTime.fromUnixTimestamp(os.time()).UnixTimestamp;
	let diff = targetDate.UnixTimestamp - now;
	if (diff < 0) diff = 0;
	if (rangeInSeconds <= 0) rangeInSeconds = 1;
	if (diff > rangeInSeconds) diff = rangeInSeconds;
	const ratio = diff / rangeInSeconds;
	return START_COLOR.Lerp(END_COLOR, ratio);
}

export function replacePlaceholder(original: string, placeholder: string, text: string): string {
	return original.gsub(placeholder.gsub("%%", "%%%%")[0], text.gsub("%%", "%%%%")[0])[0];
}

export function formatItemName(itemName: string): string {
	if (itemName.sub(0, 3) === "The") {
		return itemName;
	}

	const words = itemName.split(" ");

	const isProperNoun = words.every(
		(word) => word.sub(0, 1) === word.sub(0, 1).upper() && !["of", "and", "the"].includes(word.lower()),
	);
	if (isProperNoun) {
		return itemName;
	}

	const hasNumbers = itemName.match("%d") !== undefined;
	if (hasNumbers) {
		return itemName;
	}

	return `a ${itemName}`;
}

export function stringToNumber(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.size(); i++) {
		const [charCode] = str.byte(i + 1);
		hash = charCode + ((hash << 5) - hash);
	}
	return hash;
}

export function parseDurationToSeconds(raw: string): number | undefined {
	let str = raw.gsub("^%s*(.-)%s*$", "%1")[0].lower();
	str = str.gsub(",", "")[0];
	str = str.gsub("%f[%a]and%f[%A]", " ")[0];
	str = str.gsub("%+", " ")[0];
	str = str.gsub("(%d)(%a)", "%1 %2")[0];
	str = str.gsub("(%a)(%d)", "%1 %2")[0];
	str = str.gsub("%s+", " ")[0];
	str = str.gsub("^%s*(.-)%s*$", "%1")[0];

	const [colonPos] = str.find(":");
	if (colonPos !== undefined) {
		const partsStr = str.split(":");
		const parts: number[] = [];
		for (const segment of partsStr) {
			const v = tonumber(segment);
			if (v === undefined) {
				return undefined;
			}
			parts.push(v);
		}
		while (parts.size() < 3) parts.insert(0, 0);
		const h = parts[parts.size() - 3];
		const m = parts[parts.size() - 2];
		const s = parts[parts.size() - 1];
		return h * 3600 + m * 60 + s;
	}

	const tokens = str.split(" ");

	const unitMultipliers: { [key: string]: number } = {
		h: 3600,
		hr: 3600,
		hrs: 3600,
		hour: 3600,
		hours: 3600,
		m: 60,
		min: 60,
		mins: 60,
		minute: 60,
		minutes: 60,
		s: 1,
		sec: 1,
		secs: 1,
		second: 1,
		seconds: 1,
	};

	let total = 0;
	let matchedUnits = false;

	let i = 0;
	while (i < tokens.size()) {
		const num = tonumber(tokens[i]);
		if (num === undefined) {
			i += 1;
			continue;
		}

		let unit = "";
		if (i + 1 < tokens.size()) unit = tokens[i + 1];
		if (unitMultipliers[unit] !== undefined) {
			total += num * unitMultipliers[unit];
			matchedUnits = true;
			i += 2;
		} else {
			total += num;
			i += 1;
		}
	}

	return total !== 0 ? total : undefined;
}

export function parseValueRange(txt: string): string {
	if (txt.size() === 0) return "50000";
	const canonical = txt.gsub("%s*[%-–—]%s*", "#")[0];
	const parts = canonical.split("#");

	const toNumber = (token: string): number => {
		const trimmed = token.gsub("^%s*(.-)%s*$", "%1")[0];
		if (isInfinityLikeToken(trimmed)) return JACKPOT_INFINITY_VALUE_CAP;

		const parsed = smartStringToNumber(trimmed);
		if (parsed !== undefined) return normalizeJackpotValueCap(parsed, 0);

		return normalizeJackpotValueCap(trimmed, 0);
	};

	const MIN_MAX_VALUE = 50000;

	const filtered: string[] = [];
	for (const p of parts) if (p.size() > 0) filtered.push(p);
	if (filtered.size() === 1) {
		const maxOnly = math.max(toNumber(filtered[0]), MIN_MAX_VALUE);
		return tostring(maxOnly);
	}

	const lo = toNumber(filtered[0]);
	let hi = toNumber(filtered[1]);

	if (hi < MIN_MAX_VALUE) hi = MIN_MAX_VALUE;

	const minVal = math.min(lo, hi);
	const maxVal = math.max(lo, hi);
	return `${minVal}#${maxVal}`;
}

export function formatValueRange(txt: string): string {
	const parts = txt.split("#");

	const toNumber = (token: string): number | undefined => {
		const trimmed = token.gsub("^%s*(.-)%s*$", "%1")[0];
		if (isInfinityLikeToken(trimmed)) return JACKPOT_INFINITY_VALUE_CAP;

		const smart = smartStringToNumber(trimmed);
		if (smart !== undefined) return smart;
		const numericStr = trimmed.gsub(",", "")[0];
		const parsed = tonumber(numericStr);
		if (parsed === undefined) return undefined;
		return normalizeJackpotValueCap(parsed, 0);
	};

	if (parts.size() === 1) {
		const val = toNumber(parts[0]);
		if (val === undefined) return parts[0];
		if (val >= JACKPOT_INFINITY_VALUE_CAP) return "∞";
		return formatWithSuffix(val);
	}

	const loNum = toNumber(parts[0]);
	const hiNum = toNumber(parts[1]);
	if (loNum === undefined || hiNum === undefined) {
		return txt;
	}

	const formattedLo = loNum >= JACKPOT_INFINITY_VALUE_CAP ? "∞" : formatWithSuffix(loNum);
	const formattedHi = hiNum >= JACKPOT_INFINITY_VALUE_CAP ? "∞" : formatWithSuffix(hiNum);
	return `${formattedLo} - ${formattedHi}`;
}

export function hasRichText(text: string): boolean {
	if (!string.find(text, "<", 1, true)[0]) return false;
	const [tmp] = string.gsub(text, "&lt;", "");
	const [scan] = string.gsub(tmp, "&gt;", "");
	const RICH_TAGS: Record<string, true> = {
		b: true,
		i: true,
		u: true,
		s: true,
		font: true,
		stroke: true,
		mark: true,
		uppercase: true,
		uc: true,
		smallcaps: true,
		sc: true,
		br: true,
	};

	for (const [tag] of string.gmatch(scan, "<%s*/?%s*([%a][%w]*)")) {
		if (RICH_TAGS[string.lower(tag as string)]) return true;
	}

	if (string.find(scan, "<!%-%-")[0]) return true;
	return false;
}
