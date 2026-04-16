import { EmbedBuilder } from "discord.js";

// ─── Palette ─────────────────────────────────────────────────────────────────

export const FF = {
	brand: 0x129f5d,
	err: 0xdc2626,
	ok: 0x15803d,
	lbCash: 0x0ea5e9,
	lbValue: 0xc026d3,
} as const;

// ─── Roblox helpers ───────────────────────────────────────────────────────────

export const robloxProfileUrl = (uid: string) => `https://www.roblox.com/users/${uid}/profile`;

export const robloxHeadshotUrl = (uid: string, size: 150 | 420 = 150) =>
	`https://www.roblox.com/headshot-thumbnail/image?userId=${encodeURIComponent(uid)}&width=${size}&height=${size}&format=png`;

// ─── Colour utilities ─────────────────────────────────────────────────────────

export const ffLeaderboardColor = (metric: "cash" | "value"): number =>
	metric === "cash" ? FF.lbCash : FF.lbValue;

export function ffWealthAccentColor(cash: number, inventoryValue: number): number {
	const v = Math.max(cash, inventoryValue);
	if (v >= 50_000_000) return 0xd97706;
	if (v >= 5_000_000) return 0x9333ea;
	if (v >= 500_000) return 0x2563eb;
	if (v >= 50_000) return 0x0d9488;
	return FF.brand;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export const formatCompact = (n: number) => Math.round(n).toLocaleString();

/** Leaderboard row: rank · linked name · amount · optional country flag. */
export function formatLbLine(
	rank: number,
	displayName: string,
	uid: string,
	amountPretty: string,
	country?: string,
): string {
	const link = `[${displayName}](${robloxProfileUrl(uid)})`;
	return `**${rank}.** ${link} — ${amountPretty}${country ? ` · ${country}` : ""}`;
}

// ─── Base embed builders ──────────────────────────────────────────────────────

type StatusKind = "error" | "success";

const STATUS_META: Record<StatusKind, { color: number; emoji: string }> = {
	error: { color: FF.err, emoji: "<:nova_error:1278474560026706020>" },
	success: { color: FF.ok, emoji: "<:nova_success:1278474605375524988>" },
};

function statusEmbed(kind: StatusKind, title: string, description: string): EmbedBuilder {
	const { color, emoji } = STATUS_META[kind];
	return new EmbedBuilder().setColor(color).setDescription(`### ${emoji} ${title}\n${description}`);
}

export const errorEmbed = (title: string, desc: string) => statusEmbed("error", title, desc);
export const successEmbed = (title: string, desc: string) => statusEmbed("success", title, desc);

// FF-namespaced aliases (backwards-compat)
export const ffErrorEmbed = errorEmbed;
export const ffSuccessEmbed = successEmbed;

// ─── FF branding ──────────────────────────────────────────────────────────────

/**
 * Applies Fortune Frenzy branding to an embed.
 *
 * - `hero`   → author icon + optional banner image
 * - `player` → author icon only (banner opt-in via `FF_EMBED_BANNER_ON_PLAYER=true`)
 *
 * Discord only supports accent `color`, `thumbnail`, wide `image`, and `author.icon_url`
 * for branding — there are no custom backgrounds.
 */
export function applyFfBranding(embed: EmbedBuilder, kind: "hero" | "player" = "hero"): EmbedBuilder {
	const icon = process.env.FF_EMBED_ICON_URL?.trim();
	const banner = process.env.FF_EMBED_BANNER_URL?.trim();
	const isHttps = (url?: string): url is string => !!url && /^https:\/\//i.test(url);

	embed.setAuthor({
		name: "Fortune Frenzy",
		...(isHttps(icon) && { iconURL: icon }),
	});

	const showBanner =
		isHttps(banner) &&
		(kind === "hero" || (kind === "player" && process.env.FF_EMBED_BANNER_ON_PLAYER === "true"));

	if (showBanner) embed.setImage(banner);

	return embed;
}
