import { ButtonInteraction } from "discord.js";
import { ButtonComponent, Discord } from "discordx";
import { ffGetLeaderboards } from "../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed } from "../../utils/ffSlashErrors.js";
import {
	buildLeaderboardPageEmbed,
	leaderboardButtonRow,
	parseLeaderboardNavId,
} from "../../utils/ffLeaderboardUi.js";

const PAGE_SIZE = 5;
const MAX_ROWS = 15;

@Discord()
class FfLeaderboardNavButtons {
	@ButtonComponent({ id: /^fflb_nav_(cash|value)_\d+_(prev|next)$/ })
	async onLeaderboardNav(interaction: ButtonInteraction) {
		const parsed = parseLeaderboardNavId(interaction.customId);
		if (!parsed) {
			return interaction.reply({ ephemeral: true, content: "Unknown button." });
		}

		try {
			const { cash, value } = await ffGetLeaderboards();
			const rows = parsed.metric === "cash" ? cash : value;
			const totalPages = Math.max(1, Math.ceil(Math.min(rows.length, MAX_ROWS) / PAGE_SIZE));
			let page = parsed.page;
			if (parsed.dir === "prev") {
				page = Math.max(0, page - 1);
			} else {
				page = Math.min(totalPages - 1, page + 1);
			}

			const embed = buildLeaderboardPageEmbed(rows, parsed.metric, page);
			const row = leaderboardButtonRow(parsed.metric, page, rows.length);

			await interaction.update({ embeds: [embed], components: rows.length ? [row] : [] });
		} catch (e) {
			await interaction.reply({
				ephemeral: true,
				embeds: [buildFfErrorEmbed(e)],
			});
		}
	}
}
