import { Players } from "@rbxts/services";

import { Functions } from "server/network";
import { isAdminUserId } from "shared/util/is-admin-user";

export default {
	function: Functions.Admin.KickUser,
	handle: async (player: Player, userId: number, reason: string) => {
		if (!isAdminUserId(player.UserId)) {
			return { status: "error", code: 403, message: "Unauthorized" };
		}

		const normalizedUserId = math.floor(userId ?? 0);
		const targetPlayer = Players.GetPlayerByUserId(normalizedUserId);
		if (!targetPlayer) {
			return { status: "error", code: 404, message: "Player is not online" };
		}

		const safeReason = tostring(reason ?? "");
		const message = safeReason.size() > 0 ? safeReason : "You have been kicked.";
		targetPlayer.Kick(message);

		return { status: "OK" };
	},
};
