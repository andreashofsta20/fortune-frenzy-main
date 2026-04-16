import { CommandInteraction } from "discord.js";
import { Discord, Slash } from "discordx";
import { ffStatusActionRow } from "../../../utils/ffStatusComponents.js";
import { buildFfStatusEmbed } from "../../../utils/ffStatusUi.js";

@Discord()
class FFStatus {
	@Slash({
		description: "API health (GET /health) plus authenticated smoke (GET /leaderboard).",
		name: "ffstatus",
	})
	async ffstatus(interaction: CommandInteraction) {
		await interaction.deferReply();

		const embed = await buildFfStatusEmbed();
		return interaction.editReply({ embeds: [embed], components: [ffStatusActionRow()] });
	}
}
