import getRarity from "shared/util/get-item-rarity";

export function brighten(color: Color3, brightness: number, vibrancy = 0.5) {
	const [h, s, v] = color.ToHSV();
	return Color3.fromHSV(h, math.clamp(s - brightness * vibrancy, 0, 1), math.clamp(v + brightness, 0, 1));
}

export function saturate(color: Color3, saturation: number) {
	const [h, s, v] = color.ToHSV();
	return Color3.fromHSV(h, math.clamp(s + saturation, 0, 1), v);
}

export function getLuminance(color: Color3) {
	return color.R * 0.299 + color.G * 0.587 + color.B * 0.114;
}

export function isBright(color: Color3) {
	return getLuminance(color) > 0.65;
}
export function setValue(color: Color3, value: number) {
	const [h, s] = color.ToHSV();
	return Color3.fromHSV(h, s, value / 255);
}

const DEFAULT_COLOR_HEX = "9ca3af";
const EXCLUSIVE_COLOR_HEX = "803eea";

const RARITY_COLORS: Record<string, string> = {
	common: "595959",
	uncommon: "248514",
	rare: "3045cd",
	epic: "cd3134",
	legendary: "dfb03a",
	mythical: "81eded",
};

function normalizeHex(value?: string) {
	const trimmed = tostring(value ?? "").gsub("^%s*(.-)%s*$", "%1")[0];
	if (trimmed.size() === 0) return "";
	const withoutHash = trimmed.sub(1, 1) === "#" ? trimmed.sub(2) : trimmed;
	return withoutHash.lower();
}

export function resolveItemColorHex(color?: string, value?: number, exclusive?: boolean) {
	const normalized = normalizeHex(color);
	if (normalized.size() > 0 && normalized !== DEFAULT_COLOR_HEX) {
		return normalized;
	}

	if (exclusive) return EXCLUSIVE_COLOR_HEX;

	if (value !== undefined) {
		const rarity = getRarity(value);
		return RARITY_COLORS[rarity] ?? DEFAULT_COLOR_HEX;
	}

	return DEFAULT_COLOR_HEX;
}
