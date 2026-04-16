import { GuildMember } from "discord.js";
import nobloxjs from "noblox.js";
import { getGameRankStaffRoleId } from "../config/discord-ids.js";
import { getMariaConnection } from "../services/mariaService.js";
import { client as discordClient } from "../index.js";

export default async function (user_id: string): Promise<void> {
	const guild = discordClient.guilds.cache.get(process.env.GUILD_ID as string);
	if (!guild) return;
	let member: GuildMember | undefined = undefined;

	try {
		member = (await guild.members.fetch(user_id)) as GuildMember;
	} catch (error) {}

	if (!member) return;

	const connection = await getMariaConnection();
	const [data] = await connection.query("SELECT * FROM roblox_oauth_data WHERE discord_id = ?", [member.id]);

	if (!data) {
		return;
	}

	for (const key in data) {
		if (typeof data[key] === "string") {
			try {
				data[key] = JSON.parse(data[key]);
			} catch (e) {
				// If parsing fails, keep the original string
			}
		}
	}

	const roblox_user_id = data.claims_cache.sub as string;
	const group_rank = await nobloxjs.getRankInGroup(34843840, parseInt(roblox_user_id));
	const bindings = await connection.query("SELECT * FROM roblox_group_binds");
	let binding = bindings.find((bind: any) => bind.group_rank === group_rank) || {
		group_rank: 0,
		discord_id: "1169775476756201635",
	};

	console.log(binding);
	console.log(`Updating roles for ${member.user.tag} with rank ${group_rank} and role ${binding.discord_id}`);

	const bind_role = binding.discord_id;
	const verified_role = "1169775476756201634";
	const unverified_role = "1169775476756201633";
	const staff_role = getGameRankStaffRoleId();

	try {
		await member.roles.set([
			...new Set([
				...member.roles.cache
					.filter(
						(role) =>
							role.id !== unverified_role &&
							!bindings.some((bind: any) => bind.discord_id === role.id && bind.discord_id !== bind_role),
					)
					.map((role) => role.id),
				bind_role,
				verified_role,
				...(group_rank > 3 ? [staff_role] : []),
			]),
		]);
	} catch (error) {}

	// update the user's nickname
	try {
		const roblox_username = data.claims_cache.preferred_username as string;
		await member.setNickname(roblox_username);
	} catch (error) {}
}
