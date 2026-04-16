import { EmbedBuilder } from "discord.js";
import { FortuneFrenzyApiError } from "../services/fortuneFrenzyApi.js";
import { ffErrorEmbed } from "./ffEmbeds.js";

/** User-visible embed for any thrown value from Fortune Frenzy slash commands. */
export function buildFfErrorEmbed(e: unknown): EmbedBuilder {
	if (e instanceof FortuneFrenzyApiError) {
		if (e.status === 401) {
			return ffErrorEmbed(
				"Unauthorized",
				"The API rejected your key. Copy **`PACKETER_BYPASS_KEY`** from the Go API `.env` into the bot `.env` (same value), or fix `server-id` + `api-key` vs Redis. Restart the bot after saving.",
			);
		}
		if (e.status === -1) {
			return ffErrorEmbed("Cannot reach API", truncate(e.message, 3500));
		}
		if (e.status === -2) {
			return ffErrorEmbed("Invalid response", truncate(e.message, 3500));
		}
		return ffErrorEmbed("API error", truncate(e.message, 3500));
	}

	const msg = e instanceof Error ? e.message : String(e);
	if (msg.includes("FF API auth:") || msg.includes("PACKETER_BYPASS") || msg.includes("FORTUNE_FRENZY_")) {
		return ffErrorEmbed(
			"Not configured",
			"Set **`PACKETER_BYPASS_KEY`** (same as the Go API) or **`FORTUNE_FRENZY_SERVER_ID`** + **`FORTUNE_FRENZY_API_KEY`**. In Docker use **`FORTUNE_FRENZY_API_BASE_URL=http://ff-api:3004`**. Restart the bot.",
		);
	}

	return ffErrorEmbed("Something went wrong", truncate(msg, 400));
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : `${s.slice(0, max - 20)}…`;
}

export function logFfCommandError(tag: string, e: unknown): void {
	if (e instanceof Error) {
		console.error(`[${tag}]`, e.message, e.stack);
	} else {
		console.error(`[${tag}]`, e);
	}
}
