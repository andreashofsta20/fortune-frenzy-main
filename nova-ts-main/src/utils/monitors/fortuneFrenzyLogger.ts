import { Client } from "discordx";
import { EmbedBuilder, WebhookClient } from "discord.js";
import { getRedisConnection } from "../../services/redisService.js";

type LogPriority = "Log" | "Warning" | "Danger" | "EmergencyWakeTheFuckUpNow";

/**
 * Subscribes to Redis pub/sub from the Fortune Frenzy Go API (channel api_discord_log by default)
 * and posts matching messages to a Discord webhook. Enable with FORTUNE_FRENZY_API_LOGS_ENABLED=true.
 *
 * Use the same Redis as api.fortunefrenzy.xyz. On the API, set DISCORD_REDIS_RELAY_ENABLED=true.
 * If you also set DISCORD_WEBHOOK_URL on the API, you may get duplicate Discord posts unless you
 * disable one path or use different webhooks.
 */
export async function fortuneFrenzyLogger(client: Client) {
	const webhookUrl = process.env.FORTUNE_FRENZY_LOG_WEBHOOK_URL;
	if (!webhookUrl) {
		console.warn("[fortuneFrenzyLogger] Set FORTUNE_FRENZY_LOG_WEBHOOK_URL to forward API logs.");
		return;
	}

	const channel = process.env.FF_API_LOG_REDIS_CHANNEL ?? "api_discord_log";
	const redis = await getRedisConnection();
	const subscriber = redis.duplicate();
	await subscriber.connect();

	const webhook = new WebhookClient({ url: webhookUrl });

	await subscriber.subscribe(channel, async (message: string) => {
		try {
			const parsed = JSON.parse(message) as {
				title: string;
				description: string;
				priority: LogPriority;
			};

			const colorMap: Record<LogPriority, number> = {
				Log: 0x00ff00,
				Warning: 0xffff00,
				Danger: 0xff0000,
				EmergencyWakeTheFuckUpNow: 0xff0000,
			};

			await webhook.send({
				embeds: [
					new EmbedBuilder()
						.setTitle(parsed.title)
						.setDescription(parsed.description)
						.setColor(colorMap[parsed.priority] ?? 0xff0000),
				],
			});
		} catch (e) {
			console.error("[fortuneFrenzyLogger] failed to relay message:", e);
		}
	});

	console.log(`[fortuneFrenzyLogger] Subscribed to Redis channel "${channel}" → Discord webhook (bot ${client.user?.tag})`);
}
