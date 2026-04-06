import { Players } from "@rbxts/services";

import { Functions } from "server/network";
import { isAdminUserId } from "shared/util/is-admin-user";

export default {
	function: Functions.Admin.BanUser,
	handle: async (player: Player, userId: number, reason: string, durationSeconds: number) => {
		if (!isAdminUserId(player.UserId)) {
			return { status: "error", code: 403, message: "Unauthorized" };
		}

		const normalizedUserId = math.floor(userId ?? 0);
		if (normalizedUserId <= 0) {
			return { status: "error", code: 400, message: "Invalid user" };
		}

		const normalizedDuration = math.floor(math.max(0, tonumber(durationSeconds) ?? 0));
		if (normalizedDuration <= 0) {
			return { status: "error", code: 400, message: "Invalid duration" };
		}

		const safeReason = tostring(reason ?? "");
		const displayReason = safeReason.size() > 0 ? safeReason : "You have been banned.";
		const privateReason = safeReason.size() > 0 ? `Admin ban: ${safeReason}` : "Admin ban";

		const [banSuccess, banError] = pcall(() =>
			Players.BanAsync({
				UserIds: [normalizedUserId],
				DisplayReason: displayReason,
				PrivateReason: privateReason,
				Duration: normalizedDuration,
			}),
		);

		if (!banSuccess) {
			return { status: "error", code: 500, message: tostring(banError) };
		}

		return { status: "OK" };
	},
};
