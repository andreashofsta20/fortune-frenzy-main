import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonInteraction,
	ButtonStyle,
	EmbedBuilder,
	Guild,
	Snowflake,
	ThreadChannel,
	User,
} from "discord.js";
import { ButtonComponent, Discord } from "discordx";
import { getMariaConnection } from "../../services/mariaService.js";
import { getRedisConnection } from "../../services/redisService.js";
import { client as discordClient } from "../../index.js";
import * as client from "openid-client";
import { randomBytes } from "crypto";
import getAccountsWithFingerprint from "../../utils/getAccountsWithFingerprint.js";
import { PoolConnection } from "mariadb";
import scanAndBanFingerprint from "../../utils/scanAndBanFingerprint.js";
import updateMemberRoles from "../../utils/updateMemberRoles.js";
import { errorEmbed } from "../../utils/embed.js";
import getAccountsWithUserId from "../../utils/getAccountsWithUserId.js";

@Discord()
class verify {
	@ButtonComponent({ id: "verify" })
	async handler(interaction: ButtonInteraction) {
		const connection = await getMariaConnection();
		const redis = await getRedisConnection();
		let pendingLink = await redis.hGet("RobloxOAuth", interaction.user.id);

		let [oauth_data] = await connection.query("SELECT * FROM `roblox_oauth_data` WHERE `discord_id` = ?", [
			interaction.user.id,
		]);

		if (!oauth_data || oauth_data.proxy_check.vpn === "yes" || oauth_data.proxy_check.proxy === "yes") {
			// allow the user to reverify if they're not verified or if they're using a VPN
			if (!pendingLink) {
				let config = await client.discovery(
					new URL("https://apis.roblox.com/oauth/.well-known/openid-configuration"),
					process.env.ROAUTH_CLIENT_ID as string,
					process.env.ROAUTH_CLIENT_SECRET as string,
				);
				const urlId = randomBytes(4).toString("hex").slice(0, 7);
				const nonce = client.randomNonce();
				const authUrl = client.buildAuthorizationUrl(config, {
					redirect_uri: "https://auth.noxirity.com/",
					response_type: "code",
					scope: "openid profile group:read",
					id_token_signed_response_alg: "ES256",
					nonce: nonce,
					state: urlId,
				});

				const b64 = Buffer.from(
					JSON.stringify({
						discordId: interaction.user.id,
						state: urlId,
						nonce: nonce,
						date: Date.now(),
						urlId: urlId,
						url: authUrl,
					}),
				).toString("base64");

				await redis.hSet("RobloxOAuth", interaction.user.id, b64);
				await redis.hSet("RobloxOAuthLinkShortener", urlId, b64);

				pendingLink = b64;
			}

			const data = JSON.parse(Buffer.from(pendingLink, "base64").toString("utf-8"));
			const url = `https://auth.noxirity.com/verify/${data.urlId}/`;

			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setDescription(
							`### <a:loading:1279856922522030162> Waiting for verification...\n\nClick the link below to verify your account with Roblox.`,
						)
						.setColor("#c83c79"),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setURL(url).setStyle(ButtonStyle.Link).setLabel("Verify"),
					),
				],
				ephemeral: true,
			});

			const waitForPendingLink = (userId: string): Promise<boolean> => {
				return new Promise((resolve, reject) => {
					const interval = setInterval(async () => {
						const pendingLink = await redis.hGet("RobloxOAuth", userId);
						if (!pendingLink) {
							clearInterval(interval);
							clearTimeout(timeout);
							resolve(true);
						}
					}, 1000);

					const timeout = setTimeout(() => {
						clearInterval(interval);
						resolve(true);
					}, 180000); // 2 minutes
				});
			};

			const success = await waitForPendingLink(interaction.user.id);
			if (!success) {
				connection.release();
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setDescription(
								`### <:close:1252438815189241897> You took too long!\n\nSorry, but you took too long to verify your account. Please try again.`,
							)
							.setColor("#c83c3c"),
					],
					components: [],
				});
			}

			[oauth_data] = await connection.query("SELECT * FROM `roblox_oauth_data` WHERE `discord_id` = ?", [
				interaction.user.id,
			]);

			if (!oauth_data) {
				connection.release();
				return interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setDescription(
								`### <:nova_error:1278474560026706020> That wasn't meant to happen.\n\n Something went wrong while trying to verify your account. Please try again.`,
							)
							.setColor("#f76f6e"),
					],
					components: [],
				});
			}
		} else {
			await interaction.deferReply({ ephemeral: true });
		}

		// [[ LOADING EMBED IS NOT NECESSARY DUE TO HOW FAST THE VERIFICATION PROCESS IS ]]
		// await interaction.editReply({
		// 	embeds: [
		// 		new EmbedBuilder()
		// 			.setDescription(
		// 				`### <a:loading:1279856922522030162> Doing some final checks...\n\nDon't worry, this will only take a few seconds - we're just verifying your account.`,
		// 			)
		// 			.setColor("#de922f"),
		// 	],
		// 	components: [],
		// });
		for (const key in oauth_data) {
			if (typeof oauth_data[key] === "string") {
				try {
					oauth_data[key] = JSON.parse(oauth_data[key]);
				} catch (e) {
					// If parsing fails, keep the original string
				}
			}
		}

		const blacklisted_fingerprint: [] = await connection.query(
			"SELECT * FROM `blacklisted_fingerprints` WHERE `fingerprint` = ?",
			[oauth_data.private_fingerprint],
		);

		if (blacklisted_fingerprint.length > 0) {
			await interaction.user
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
				await interaction.guild?.members.ban(interaction.user.id, {
					reason: `Blacklisted Fingerprint: ${oauth_data.private_fingerprint}`,
				});
			} catch (error) {}

			connection.release();
			return;
		}

		if (oauth_data.proxy_check.vpn === "yes" || oauth_data.proxy_check.proxy === "yes") {
			NotifyVPNVerification(oauth_data, interaction.user.id);
		}

		const private_fingerprint = oauth_data.private_fingerprint;
		await NotifyBannedAccounts(connection, private_fingerprint);
		await NotifyMatchingAccounts(connection, oauth_data.claims_cache.sub);
		updateMemberRoles(interaction.user.id);

		connection.release();

		return interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setDescription(
						`### <:verified:1279479576661196931> All done!\n\nWelcome to Novaware, ${oauth_data.claims_cache.name}! You will receive your roles in a few seconds.`,
					)
					.setThumbnail(oauth_data.claims_cache.picture)
					.setColor("#3ba45c"),
			],
			components: [],
		});
	}

	@ButtonComponent({ id: "ignore_fingerprint" })
	async ignoreFingerprint(interaction: ButtonInteraction) {
		await interaction.update({
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setLabel(
							`Approved by ${interaction.user.username} on ${new Date().toLocaleString("en-GB")} UTC`,
						)
						.setStyle(ButtonStyle.Secondary)
						.setEmoji("<:check:1280532164051468288>")
						.setCustomId("ignore_fingerprint")
						.setDisabled(true),
				),
			],
		});
	}

	@ButtonComponent({ id: "blacklist_fingerprint" })
	async blacklistFingerprint(interaction: ButtonInteraction) {
		const connection = await getMariaConnection();
		const fingerprint = interaction.message.embeds[0]?.description?.match(/Fingerprint: `(.*)`/)?.[1];

		if (!fingerprint) {
			return interaction.reply({
				content: "I couldn't find the fingerprint in the message embed.",
				ephemeral: true,
			});
		}

		const [account] = await connection.query("SELECT * FROM `roblox_oauth_data` WHERE `public_fingerprint` = ?", [
			fingerprint,
		]);
		if (!account) {
			return interaction.reply({
				content: "I couldn't find an account with the provided fingerprint.",
				ephemeral: true,
			});
		}

		try {
			await connection.query("INSERT INTO `blacklisted_fingerprints` (`fingerprint`) VALUES (?)", [
				account.private_fingerprint,
			]);
		} catch (error) {}

		await interaction.update({
			components: [
				new ActionRowBuilder<ButtonBuilder>().addComponents(
					new ButtonBuilder()
						.setLabel(
							`Blacklisted by ${interaction.user.username} on ${new Date().toLocaleString("en-GB")} UTC`,
						)
						.setStyle(ButtonStyle.Danger)
						.setEmoji("<:cancel:1280528425760591882>")
						.setCustomId("blacklist_fingerprint")
						.setDisabled(true),
				),
			],
		});

		scanAndBanFingerprint(connection, account.private_fingerprint);
	}
}

