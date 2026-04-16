import { CommandInteraction, EmbedBuilder } from "discord.js";
import { Discord, Slash } from "discordx";
import { ffGetCases } from "../../../services/fortuneFrenzyApi.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { applyFfBranding, FF, formatCompact } from "../../../utils/ffEmbeds.js";

const MAX_LINES = 18;

@Discord()
class FFCases {
	@Slash({
		description: "List item cases in rotation (catalog from the API).",
		name: "ffcases",
	})
	async ffcases(interaction: CommandInteraction) {
		await interaction.deferReply();

		try {
			const cases = await ffGetCases();
			if (cases.length === 0) {
				const embed = applyFfBranding(
					new EmbedBuilder()
						.setColor(FF.brand)
						.setTitle("Cases")
						.setDescription("No cases returned from the API."),
					"hero",
				);
				return interaction.editReply({ embeds: [embed] });
			}

			const lines = cases.slice(0, MAX_LINES).map((c) => {
				const flags = [
					c.vip_only ? "VIP" : null,
					c.available_for_gems ? "gems" : null,
				]
					.filter(Boolean)
					.join(" · ");
				const meta = flags ? ` · ${flags}` : "";
				return `**${c.id}** — ${formatCompact(c.price)} · value ${formatCompact(c.min_value)}–${formatCompact(c.max_value)}${meta}\n_${c.next_rotation.slice(0, 19)}_`;
			});
			const more =
				cases.length > MAX_LINES
					? `\n\n_Showing **${MAX_LINES}** of **${cases.length}**._`
					: "";

			const embed = applyFfBranding(
				new EmbedBuilder()
					.setColor(FF.brand)
					.setTitle("Item cases")
					.setDescription(lines.join("\n\n") + more),
				"hero",
			);

			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffcases", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
