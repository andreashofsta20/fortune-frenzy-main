import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	Guild,
	ThreadChannel,
} from "discord.js";
import { ButtonComponent, Discord } from "discordx";
import { getMariaConnection } from "../../services/mariaService.js";
import { errorEmbed, successEmbed } from "../../utils/embed.js";

@Discord()
class startSupport {
	@ButtonComponent({ id: "start_support_ticket" })
	async handler(interaction: ButtonInteraction) {
		const connection = await getMariaConnection();
		const member = interaction.member;
		if (!member) return;

		const [ticket] = await connection.query("SELECT * FROM support_tickets WHERE customer = ?", [member.user.id]);
		if (ticket) {
			connection.release();
			return await interaction.reply({
				embeds: [
					errorEmbed(
						"You already have a ticket open!",
						"You can only have one ticket open at a time. Find your current ticket [here](https://discord.com/channels/@me/1280277822262345761)",
					),
				],
				ephemeral: true,
			});
		}

		await connection.query("INSERT INTO support_tickets (customer) VALUES (?)", [member.user.id]);

		try {
			await interaction.user.send({
				content: `### Hi there!\nThanks for contacting Novaware support! I'm Nova, here to assist you in resolving your issue as thoroughly as possible.\n\nTo get started, please describe your issue in as much detail as you can. Once you're done, simply say **"Done"**, and I'll connect you with the support team best suited to help. Please note, I can't view images, so try to keep everything in text if possible. When you're connected with a human, they'll be able to see any images you provide.`,
			});
		} catch (error) {
			connection.release();
			return await interaction.reply({
				embeds: [
					errorEmbed(
						"I couldn't DM you!",
						"I need to be able to DM you to start a ticket, please enable DMs from server members and try again.",
					),
				],
				ephemeral: true,
			});
		}

		connection.release();
		return interaction.reply({
			embeds: [
				successEmbed(
					"Ticket Created!",
					"I've sent you a DM to get started on your ticket. Please check your DMs!",
				),
			],
			ephemeral: true,
		});
	}
}
