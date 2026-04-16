/** Keys considered safe to show in `/ffinfo` (no secrets — tune if your DB adds sensitive rows). */
export const FF_PUBLIC_SETTING_KEYS = ["game_open", "paycheck", "polling_cooldown"] as const;

export function formatPublicSettingValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "—";
	}
	if (typeof value === "boolean" || typeof value === "number") {
		return String(value);
	}
	if (typeof value === "string") {
		return value.length > 400 ? `${value.slice(0, 397)}…` : value;
	}
	const s = JSON.stringify(value);
	return s.length > 400 ? `${s.slice(0, 397)}…` : s;
}
