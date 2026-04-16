import { CommandInteraction, SlashCommandStringOption } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { ffGetLeaderboards } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { buildLeaderboardPageEmbed, leaderboardButtonRow } from "../../../utils/ffLeaderboardUi.js";

@Discord()
class FFLeaderboard {
	@Slash({
		description: "Fortune Frenzy top players by cached cash or inventory value.",
		name: "ffleaderboard",
	})
	async ffleaderboard(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("metric")
				.setDescription("Which leaderboard to show")
				.setRequired(true)
				.addChoices(
					{ name: "Cash", value: "cash" },
					{ name: "Value", value: "value" },
				),
		)
		metric: "cash" | "value",
		interaction: CommandInteraction,
	) {
		await interaction.deferReply();

		try {
			const { cash, value } = await ffGetLeaderboards();
			const rows = metric === "cash" ? cash : value;
			const embed = buildLeaderboardPageEmbed(rows, metric, 0);
			const components = rows.length ? [leaderboardButtonRow(metric, 0, rows.length)] : [];

			await interaction.editReply({ embeds: [embed], components });
		} catch (e) {
			logFfCommandError("ffleaderboard", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
