import type { GuildMember } from "discord.js";

/**
 * Discord **user** IDs treated as owner/staff for bot commands (no role required).
 * Add more ids to the set if needed.
 */
export const STAFF_USER_IDS = new Set<string>(["1406927216918401087", "510511574910369792"]);

/**
 * Optional **role** id: members with this role are also staff (in addition to STAFF_USER_IDS).
 * Set `DISCORD_STAFF_ROLE_ID` in `.env` if you use a staff role.
 */
export function getOptionalStaffRoleId(): string | undefined {
	const id = process.env.DISCORD_STAFF_ROLE_ID;
	return id !== undefined && id !== "" ? id : undefined;
}

/**
 * **Role** id granted when Roblox `group_rank > 3` in `updateMemberRoles` (must exist in your server).
 * Override with `DISCORD_GAME_RANK_STAFF_ROLE_ID` in `.env`.
 */
export function getGameRankStaffRoleId(): string {
	return process.env.DISCORD_GAME_RANK_STAFF_ROLE_ID ?? "1277325690664124428";
}

export function isStaff(member: GuildMember | null | undefined): boolean {
	if (!member) return false;
	if (STAFF_USER_IDS.has(member.id)) return true;
	const roleId = getOptionalStaffRoleId();
	if (roleId !== undefined && member.roles.cache.has(roleId)) return true;
	return false;
}
