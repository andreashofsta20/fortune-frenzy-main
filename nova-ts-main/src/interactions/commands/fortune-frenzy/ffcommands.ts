import { CommandInteraction, EmbedBuilder, GuildMember } from "discord.js";
import { Discord, Slash } from "discordx";
import { isStaff } from "../../../config/discord-ids.js";
import { isFortuneFrenzyOwner } from "../../../config/fortune-frenzy-owner.js";
import { applyFfBranding, FF } from "../../../utils/ffEmbeds.js";

function line(cmd: string, text: string): string {
	return `**${cmd}** — ${text}`;
}

const PUBLIC = [
	line("ffplayer", "Player lookup: wallet, value, stats, Roblox profile."),
	line("ffleaderboard", "Top 15 by cash or inventory value (cached)."),
	line("ffstatus", "Health + authenticated smoke test; Refresh button."),
	line("ffcases", "Item case catalog (price, value range, VIP/gems, rotation)."),
	line("ffinfo", "Public settings snapshot (game_open, paycheck, polling_cooldown)."),
	line("ffstats", "Minigame aggregate stats (CCU, wins, spent)."),
	line("ffactive", "Whether a user is marked in-game active (Redis)."),
	line("fflinks", "Roblox game play link."),
	line("ffgamehelp", "How in-game moderation relates to this bot."),
	line("ffcommands", "This list."),
];

const STAFF = [
	line("ffaddcash", "Credit cash (`500k`, `1.5m`, …)."),
	line("ffremovecash", "Debit cash: `all` or an amount."),
	line("ffaddvalue", "Grant catalog items until total value ≥ target."),
	line("ffinventory", "Raw inventory rows (MariaDB copies) for investigations."),
];

const OWNER = [
	line("ffwipe", "Reset a player row in the game database."),
	line("ffsearch", "Search accounts by keyword."),
	line("ffprofile", "Dump raw API JSON for a user id."),
	line("ffdiscordkick", "Kick a member from this Discord."),
	line("ffdiscordban", "Ban a member from this Discord."),
];

@Discord()
class FFCommandsList {
	@Slash({
		description: "Fortune Frenzy bot commands (staff and owners see more).",
		name: "ffcommands",
	})
	async ffcommands(interaction: CommandInteraction) {
		const m = interaction.member ? (interaction.member as GuildMember) : null;
		const showStaff = m ? isStaff(m) : false;
		const showOwner = m ? isFortuneFrenzyOwner(m) : false;

		const embed = applyFfBranding(
			new EmbedBuilder()
				.setColor(FF.brand)
				.setTitle("Commands")
				.setDescription("Slash commands use the `ff` prefix. Slash UI shows parameters when you type `/`.")
				.addFields({
					name: "General",
					value: PUBLIC.join("\n"),
					inline: false,
				}),
			"hero",
		);

		if (showStaff) {
			embed.addFields({
				name: "Staff",
				value: STAFF.join("\n"),
				inline: false,
			});
		}
		if (showOwner) {
			embed.addFields({
				name: "Owner",
				value: OWNER.join("\n"),
				inline: false,
			});
		}

		embed.setFooter({
			text:
				!showStaff && !showOwner
					? "Staff commands include /ffaddcash, /ffremovecash, /ffaddvalue — they appear under Staff here when your account has access (server role or bot allowlist)."
					: [showStaff ? "Staff: economy tools." : "", showOwner ? "Owner: database + Discord moderation." : ""]
							.filter(Boolean)
							.join(" "),
		});

		return interaction.reply({ embeds: [embed], ephemeral: true });
	}
}
