import { Modding } from "@flamework/core";
import { Players } from "@rbxts/services";

import { Functions } from "server/network";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { ItemManagementService } from "server/services/ItemManagementService";
import { isAdminUserId } from "shared/util/is-admin-user";

export default {
	function: Functions.Admin.RemoveItems,
	handle: async (player: Player, userId: number, itemId: string, amount: number) => {
		if (!isAdminUserId(player.UserId)) {
			return { status: "error", code: 403, message: "Unauthorized" };
		}

		const normalizedItemId = tostring(itemId ?? "");
		const normalizedAmount = math.floor(math.max(0, tonumber(amount) ?? 0));
		if (normalizedItemId.size() === 0 || normalizedAmount <= 0) {
			return { status: "error", code: 400, message: "Invalid item request" };
		}

		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const itemManagementService = Modding.resolveSingleton(ItemManagementService);
		if (!itemManagementService.ItemInfo.has(normalizedItemId)) {
			return { status: "error", code: 404, message: "Invalid item" };
		}

		const targetPlayer = Players.GetPlayerByUserId(userId);
		if (!targetPlayer && !playerManagementService.hasPlayedBefore(userId)) {
			return { status: "error", code: 404, message: "Player has never joined this game" };
		}

		const result = await playerManagementService.removeItemsFromInventory(userId, {
			[normalizedItemId]: normalizedAmount,
		});
		if (result.status !== "OK") {
			return { status: "error", code: result.code ?? 400, message: result.message ?? "Remove failed" };
		}

		const itemName = itemManagementService.ItemInfo.get(normalizedItemId)?.name ?? normalizedItemId;
		if (targetPlayer) {
			playerManagementService.recordRecentActivity(
				targetPlayer,
				`Admin removed ${normalizedAmount}x ${itemName}`,
				"rbxassetid://86337070472077",
			);
		}
		playerManagementService.recordRecentActivity(
			player,
			`Removed ${normalizedAmount}x ${itemName} from ${tostring(userId)}`,
			"rbxassetid://86337070472077",
		);
		playerManagementService.invalidatePlayerInformationCache(userId);

		return {
			status: "OK",
			removed: result.removed ?? 0,
		};
	},
};
