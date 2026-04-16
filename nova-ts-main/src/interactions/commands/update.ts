import { CommandInteraction, GuildMember, SlashCommandUserOption, User } from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { isStaff } from "../../config/discord-ids.js";
import { errorEmbed, successEmbed } from "../../utils/embed.js";
import updateMemberRoles from "../../utils/updateMemberRoles.js";

@Discord()
class update {
	@Slash({ description: "Update your own or another user.", name: "update" })
	async update(
		@SlashOption(
			new SlashCommandUserOption()
				.setName("user")
				.setDescription("You can only use this option as a staff member.")
				.setRequired(false),
		)
		user: User,
		interaction: CommandInteraction,
	) {
		const member = interaction.member as GuildMember;
		if (!member) return;

		if (user && !isStaff(member)) {
			return interaction.reply({
				embeds: [
					errorEmbed("You can't use that option.", "You must be a staff member to use the `user` option."),
				],
			});
		}

		await interaction.deferReply();
		await updateMemberRoles(user ? user.id : member.id);

		await interaction.editReply({
			embeds: [successEmbed("All done!", `Roles and nickname have been updated for ${user ? user : member.user}.`)],
		});
	}
}
