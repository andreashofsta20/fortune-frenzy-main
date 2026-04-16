import dotenv from "dotenv";
dotenv.config();

import { dirname, importx } from "@discordx/importer";
import { IntentsBitField, Partials } from "discord.js";
import { Client } from "discordx";

/**
 * "Used disallowed intents" = Developer Portal → Bot → Privileged Gateway Intents:
 * enable SERVER MEMBERS INTENT + MESSAGE CONTENT INTENT, then restart the container.
 *
 * Temporary workaround: set DISCORD_SKIP_PRIVILEGED_INTENTS=true (guild member events,
 * reading message text, and `!` commands that need content may not work until intents are on).
 */
const skipPrivileged = process.env.DISCORD_SKIP_PRIVILEGED_INTENTS === "true";

const gatewayIntents = [
	IntentsBitField.Flags.Guilds,
	IntentsBitField.Flags.GuildMessages,
	IntentsBitField.Flags.GuildMessageReactions,
	IntentsBitField.Flags.GuildVoiceStates,
	IntentsBitField.Flags.DirectMessages,
];
if (!skipPrivileged) {
	gatewayIntents.push(IntentsBitField.Flags.GuildMembers, IntentsBitField.Flags.MessageContent);
}

export const client = new Client({
	intents: gatewayIntents,
	partials: [Partials.Channel, Partials.Message],
	silent: false,
	simpleCommand: {
		prefix: "!",
	},
});

async function main() {
	await importx(`${dirname(import.meta.url)}/interactions/**/*.{ts,js}`);

	if (!process.env.DISCORD_TOKEN) {
		throw Error("DISCORD_TOKEN is not defined");
	}

	await client.login(process.env.DISCORD_TOKEN);
}

void main();

export default client;
