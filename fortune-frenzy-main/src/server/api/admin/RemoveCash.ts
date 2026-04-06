import { Modding } from "@flamework/core";
import { Players } from "@rbxts/services";

import { Functions } from "server/network";
import { Request } from "server/util/packeter";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { addCommasToNumber } from "shared/util/number-utils";
import { isAdminUserId } from "shared/util/is-admin-user";

export default {
	function: Functions.Admin.RemoveCash,
	handle: async (player: Player, userId: number, amount: number) => {
		if (!isAdminUserId(player.UserId)) {
			return { status: "error", code: 403, message: "Unauthorized" };
		}

		const normalizedAmount = math.floor(math.max(0, tonumber(amount) ?? 0));
		if (normalizedAmount <= 0) {
			return { status: "error", code: 400, message: "Invalid amount" };
		}

		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const targetPlayer = Players.GetPlayerByUserId(userId);
		const targetName = targetPlayer?.DisplayName ?? targetPlayer?.Name ?? tostring(userId);

		if (!targetPlayer && !playerManagementService.hasPlayedBefore(userId)) {
			return { status: "error", code: 404, message: "Player has never joined this game" };
		}

		if (targetPlayer) {
			await playerManagementService.addCash(targetPlayer, -normalizedAmount);
			playerManagementService.recordRecentActivity(
				targetPlayer,
				`Admin removed $${addCommasToNumber(normalizedAmount)} cash`,
				"rbxassetid://86337070472077",
			);
			playerManagementService.recordRecentActivity(
				player,
				`Removed $${addCommasToNumber(normalizedAmount)} from ${targetName}`,
				"rbxassetid://86337070472077",
			);

			const profile = await playerManagementService.getOnlineProfile(targetPlayer, true);
			return {
				status: "OK",
				balance: profile?.Data.Cash ?? 0,
			};
		}

		const request = await new Request("POST", `/users/${userId}/remove-cash`, undefined, {
			amount: tostring(normalizedAmount),
		}).GetResponse();
		if (!request.Success) {
			const response = request.Response as { error?: string };
			return {
				status: "error",
				code: request.Code,
				message: response.error ?? "Failed to remove cash",
			};
		}

		playerManagementService.recordRecentActivity(
			player,
			`Removed $${addCommasToNumber(normalizedAmount)} from ${targetName}`,
			"rbxassetid://86337070472077",
		);
		playerManagementService.invalidatePlayerInformationCache(userId);
		return { status: "OK" };
	},
};
