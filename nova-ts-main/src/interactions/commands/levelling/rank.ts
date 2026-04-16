import { CommandInteraction, EmbedBuilder, GuildMember, SlashCommandUserOption, User } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { getMariaConnection } from "../../../services/mariaService.js";
import { calculate_level } from "../../../utils/messageCreation/handleLevelling.js";
import { errorEmbed } from "../../../utils/embed.js";

@Discord()
class rank {
	@Slash({ description: "Get your current rank and level.", name: "rank" })
	async rank(interaction: CommandInteraction) {
		const connection = await getMariaConnection("NovawareDiscord");
		if (!connection) return;

		try {
			const member = interaction.member as GuildMember;
			if (!member) {
				console.log("Member not found");
				return;
			}

			let [user] = await connection.query(
				"WITH ranked_users AS (SELECT user_id, xp, RANK() OVER (ORDER BY xp DESC) AS rank FROM discord_user_data) SELECT user_id, xp, rank FROM ranked_users WHERE user_id = ?;",
				[member.id],
			);

			if (!user) {
				user = {
					user_id: member.id,
					xp: 0,
					rank: "Unranked",
				};
			}

			const embed = new EmbedBuilder()
				.setDescription(
					`### <:nova_arrow:1279184777781710932> Your Rank\n**Leaderboard Rank:** ${user.rank}\n**Level**: ${calculate_level(user.xp).current_level} (${user.xp.toLocaleString()}/${Math.floor(calculate_level(user.xp).xp_to_next_level + user.xp).toLocaleString()} XP)`,
				)
				.setColor("#129f5d")
				.setThumbnail(member.user.displayAvatarURL());

			await interaction.reply({ embeds: [embed] });
		} catch (error) {
			return interaction.reply({
				embeds: [errorEmbed("An error occurred.", "Please try again later.")],
			});
		} finally {
			await connection.end();
		}
	}
}
