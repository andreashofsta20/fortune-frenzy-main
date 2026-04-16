import type { GuildMember, User } from "discord.js";

/** Discord user id allowed to run Fortune Frenzy owner commands (wipe, deep search, Discord kick/ban helpers). */
const FORTUNE_FRENZY_OWNER_IDS = new Set<string>(["1406927216918401087", "510511574910369792"]);

export function isFortuneFrenzyOwner(userOrMember: GuildMember | User | null | undefined): boolean {
	if (!userOrMember) return false;
	return FORTUNE_FRENZY_OWNER_IDS.has(userOrMember.id);
}