async function NotifyBannedAccounts(connection: PoolConnection, private_fingerprint: string) {
	const matching_accounts = await getAccountsWithFingerprint(connection, private_fingerprint);

	if (matching_accounts.length < 2) {
		return;
	}

	const guild = discordClient.guilds.cache.get(process.env.GUILD_ID as string) as Guild;
	let string = "";

	for (const account of matching_accounts) {
		try {
			const ban_info = await guild.bans.fetch(account.discord_id);
			const case_id_match = ban_info.reason?.match(/\[([^\]]+)\]/);
			const case_id = case_id_match ? case_id_match[1] : "Unknown";
			const case_link =
				case_id !== "Unknown"
					? `https://dashboard.sapph.xyz/1169775476739411978/moderation/cases/${case_id}`
					: "Unknown";

			string += `\n[${account.claims_cache.preferred_username}](<https://www.roblox.com/users/${account.claims_cache.sub}/profile>) | \`${account.discord_id}\` **[[BANNED]](${case_link})**`;
		} catch (error) {
			string += `\n[${account.claims_cache.preferred_username}](<https://www.roblox.com/users/${account.claims_cache.sub}/profile>) | \`${account.discord_id}\``;
			continue;
		}
	}

	const thread = (await guild.channels.fetch("1280230894376063109")) as ThreadChannel;
	thread.send({
		embeds: [
			new EmbedBuilder()
				.setDescription(
					`### <:warn:1280263046173819067> Alternative Accounts Detected!\n\nI've detected multiple accounts with the same fingerprint, please review the accounts below and take action if necessary.\n${string}\n\nFingerprint: \`${matching_accounts[0].public_fingerprint}\`\n\n-# Please note that users that live in the same household may have the same fingerprint. Only take action if you believe the accounts are related to ban evasion or other malicious activities.`,
				)
				.setColor("#E15B24"),
		],
		content: "<@&1169775476756201642> <@&1179695744224084038>",
		components: [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setLabel("Approve")
					.setStyle(ButtonStyle.Secondary)
					.setEmoji("<:check:1280532164051468288>")
					.setCustomId("ignore_fingerprint"),
				new ButtonBuilder()
					.setLabel("Blacklist Fingerprint")
					.setStyle(ButtonStyle.Danger)
					.setEmoji("<:cancel:1280528425760591882>")
					.setCustomId("blacklist_fingerprint"),
			),
		],
	});
}

