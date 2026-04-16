import { PoolConnection } from "mariadb";
import client, { client as discordClient } from "../../index.js";
import { ChannelType, EmbedBuilder, Message, WebhookClient } from "discord.js";
import { ArgsOf } from "discordx";
import { getMariaConnection } from "../../services/mariaService.js";
import { getTicketCategoryAndMessage } from "../AI/getTicketCategoryAndMessage.js";
import { getGrammarCorrectedString } from "../AI/getGrammarCorrectedString.js";

export default async function ([message]: ArgsOf<"messageCreate">): Promise<void> {
	const connection = await getMariaConnection();
	let ticket;

	if (message.channel.type === ChannelType.PrivateThread) {
		[ticket] = await connection.query("SELECT * FROM support_tickets WHERE open_thread_id = ?", [
			message.channel.id,
		]);
		if (!ticket) {
			connection.release();
			return;
		}

		return handleSupportTeamMessage(connection, message, ticket);
	} else {
		[ticket] = await connection.query("SELECT * FROM support_tickets WHERE customer = ?", [message.author.id]);
		if (!ticket) {
			connection.release();
			return;
		}

		if (ticket.status === "initial") {
			return handleInitialStatus(connection, message, ticket);
		} else if (ticket.status === "open") {
			return handleOpenStatus(connection, message, ticket);
		}
	}
}

async function handleInitialStatus(connection: PoolConnection, message: Message, ticket: any): Promise<void> {
	const doneMessages = ["done", '"done"'];
	if (!doneMessages.some((doneMessage) => message.content.toLowerCase().startsWith(doneMessage))) {
		const current_stored_string = ticket.initial_message;
		const new_message =
			current_stored_string === null ? message.content : `${current_stored_string}\n${message.content}`;
		await connection.query("UPDATE support_tickets SET initial_message = ? WHERE customer = ?", [
			new_message,
			message.author.id,
		]);

		connection.release();
		return;
	}

	await connection.query("UPDATE support_tickets SET status = 'open' WHERE customer = ?", [message.author.id]);

	if (!message.channel.isSendable()) return;

	const loading_message = await message.channel.send(
		"Got it. Give me a few seconds to process your query and I'll get your ticket opened in no time.",
	);

	const grammar_fixed = await getGrammarCorrectedString(ticket.initial_message);
	console.log(grammar_fixed.message);
	const result = await getTicketCategoryAndMessage(grammar_fixed.message);
	loading_message.delete();
	const guild = await client.guilds.fetch("1169775476739411978");
	const channel = guild.channels.cache.get("1169775478467465394");
	if (!channel) return;

	if (channel.isTextBased() && channel.type === ChannelType.GuildText) {
		const ticket_channel = await channel.threads.create({
			name: `${result.category} | @${message.author.username}`,
			type: ChannelType.PrivateThread,
			reason: "New support ticket",
		});

		await connection.query("UPDATE support_tickets SET open_thread_id = ? WHERE customer = ?", [
			ticket_channel.id,
			message.author.id,
		]);

		await ticket_channel.send({
			embeds: [
				new EmbedBuilder()
					.setDescription(`### <:nova_arrow:1279184777781710932> ${result.title}\n${grammar_fixed.message}`)
					.setColor("#3ba45c")
					.setFooter({
						iconURL: message.author.avatarURL() || undefined,
						text: `Ticket opened by ${message.author.tag}`,
					}),
			],
			// content: "<@&STAFF_ROLE_ID>", // use config/discord-ids STAFF_ROLE_ID if needed
		});
	}

	connection.release();
	await message.channel.send({
		content: `${result.message}\n\n**Your ticket has been opened, and all messages sent here will be forwarded to the support team.**`,
	});
}

async function handleOpenStatus(connection: PoolConnection, message: Message, ticket: any): Promise<void> {
	const ticket_channel = await discordClient.channels.fetch(ticket.open_thread_id);
	if (!ticket_channel) return;

	if (!message.channel.isSendable() || !ticket_channel.isSendable()) return;

	const webhookClient = new WebhookClient({
		url: "https://discord.com/api/webhooks/1310355621467525212/0Te2PI27uk1vbUv2VWmS-imhXB7dVKdg5kFzF335_l-dWMFp4Yc3iynO_5uogBOjv0ZE",
	});

	webhookClient.send({
		content: message.content || ".",
		files: message.attachments.map((attachment) => attachment.url),
		embeds: message.embeds,
		allowedMentions: { parse: [] },
		threadId: ticket_channel.id,
		avatarURL: message.author.avatarURL() || "",
		username: message.author.username,
	});

	connection.release();
	return;
}

async function handleSupportTeamMessage(connection: PoolConnection, message: Message, ticket: any): Promise<void> {
	// forwards the message to the customer
	const customer = await discordClient.users.fetch(ticket.customer);
	if (!customer) return;

	const corrected_grammar = await getGrammarCorrectedString(message.content);
	await customer.send({
		content: corrected_grammar.message || message.content || ".",
		files: message.attachments.map((attachment) => attachment.url),
		embeds: message.embeds,
	});

	connection.release();
	return;
}
