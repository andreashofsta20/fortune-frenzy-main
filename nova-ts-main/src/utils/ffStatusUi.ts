import { EmbedBuilder } from "discord.js";
import { ffAuthedSmokePing, ffPingHealth, type FfHealthPingResult } from "../services/fortuneFrenzyApi.js";
import { applyFfBranding, FF } from "./ffEmbeds.js";

function displayEndpoint(base: string): string {
	try {
		const u = new URL(base.includes("://") ? base : `http://${base}`);
		return u.origin;
	} catch {
		return base.replace(/\/$/, "");
	}
}

function healthDescription(r: FfHealthPingResult, healthy: boolean): string {
	if (healthy) {
		let jsonHint = "";
		if (r.bodyPreview) {
			try {
				const j = JSON.parse(r.bodyPreview) as { status?: string };
				if (typeof j.status === "string") {
					jsonHint = ` · JSON \`status\`: **${j.status}**`;
				}
			} catch {
				/* ignore */
			}
		}
		return `**${r.latencyMs}ms** · HTTP **${r.statusCode}**${jsonHint}`;
	}
	if (r.error) {
		return `**${r.error.slice(0, 500)}**`;
	}
	return `HTTP **${r.statusCode}** (${r.latencyMs}ms)`;
}

export async function buildFfStatusEmbed(): Promise<EmbedBuilder> {
	const r = await ffPingHealth();
	const auth = await ffAuthedSmokePing();
	const endpoint = displayEndpoint(r.baseUrl);
	const healthy = r.ok && r.statusCode >= 200 && r.statusCode < 300;
	const authOk = auth.ok;

	const color =
		healthy && authOk ? FF.ok : healthy || authOk ? FF.brand : FF.err;

	const title =
		healthy && authOk
			? "API online"
			: healthy
				? "API reachable (auth issue)"
				: authOk
					? "Health check failed (auth OK)"
					: "API not healthy";

	let authLines: string;
	if (auth.statusCode === 0 && auth.detail?.includes("FF API auth:")) {
		authLines = `**Not configured** — set \`PACKETER_BYPASS_KEY\` (or server id + API key) on the bot.`;
	} else if (auth.ok) {
		authLines = `**${auth.latencyMs}ms** · HTTP **${auth.statusCode}** (\`GET /leaderboard\`)`;
	} else {
		authLines = `HTTP **${auth.statusCode}** · ${auth.detail?.slice(0, 280) ?? "—"}`;
	}

	return applyFfBranding(
		new EmbedBuilder()
			.setColor(color)
			.setTitle(title)
			.setDescription(
				healthy && authOk
					? "Public health route and authenticated leaderboard both responded."
					: "Compare the two checks below — **health** needs no keys; **authenticated** proves bot credentials work.",
			)
			.addFields(
				{
					name: "Health (no auth)",
					value: `${healthy ? "OK" : "Fail"} · ${healthDescription(r, healthy)}\n\`${endpoint}\` · \`GET /health\``,
					inline: false,
				},
				{
					name: "Authenticated smoke",
					value: `${authOk ? "OK" : "Fail"} · ${authLines}`,
					inline: false,
				},
				{
					name: "Note",
					value:
						"`GET /users/get-cash-changes` is a **consuming** queue pull — the bot does not call it from Discord.",
					inline: false,
				},
			),
		"hero",
	);
}
