import { ButtonInteraction } from "discord.js";
import { ButtonComponent, Discord } from "discordx";
import { ffStatusActionRow } from "../../utils/ffStatusComponents.js";
import { buildFfErrorEmbed } from "../../utils/ffSlashErrors.js";
import { buildFfStatusEmbed } from "../../utils/ffStatusUi.js";

@Discord()
class FfStatusRefreshButton {
	@ButtonComponent({ id: "ffstatus_refresh" })
	async onRefresh(interaction: ButtonInteraction) {
		try {
			await interaction.deferUpdate();
			const embed = await buildFfStatusEmbed();
			await interaction.editReply({ embeds: [embed], components: [ffStatusActionRow()] });
		} catch (e) {
			await interaction.followUp({ ephemeral: true, embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
