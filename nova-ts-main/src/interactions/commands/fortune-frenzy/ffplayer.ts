import { CommandInteraction, EmbedBuilder, SlashCommandStringOption } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import {
	type FfUserPayload,
	ffGetActive,
	ffGetUser,
	ffInventoryCount,
	ffSearchUsers,
} from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import {
	applyFfBranding,
	ffErrorEmbed,
	ffWealthAccentColor,
	formatCompact,
	robloxHeadshotUrl,
	robloxProfileUrl,
} from "../../../utils/ffEmbeds.js";

function pickSearchResult(keyword: string, results: Awaited<ReturnType<typeof ffSearchUsers>>) {
	const k = keyword.trim().toLowerCase();
	const exact = results.find((r) => r.name.toLowerCase() === k || r.display_name.toLowerCase() === k);
	return exact ?? results[0];
}

function formatWinRate(w: number | string): string {
	if (typeof w !== "number" || !Number.isFinite(w)) {
		return String(w);
	}
	// API may store 0–1 or 0–100
	if (w >= 0 && w <= 1) {
		return `${(w * 100).toFixed(1)}%`;
	}
	return `${w.toFixed(1)}%`;
}

function buildPlayerEmbed(params: {
	profile: FfUserPayload;
	userId: string;
	valueFromSearch: number | undefined;
	active: boolean;
	invCount: number;
	cashNum: number;
	hasPlayed: boolean;
	stats: FfUserPayload["statistics"];
}): EmbedBuilder {
	const { profile, userId, valueFromSearch, invCount, cashNum, hasPlayed, stats } = params;
	const display = profile.display_name || profile.name;
	const profileLink = robloxProfileUrl(userId);
	const invValueNum = valueFromSearch ?? 0;
	const accent = ffWealthAccentColor(cashNum, invValueNum);

	const metaBits: string[] = [];
	metaBits.push(params.active ? "In a live server" : "Not in a server");
	if (!hasPlayed) {
		metaBits.push("No recorded plays yet");
	}
	const metaLine = metaBits.join(" · ");

	const valueStr =
		valueFromSearch !== undefined ? formatCompact(Math.round(valueFromSearch)) : "Use username lookup for value";

	const embed = new EmbedBuilder()
		.setColor(accent)
		.setTitle(display)
		.setURL(profileLink)
		.setThumbnail(robloxHeadshotUrl(userId, 420))
		.setDescription(
			`[${profile.name}](${profileLink}) · \`${userId}\`\n${metaLine}`,
		)
		.addFields(
			{ name: "Cash", value: formatCompact(cashNum), inline: true },
			{ name: "Value", value: valueStr, inline: true },
			{ name: "Items", value: formatCompact(invCount), inline: true },
			{ name: "XP", value: formatCompact(stats.xp), inline: true },
			{ name: "Plays", value: formatCompact(stats.total_plays), inline: true },
			{ name: "Time (h)", value: formatCompact(stats.time_played), inline: true },
			{
				name: "Record",
				value: `Win rate ${formatWinRate(stats.win_rate)} · High ${formatCompact(stats.biggest_win)} · ${stats.favourite_mode || "—"}`,
				inline: false,
			},
		)
		.setFooter({ text: "Fortune Frenzy · profile data from API" });

	const ts = Date.parse(profile.updated_at);
	if (!Number.isNaN(ts)) {
		embed.setTimestamp(ts);
	}

	return applyFfBranding(embed, "player");
}

@Discord()
class FFPlayer {
	@Slash({
		description: "Look up a Fortune Frenzy player by Roblox username or numeric user id.",
		name: "ffplayer",
	})
	async ffplayer(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("username")
				.setDescription("Roblox username or numeric Roblox user id")
				.setRequired(true),
		)
		username: string,
		interaction: CommandInteraction,
	) {
		await interaction.deferReply();

		try {
			const raw = username.trim();
			let userId: string | undefined;
			let valueFromSearch: number | undefined;

			if (/^\d+$/.test(raw)) {
				const u = await ffGetUser(raw);
				if (!u) {
					return interaction.editReply({
						embeds: [
							ffErrorEmbed("Not found", "No profile exists for that Roblox user id."),
						],
					});
				}
				userId = u.user_id;
			} else {
				const results = await ffSearchUsers({ keywords: raw, limit: 25 });
				if (results.length === 0) {
					return interaction.editReply({
						embeds: [
							ffErrorEmbed(
								"Not found",
								"No username match. They may not have joined yet, or the name changed.",
							),
						],
					});
				}
				const pick = pickSearchResult(raw, results);
				userId = pick.id;
				valueFromSearch = pick.current_value;
			}

			const profile = await ffGetUser(userId);
			if (!profile) {
				return interaction.editReply({
					embeds: [ffErrorEmbed("Not found", "Profile is missing or unavailable.")],
				});
			}

			let active = false;
			let invCount = 0;
			try {
				[active, invCount] = await Promise.all([ffGetActive(userId), ffInventoryCount(userId)]);
			} catch {
				// non-fatal
			}

			const stats = profile.statistics;
			const cashStr = stats.current_cash ?? "0";
			const cashNum = Number(cashStr.replace(/[^0-9.-]/g, "")) || 0;
			const hasPlayed = stats.total_plays > 0 || stats.time_played > 0;

			const embed = buildPlayerEmbed({
				profile,
				userId,
				valueFromSearch,
				active,
				invCount,
				cashNum,
				hasPlayed,
				stats,
			});

			await interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffplayer", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
