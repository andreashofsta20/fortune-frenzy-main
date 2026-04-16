import { ArgsOf } from "discordx";
import { getMariaConnection } from "../../services/mariaService.js";

const level_roles = [
	{ level: 5, role: "1169775476739411982" },
	{ level: 10, role: "1169775476739411983" },
	{ level: 25, role: "1169775476739411984" },
	{ level: 50, role: "1169775476739411985" },
	{ level: 75, role: "1169775476739411986" },
	{ level: 100, role: "1169775476739411987" },
];

const limited_time_roles = [
	{ name: "early supporter", role: "1312381746477662279", level: 10, end: new Date("2025-01-01") },
];

interface User {
	user_id: string;
	messages_sent: number;
	xp: number;
	last_message: Date;
	claimed_limited_roles: string;
}

export function calculate_level(xp: number) {
	function f(x: number) {
		return 1.6667 * Math.pow(x, 3) + 22.5 * Math.pow(x, 2) + 75.8333 * x - xp;
	}

	function df(x: number) {
		return 5 * Math.pow(x, 2) + 45 * x + 75.8333;
	}

	let x0 = xp / 100;
	let x1 = x0 - f(x0) / df(x0);

	while (Math.abs(x1 - x0) > 0.0001) {
		x0 = x1;
		x1 = x0 - f(x0) / df(x0);
	}

	const current_level = Math.floor(x1);
	const next_level = current_level + 1;

	function xp_for_level(level: number) {
		return 1.6667 * Math.pow(level, 3) + 22.5 * Math.pow(level, 2) + 75.8333 * level;
	}

	const xp_next_level = xp_for_level(next_level);
	const xp_needed = xp_next_level - xp;

	return {
		current_level: current_level,
		xp_to_next_level: xp_needed,
	};
}

export default async function ([message]: ArgsOf<"messageCreate">): Promise<void> {
	const connection = await getMariaConnection("NovawareDiscord");
	if (!connection) return;

	try {
		if (!message.member || message.author.bot || !message.guild) {
			connection.release();
			return;
		}
		let [user] = (await connection.query("SELECT * FROM discord_user_data WHERE user_id = ?", [
			message.author.id,
		])) as User[];

		if (!user) {
			await connection.query("INSERT INTO discord_user_data (user_id) VALUES (?)", [message.author.id]);
			[user] = await connection.query("SELECT * FROM discord_user_data WHERE user_id = ?", [message.author.id]);
		}

		if (new Date().getTime() - user.last_message.getTime() < 60000) {
			await connection.query("UPDATE discord_user_data SET messages_sent = messages_sent + 1 WHERE user_id = ?", [
				message.author.id,
			]);

			connection.release();
			return;
		}

		const double_xp_expiry = new Date(1735340781000);
		let new_xp = user.xp + (Math.floor(15 + Math.random() * 11));
		const current_level = calculate_level(user.xp).current_level;
		const new_level = calculate_level(new_xp).current_level;

		if (new Date() < double_xp_expiry) {
			new_xp += Math.floor(15 + Math.random() * 11);
		}

		await connection.query(
			"UPDATE discord_user_data SET xp = ?, messages_sent = messages_sent + 1, last_message = ? WHERE user_id = ?",
			[new_xp, new Date(), message.author.id],
		);

		if (new_level > current_level) {
			const member = message.member;
			const highest_role = level_roles.filter((level_role) => new_level >= level_role.level).pop()?.role || null;
			const new_roles = member.roles.cache
				.filter((role) => !level_roles.some((level_role) => role.id === level_role.role))
				.map((role) => role.id);

			console.log(new_level, new_roles);

			if (highest_role) {
				new_roles.push(highest_role);
			}

			const currentDate = new Date();
			const claimedRoles = user.claimed_limited_roles ? user.claimed_limited_roles.split(",") : [];
			limited_time_roles.forEach((limitedRole) => {
				if (new_level >= limitedRole.level && currentDate <= limitedRole.end && !claimedRoles.includes(limitedRole.role)) {
					new_roles.push(limitedRole.role);
					claimedRoles.push(limitedRole.role);
				}
			});

			await member.roles.set([...new Set(new_roles)]);

			await connection.query(
				"UPDATE discord_user_data SET claimed_limited_roles = ? WHERE user_id = ?",
				[claimedRoles.join(","), message.author.id]
			);

			const notification_channel = message.guild.channels.cache.get("1286039240685260895");
			if (notification_channel && notification_channel.isSendable()) {
				notification_channel.send(
					`Congratulations <@${message.author.id}>, you have reached level **${new_level}**! 🎉`,
				);
			}
		}
	} catch (error) {
		console.error(error);
	} finally {
		connection.release();
	}
}
