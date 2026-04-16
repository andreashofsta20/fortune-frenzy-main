import {
	CommandInteraction,
	EmbedBuilder,
	GuildMember,
	SlashCommandIntegerOption,
	SlashCommandStringOption,
	SlashCommandUserOption,
	User,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { FF, ffErrorEmbed, ffSuccessEmbed } from "../../../utils/ffEmbeds.js";
import { isFortuneFrenzyOwner } from "../../../config/fortune-frenzy-owner.js";
import { ffGetUser, ffSearchUsers, ffWipeProfile } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";

function deny(interaction: CommandInteraction) {
	return interaction.reply({
		ephemeral: true,
		embeds: [ffErrorEmbed("Not allowed", "Fortune Frenzy owner id only.")],
	});
}

@Discord()
class FFAdmin {
	@Slash({
		description: "[Owner] Wipe a Roblox user profile in the game database (items + stats).",
		name: "ffwipe",
	})
	async ffwipe(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id to wipe")
				.setRequired(true),
		)
		robloxUserId: string,
		interaction: CommandInteraction,
	) {
		const caller = interaction.member as GuildMember | null;
		if (!caller || !isFortuneFrenzyOwner(caller)) {
			return deny(interaction);
		}
		if (!/^\d+$/.test(robloxUserId.trim())) {
			return interaction.reply({
				ephemeral: true,
				embeds: [ffErrorEmbed("Invalid id", "Use a numeric Roblox user id.")],
			});
		}

		await interaction.deferReply({ ephemeral: true });

		try {
			await ffWipeProfile(robloxUserId.trim());
			return interaction.editReply({
				embeds: [
					ffSuccessEmbed(
						"Profile wiped",
						`User \`${robloxUserId.trim()}\` was reset via the API (items + stats).`,
					),
				],
			});
		} catch (e) {
			logFfCommandError("ffwipe", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}

	@Slash({
		description: "[Owner] Search players (up to 100) with cash and value — more detail than /ffplayer.",
		name: "ffsearch",
	})
	async ffsearch(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("keywords")
				.setDescription("Part of Roblox username (empty = top by default sort)")
				.setRequired(false),
		)
		keywords: string | undefined,
		@SlashOption(
			new SlashCommandIntegerOption()
				.setName("limit")
				.setDescription("Max rows (default 25, max 100)")
				.setRequired(false)
				.setMinValue(1)
				.setMaxValue(100),
		)
		limit: number | undefined,
		interaction: CommandInteraction,
	) {
		const caller = interaction.member as GuildMember | null;
		if (!caller || !isFortuneFrenzyOwner(caller)) {
			return deny(interaction);
		}

		await interaction.deferReply({ ephemeral: true });

		try {
			const results = await ffSearchUsers({
				keywords: keywords?.trim() ?? "",
				limit: limit ?? 25,
				sort: "value_high",
			});
			if (results.length === 0) {
				return interaction.editReply({
					embeds: [ffErrorEmbed("No results", "No rows matched your search.")],
				});
			}

			const lines = results.slice(0, 40).map((r, i) => {
				return `**${i + 1}.** \`${r.name}\` / ${r.display_name} · cash **${Math.round(r.current_cash).toLocaleString()}** · value **${Math.round(r.current_value).toLocaleString()}** · \`${r.id}\``;
			});

			const embed = new EmbedBuilder()
				.setColor(0xc2410c)
				.setAuthor({ name: "Fortune Frenzy" })
				.setTitle("Database search")
				.setDescription(lines.join("\n").slice(0, 3900))
				.setFooter({ text: `${results.length} row(s)${results.length > 40 ? " · truncated" : ""}` });

			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffsearch", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}

	@Slash({
		description: "[Owner] Deep profile dump for a Roblox user id (raw API fields).",
		name: "ffprofile",
	})
	async ffprofile(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id")
				.setRequired(true),
		)
		robloxUserId: string,
		interaction: CommandInteraction,
	) {
		const caller = interaction.member as GuildMember | null;
		if (!caller || !isFortuneFrenzyOwner(caller)) {
			return deny(interaction);
		}
		if (!/^\d+$/.test(robloxUserId.trim())) {
			return interaction.reply({
				ephemeral: true,
				embeds: [ffErrorEmbed("Invalid id", "Use a numeric Roblox user id.")],
			});
		}

		await interaction.deferReply({ ephemeral: true });

		try {
			const u = await ffGetUser(robloxUserId.trim());
			if (!u) {
				return interaction.editReply({
					embeds: [ffErrorEmbed("Not found", "No user with that id.")],
				});
			}
			const json = JSON.stringify(u, null, 2).slice(0, 3900);
			const embed = new EmbedBuilder()
				.setColor(FF.brand)
				.setAuthor({ name: "Fortune Frenzy" })
				.setTitle(`API payload · ${u.user_id}`)
				.setDescription("```json\n" + json + "\n```");
			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffprofile", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}

	@Slash({
		description: "[Owner] Kick a member from this Discord server (not the Roblox game).",
		name: "ffdiscordkick",
	})
	async ffdiscordkick(
		@SlashOption(
			new SlashCommandUserOption()
				.setName("member")
				.setDescription("Discord user to kick")
				.setRequired(true),
		)
		target: User,
		@SlashOption(
			new SlashCommandStringOption()
				.setName("reason")
				.setDescription("Optional reason (audit log)")
				.setRequired(false),
		)
		reason: string | undefined,
		interaction: CommandInteraction,
	) {
		const caller = interaction.member as GuildMember | null;
		if (!caller || !isFortuneFrenzyOwner(caller)) {
			return deny(interaction);
		}
		if (!interaction.guild) {
			return interaction.reply({ ephemeral: true, embeds: [ffErrorEmbed("Guild only", "Use this in a server.")] });
		}

		return interaction.deferReply({ ephemeral: true }).then(async () => {
			try {
				const gm = await interaction.guild!.members.fetch(target.id);
				await gm.kick(reason ?? "FF owner kick");
				return interaction.editReply({
					embeds: [ffSuccessEmbed("Kicked", `<@${target.id}> was removed from this server.`)],
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return interaction.editReply({ embeds: [ffErrorEmbed("Kick failed", msg)] });
			}
		});
	}

	@Slash({
		description: "[Owner] Ban a member from this Discord server (not the Roblox game).",
		name: "ffdiscordban",
	})
	async ffdiscordban(
		@SlashOption(
			new SlashCommandUserOption()
				.setName("member")
				.setDescription("Discord user to ban")
				.setRequired(true),
		)
		target: User,
		@SlashOption(
			new SlashCommandStringOption()
				.setName("reason")
				.setDescription("Optional reason (audit log)")
				.setRequired(false),
		)
		reason: string | undefined,
		interaction: CommandInteraction,
	) {
		const caller = interaction.member as GuildMember | null;
		if (!caller || !isFortuneFrenzyOwner(caller)) {
			return deny(interaction);
		}
		if (!interaction.guild) {
			return interaction.reply({ ephemeral: true, embeds: [ffErrorEmbed("Guild only", "Use this in a server.")] });
		}

		return interaction.deferReply({ ephemeral: true }).then(async () => {
			try {
				await interaction.guild!.members.ban(target, { reason: reason ?? "FF owner ban", deleteMessageSeconds: 0 });
				return interaction.editReply({
					embeds: [ffSuccessEmbed("Banned", `<@${target.id}> was banned from this server.`)],
				});
			} catch (e) {
				const msg = e instanceof Error ? e.message : String(e);
				return interaction.editReply({ embeds: [ffErrorEmbed("Ban failed", msg)] });
			}
		});
	}

	@Slash({
		description: "Why in-game ban/kick from Discord is not available from this bot yet.",
		name: "ffgamehelp",
	})
	async ffgamehelp(interaction: CommandInteraction) {
		return interaction.reply({
			ephemeral: true,
			embeds: [
				new EmbedBuilder()
					.setColor(FF.brand)
					.setAuthor({ name: "Fortune Frenzy" })
					.setTitle("In-game vs Discord moderation")
					.setDescription(
						"The HTTP API can **read** data and **wipe** profiles. **Roblox** ban/kick lives in **game** `RemoteFunctions`, not HTTP — add a bridge (HTTPS + game handler or MessagingService) if you need that from Discord.\n\nFor **this server** only: **`/ffdiscordkick`** · **`/ffdiscordban`** (owner).",
					),
			],
		});
	}
}
