import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
} from "discord.js";
import { applyFfBranding, ffLeaderboardColor, formatCompact, formatLbLine } from "./ffEmbeds.js";

const PAGE_SIZE = 5;
const MAX_ROWS = 15;

/** `fflb_nav_cash_0_next` */
export function leaderboardNavCustomId(metric: "cash" | "value", page: number, dir: "prev" | "next"): string {
	return `fflb_nav_${metric}_${page}_${dir}`;
}

export function parseLeaderboardNavId(id: string): { metric: "cash" | "value"; page: number; dir: "prev" | "next" } | null {
	const m = /^fflb_nav_(cash|value)_(\d+)_(prev|next)$/.exec(id);
	if (!m) return null;
	return { metric: m[1] as "cash" | "value", page: parseInt(m[2]!, 10), dir: m[3] as "prev" | "next" };
}

export function buildLeaderboardPageEmbed(rows: unknown[][], metric: "cash" | "value", pageIndex: number): EmbedBuilder {
	const color = ffLeaderboardColor(metric);
	const headline = metric === "cash" ? "Cash" : "Inventory value";
	const subtitle =
		metric === "cash"
			? "Sorted by current cash · cached snapshot"
			: "Sorted by Rolimons inventory value · cached snapshot";

	if (!rows.length) {
		const e = new EmbedBuilder()
			.setColor(color)
			.setTitle(`${headline} · leaderboard`)
			.setDescription("No entries in the cache yet.");
		return applyFfBranding(e, "hero");
	}

	const slice = rows.slice(0, MAX_ROWS);
	const totalPages = Math.max(1, Math.ceil(slice.length / PAGE_SIZE));
	const page = Math.min(Math.max(0, pageIndex), totalPages - 1);
	const start = page * PAGE_SIZE;
	const pageRows = slice.slice(start, start + PAGE_SIZE);

	const lines = pageRows.map((row, idx) => {
		const globalRank = start + idx + 1;
		const uid = String(row[0] ?? "?");
		const name = String(row[1] ?? "?");
		const display = String(row[2] ?? "");
		const amount = String(row[3] ?? "0");
		const country = String(row[4] ?? "").trim();
		const label = display && display !== name ? `${name} (${display})` : name;
		const amtNum = Number(amount.replace(/[^0-9.-]/g, "")) || 0;
		const amtPretty = Number.isFinite(amtNum) ? formatCompact(amtNum) : amount;
		return formatLbLine(globalRank, label, uid, amtPretty, country || undefined);
	});

	const embed = new EmbedBuilder()
		.setColor(color)
		.setTitle(`${headline} · leaderboard`)
		.setDescription(`${subtitle}\n\n${lines.join("\n") || "—"}`)
		.setFooter({
			text: `Page ${page + 1}/${totalPages} · Fortune Frenzy · ~30s cache`,
		});

	return applyFfBranding(embed, "hero");
}

export function leaderboardButtonRow(
	metric: "cash" | "value",
	pageIndex: number,
	totalRows: number,
): ActionRowBuilder<ButtonBuilder> {
	const totalPages = Math.max(1, Math.ceil(Math.min(totalRows, MAX_ROWS) / PAGE_SIZE));
	const page = Math.min(Math.max(0, pageIndex), totalPages - 1);

	const prev = new ButtonBuilder()
		.setCustomId(leaderboardNavCustomId(metric, page, "prev"))
		.setLabel("Previous")
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(page <= 0);

	const next = new ButtonBuilder()
		.setCustomId(leaderboardNavCustomId(metric, page, "next"))
		.setLabel("Next")
		.setStyle(ButtonStyle.Primary)
		.setDisabled(page >= totalPages - 1);

	return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);
}
