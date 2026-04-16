import { PoolConnection } from "mariadb";
import { client as discordClient } from "../index.js";
import { EmbedBuilder } from "discord.js";

export default async function (connection: PoolConnection, fingerprint: string): Promise<void> {
	const accounts = await connection.query(
		"SELECT discord_id FROM `roblox_oauth_data` WHERE `private_fingerprint` = ?",
		[fingerprint],
	);

	const guild = discordClient.guilds.cache.get(process.env.GUILD_ID as string);
	if (!guild) return;

	for (const account of accounts) {
		guild.members
			.fetch(account.discord_id)
			.then(async (user) => {
				await user
					.send({
						embeds: [
							new EmbedBuilder()
								.setDescription(
									`### <:xxx:1280251418166689903> You have been banned from Novaware.\n\nWe have detected that you have joined from a network that has been blacklisted. If you believe this is a mistake, please contact a staff member.`,
								)
								.setColor("#f04747"),
						],
					})
					.catch(() => {});

				try {
					await guild.members.ban(account.discord_id, {
						reason: `Blacklisted Fingerprint: ${fingerprint}`,
					});
				} catch (error) {}
			})
			.catch(() => {});
	}

	connection.release();
}
