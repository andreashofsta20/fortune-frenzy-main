import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash } from "discordx";
import { ffGetSettings } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { applyFfBranding, FF } from "../../../utils/ffEmbeds.js";
import { FF_PUBLIC_SETTING_KEYS, formatPublicSettingValue } from "../../../utils/ffPublicSettings.js";

@Discord()
class FFInfo {
	@Slash({
		description: "Public game settings snapshot (paycheck, polling, game open) — non-sensitive keys only.",
		name: "ffinfo",
	})
	async ffinfo(interaction: CommandInteraction) {
		await interaction.deferReply();

		try {
			const all = await ffGetSettings();
			const lines: string[] = [];
			for (const key of FF_PUBLIC_SETTING_KEYS) {
				if (!(key in all)) continue;
				const v = formatPublicSettingValue(all[key]);
				lines.push(`**${key}** — ${v}`);
			}

			const embed = applyFfBranding(
				new EmbedBuilder()
					.setColor(FF.brand)
					.setTitle("Game info")
					.setDescription(
						lines.length > 0
							? lines.join("\n")
							: "No allowlisted keys in the response. Add rows in `settings` or extend `FF_PUBLIC_SETTING_KEYS` in the bot.",
					),
				"hero",
			);

			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffinfo", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
