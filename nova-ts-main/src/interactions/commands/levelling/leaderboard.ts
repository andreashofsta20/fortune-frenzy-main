import { CommandInteraction, EmbedBuilder, GuildMember, SlashCommandUserOption, User } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { getMariaConnection } from "../../../services/mariaService.js";
import { calculate_level } from "../../../utils/messageCreation/handleLevelling.js";
import { errorEmbed } from "../../../utils/embed.js";

@Discord()
class rank {
	@Slash({ description: "Check the XP leaderboard.", name: "leaderboard" })
	async rank(interaction: CommandInteraction) {
		if (!interaction.guild) return;
		const connection = await getMariaConnection("NovawareDiscord");
		if (!connection) return;

		try {
			await interaction.deferReply();
			const leaderboard = await connection.query(
				"SELECT user_id, xp FROM discord_user_data ORDER BY xp DESC LIMIT 10;",
			);

			let description = "### <:rap:1256718470234771457> XP Leaderboard\n\n";
			const embed = new EmbedBuilder().setColor("#129f5d").setTimestamp();

			for (let i = 0; i < leaderboard.length; i++) {
				try {
					const user = await interaction.client.users.fetch(leaderboard[i].user_id);
					description += `**${i + 1}.** ${user.username} - Level ${calculate_level(leaderboard[i].xp).current_level.toLocaleString()} (${leaderboard[i].xp.toLocaleString()})\n`;
				} catch (error) {
					description += `**${i + 1}.** Unknown User - Level ${calculate_level(leaderboard[i].xp).current_level.toLocaleString()} (${leaderboard[i].xp.toLocaleString()})\n`;
				}
			}

			embed.setDescription(description);
			await interaction.editReply({ embeds: [embed] });
		} catch (error) {
			return interaction.editReply({
				embeds: [errorEmbed("An error occurred.", "Please try again later.")],
			});
		} finally {
			await connection.end();
		}
	}
}
