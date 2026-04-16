import {
	CommandInteraction,
	EmbedBuilder,
	GuildMember,
	SlashCommandStringOption,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { isStaff } from "../../../config/discord-ids.js";
import { isFortuneFrenzyOwner } from "../../../config/fortune-frenzy-owner.js";
import { ffGetInventoryRows } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { applyFfBranding, FF, ffErrorEmbed, robloxProfileUrl } from "../../../utils/ffEmbeds.js";

const SAMPLE = 24;

function requireStaffGuild(interaction: CommandInteraction): GuildMember | null {
	const m = interaction.member;
	if (!interaction.inGuild() || !m || typeof m === "string") {
		void interaction.reply({
			ephemeral: true,
			embeds: [ffErrorEmbed("Server only", "Run this in a guild where you have staff or owner access.")],
		});
		return null;
	}
	const gm = m as GuildMember;
	if (!isStaff(gm) && !isFortuneFrenzyOwner(gm)) {
		void interaction.reply({
			ephemeral: true,
			embeds: [ffErrorEmbed("Not allowed", "Requires staff role, staff allowlist user id, or FF owner id.")],
		});
		return null;
	}
	return gm;
}

@Discord()
class FFInventory {
	@Slash({
		description: "[Staff] List raw inventory rows (item id, user asset id, serial, copy) for a user.",
		name: "ffinventory",
	})
	async ffinventory(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id")
				.setRequired(true),
		)
		robloxUserId: string,
		interaction: CommandInteraction,
	) {
		const staff = requireStaffGuild(interaction);
		if (!staff) return;

		const uid = robloxUserId.trim();
		if (!/^\d+$/.test(uid)) {
			return interaction.reply({
				ephemeral: true,
				embeds: [ffErrorEmbed("Invalid id", "Use a numeric Roblox user id.")],
			});
		}

		await interaction.deferReply({ ephemeral: true });

		try {
			const rows = await ffGetInventoryRows(uid);
			const sample = rows.slice(0, SAMPLE);
			const lines = sample.map((r) => {
				const [item, uaid, serial, copy] = r;
				return `\`${item}\` · ${uaid} · ${serial} · ${copy?.slice(0, 12) ?? "—"}`;
			});
			const footer =
				rows.length > SAMPLE
					? `_Showing **${SAMPLE}** of **${rows.length}** copies._`
					: rows.length > 0
						? `_Total **${rows.length}** copies._`
						: "";

			const embed = applyFfBranding(
				new EmbedBuilder()
					.setColor(FF.brand)
					.setTitle("Inventory (raw)")
					.setDescription(`User [\`${uid}\`](${robloxProfileUrl(uid)})${footer ? `\n${footer}` : ""}`),
				"hero",
			);

			if (lines.length === 0) {
				embed.addFields({ name: "Rows", value: "_No item copies in MariaDB for this user._", inline: false });
			} else {
				let chunk = "";
				let part = 1;
				for (const line of lines) {
					const next = chunk ? `${chunk}\n${line}` : line;
					if (next.length > 950) {
						embed.addFields({ name: `Rows (${part})`, value: chunk.slice(0, 1024), inline: false });
						part++;
						chunk = line;
					} else {
						chunk = next;
					}
				}
				if (chunk) {
					embed.addFields({ name: `Rows (${part})`, value: chunk.slice(0, 1024), inline: false });
				}
			}

			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffinventory", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
