import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash } from "discordx";
import { ffGetMinigameStats } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { applyFfBranding, FF, formatCompact } from "../../../utils/ffEmbeds.js";

@Discord()
class FFStats {
	@Slash({
		description: "Minigame aggregate stats (CCU, games played, wins/losses) from the API cache.",
		name: "ffstats",
	})
	async ffstats(interaction: CommandInteraction) {
		await interaction.deferReply();

		try {
			const stats = await ffGetMinigameStats();
			const modes = Object.keys(stats).sort();
			if (modes.length === 0) {
				const embed = applyFfBranding(
					new EmbedBuilder()
						.setColor(FF.brand)
						.setTitle("Minigame stats")
						.setDescription("No modes returned."),
					"hero",
				);
				return interaction.editReply({ embeds: [embed] });
			}

			const embed = applyFfBranding(
				new EmbedBuilder().setColor(FF.brand).setTitle("Minigame stats"),
				"hero",
			);

			for (const mode of modes) {
				const s = stats[mode]!;
				const w = s.total_wins + s.total_losses;
				const wr = w > 0 ? `${((100 * s.total_wins) / w).toFixed(1)}%` : "—";
				embed.addFields({
					name: mode,
					value: `CCU **${formatCompact(s.current_ccu)}** · played **${formatCompact(Number(s.total_games_played))}** · W/L **${formatCompact(Number(s.total_wins))}** / **${formatCompact(Number(s.total_losses))}** (${wr}) · spent **${formatCompact(Number(s.total_spent))}**`,
					inline: false,
				});
			}

			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffstats", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