async function NotifyMatchingAccounts(connection: PoolConnection, user_id: string) {
	const matching_accounts = await getAccountsWithUserId(connection, user_id);

	if (matching_accounts.length < 2) {
		return;
	}

	const guild = discordClient.guilds.cache.get(process.env.GUILD_ID as string) as Guild;
	let string = "";

	console.log(matching_accounts);

	for (const account of matching_accounts) {
		try {
			string += `\n[${account.claims_cache.preferred_username}](<https://www.roblox.com/users/${account.claims_cache.sub}/profile>) | \`${account.discord_id}\``;
		} catch (error) {
			string += `\n[${account.claims_cache.preferred_username}](<https://www.roblox.com/users/${account.claims_cache.sub}/profile>) | \`${account.discord_id}\``;
			continue;
		}
	}

	const thread = (await guild.channels.fetch("1280230894376063109")) as ThreadChannel;
	thread.send({
		embeds: [
			new EmbedBuilder()
				.setDescription(
					`### <:warn:1280263046173819067> Matching Accounts Detected!\n\nI've detected multiple accounts with the same Roblox user ID, please review the accounts below and take action if necessary.\n${string}`,
				)
				.setColor("#E15B24"),
		],
	});
}

async function NotifyVPNVerification(oauth_data: any, user_id: Snowflake) {
	const guild = discordClient.guilds.cache.get(process.env.GUILD_ID as string) as Guild;
	const user = await guild.members.fetch(user_id);
	const thread = (await guild.channels.fetch("1280230894376063109")) as ThreadChannel;

	thread.send({
		embeds: [
			new EmbedBuilder()
				.setDescription(
					`### <:warn:1280263046173819067> VPN Detected!\n\nI've detected that ${user} is using a VPN to connect to Novaware. Please review the account below and take action if necessary.\n\n[${oauth_data.claims_cache.preferred_username}](<https://www.roblox.com/users/${oauth_data.claims_cache.sub}/profile>) | \`${user_id}\`\n\n\`\`\`json\n${JSON.stringify(oauth_data.proxy_check, null, 2)}\n\`\`\``,
				)
				.setColor("#E15B24"),
		],
	});
}
