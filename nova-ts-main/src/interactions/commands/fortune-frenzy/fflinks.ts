import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash } from "discordx";
import { applyFfBranding, FF } from "../../../utils/ffEmbeds.js";

const DEFAULT_GAME_URL = "https://www.roblox.com/games/138955851313890/Fortune-Frenzy";

@Discord()
class FFLinks {
	@Slash({
		description: "Fortune Frenzy on Roblox — play link.",
		name: "fflinks",
	})
	async fflinks(interaction: CommandInteraction) {
		const gameUrl = (process.env.FF_LINK_GAME ?? DEFAULT_GAME_URL).trim();

		const embed = applyFfBranding(
			new EmbedBuilder()
				.setColor(FF.brand)
				.setTitle("Fortune Frenzy")
				.setDescription(`**Roblox game**\n${gameUrl}`),
			"hero",
		);

		return interaction.reply({ embeds: [embed], ephemeral: true });
	}
}
