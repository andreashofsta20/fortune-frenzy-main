import { Modding } from "@flamework/core";
import { Players } from "@rbxts/services";

import { Functions } from "server/network";
import { Request } from "server/util/packeter";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { isAdminUserId } from "shared/util/is-admin-user";

export default {
	function: Functions.Admin.WipeProfile,
	handle: async (player: Player, userId: number) => {
		if (!isAdminUserId(player.UserId)) {
			return { status: "error", code: 403, message: "Unauthorized" };
		}

		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const targetPlayer = Players.GetPlayerByUserId(userId);
		if (!targetPlayer) {
			return { status: "error", code: 400, message: "Player must be online to wipe profile" };
		}

		const wiped = await playerManagementService.wipeOnlineProfile(targetPlayer);
		if (!wiped) {
			return { status: "error", code: 500, message: "Failed to wipe profile" };
		}

		const request = await new Request("POST", `/users/${userId}/wipe-profile`).GetResponse();
		if (!request.Success) {
			const response = request.Response as { error?: string };
			return {
				status: "error",
				code: request.Code,
				message: response.error ?? "Failed to wipe inventory",
			};
		}

		await playerManagementService.refreshInventory(targetPlayer, 0.1);
		playerManagementService.recordRecentActivity(
			targetPlayer,
			"Admin wiped profile",
			"rbxassetid://86337070472077",
		);
		playerManagementService.recordRecentActivity(
			player,
			`Wiped profile for ${targetPlayer.DisplayName}`,
			"rbxassetid://86337070472077",
		);

		return { status: "OK" };
	},
};
