import { Modding } from "@flamework/core";
import { Players, ServerScriptService } from "@rbxts/services";

import { Functions } from "server/network";
import { Request } from "server/util/packeter";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { isAdminUserId } from "shared/util/is-admin-user";
import { Trade } from "typings/APIResponses";

function groupInventory(inventory: [string, string, string, string][]) {
	return inventory.reduce((map, item) => {
		const itemId = item[0];
		const uaid = item[1];
		if (!map.has(itemId)) {
			map.set(itemId, []);
		}
		map.get(itemId)!.push(uaid);
		return map;
	}, new Map<string, string[]>());
}

export default {
	function: Functions.Admin.GetPanelData,
	handle: async (player: Player, userId: number) => {
		if (!isAdminUserId(player.UserId)) {
			return { status: "error", code: 403, message: "Unauthorized" };
		}

		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
			if (!playerManagementService.hasPlayedBefore(userId)) {
				return { status: "error", code: 404, message: "Player has never joined this game" };
			}

		const playerInfo = await playerManagementService.getPlayerInformation(userId);
		if (playerInfo.status !== "OK" || !playerInfo.data) {
			return { status: "error", code: 404, message: "User not found" };
		}

		const inventoryRequest = await playerManagementService.getOfflineUserInventory(userId);
		const inventory = groupInventory(inventoryRequest);

		const tradesRequest = await new Request("GET", `/trades/${userId}`).GetResponse();
		const trades = tradesRequest.Success
			? ((tradesRequest.Response as { status: string; trades: Trade[] }).trades ?? [])
			: [];

		return {
			status: "OK",
			data: {
				player: {
					pData: playerInfo.data.pData,
					recentActivity: playerInfo.data.recentActivity,
					trades,
					inventory,
					online: Players.GetPlayerByUserId(userId) !== undefined,
				},
				server: {
					activePlayers: Players.GetPlayers().size(),
					serverId: tostring(ServerScriptService.GetAttribute("server_id") ?? "unknown"),
					selectedUserId: tostring(userId),
				},
			},
		};
	},
};