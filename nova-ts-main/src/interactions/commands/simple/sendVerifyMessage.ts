import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, Message } from "discord.js";
import { Discord, SimpleCommand, SimpleCommandMessage } from "discordx";
import { isStaff } from "../../../config/discord-ids.js";
import generateCase from "../../../utils/generateCase.js";
import { getMariaConnection } from "../../../services/mariaService.js";

@Discord()
export class sendVerifyMessage {
	@SimpleCommand({ name: "sendVerifyMessage" })
	async sendVerifyMessage(command: SimpleCommandMessage) {
		const embed = new EmbedBuilder()
			.setDescription(
				"### <:novawareemoji:1276797939074727948> Welcome to Novaware!\nIn order to gain access to the rest of the server, you need to verify your Roblox account.\n\nGet started by clicking the **Verify with Roblox** button  below.",
			)
			.setColor("#129f5e");

		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("verify")
				.setLabel("Verify with Roblox")
				.setStyle(ButtonStyle.Secondary)
				.setEmoji("<:nova_roblox:1278482136881430650>"),
		);

		if (command.message.channel.isSendable()) {
			await command.message.channel.send({ embeds: [embed], components: [row] });
		}
	}

	@SimpleCommand({ name: "sendSupportMessage" })
	async sendSupportMessage(command: SimpleCommandMessage) {
		const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId("start_support_ticket")
				.setLabel("Nova_AI Support #1")
				.setStyle(ButtonStyle.Secondary),
		);

		if (command.message.channel.isSendable()) {
			await command.message.channel.send({ content: "Model `asst_p2pE5zsiJ8kg1mZn2TVZmVRz`", components: [row] });
		}
	}

	@SimpleCommand({ name: "regenCases" })
	async regenCases(command: SimpleCommandMessage) {
		if (!isStaff(command.message.member)) return;

		await generateCase("tier_1");
		await generateCase("tier_2");
		await generateCase("tier_3");
		await generateCase("tier_4");
		await generateCase("tier_5");
		await generateCase("tier_6");

		command.message.reply("Cases have been regenerated.");
	}

	// @SimpleCommand({ name: "startArticleProcessing" })
	// async startArticleProcessing(command: SimpleCommandMessage) {
	// 	const maria = await getMariaConnection("Game1");
	// 	const items = await maria.query("SELECT id, name, needs_article FROM items WHERE needs_article = 0");

	// 	// loop through each item and ask the user if it needs an article
	// 	for (const item of items) {
	// 		const msg = await command.message.reply(
	// 			`Does \`${item.name}\` need an article?\n\nExample **Nice! You got a ${item.name}**`,
	// 		);

	// 		const filter = (m: Message) => m.author.id === command.message.author.id;
	// 		const collected = await msg.channel.awaitMessages({
	// 			filter,
	// 			max: 1,
	// 		});

	// 		if (collected.first()?.content.toLowerCase() === "yes") {
	// 			await maria.query("UPDATE items SET needs_article = 1 WHERE id = ?", [item.id]);
	// 			await msg.delete();
	// 			continue;
	// 		} else {
	// 			// do nothing since it doesn't need an article
	// 			await msg.delete();
	// 			continue;
	// 		}
	// 	}

	// 	await maria.release();
	// 	command.message.reply("All items have been processed.");
	// }
}
