import { CommandInteraction, EmbedBuilder, SlashCommandStringOption } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { ffGetActive } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { applyFfBranding, FF, robloxProfileUrl } from "../../../utils/ffEmbeds.js";

@Discord()
class FFActive {
	@Slash({
		description: "Check whether a Roblox user is marked active in-game (Redis heartbeat).",
		name: "ffactive",
	})
	async ffactive(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id")
				.setRequired(true),
		)
		robloxUserId: string,
		interaction: CommandInteraction,
	) {
		await interaction.deferReply();

		const uid = robloxUserId.trim();
		if (!/^\d+$/.test(uid)) {
			return interaction.editReply({
				embeds: [
					applyFfBranding(
						new EmbedBuilder()
							.setColor(FF.err)
							.setTitle("Invalid id")
							.setDescription("Use a numeric Roblox user id."),
						"hero",
					),
				],
			});
		}

		try {
			const active = await ffGetActive(uid);
			const embed = applyFfBranding(
				new EmbedBuilder()
					.setColor(active ? FF.ok : FF.brand)
					.setTitle(active ? "In-game (active)" : "Not active")
					.setDescription(
						`User [\`${uid}\`](${robloxProfileUrl(uid)}) — **${active ? "yes" : "no"}** (best-effort; depends on game heartbeats).`,
					),
				"hero",
			);
			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffactive", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
