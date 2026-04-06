import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { PlayerManagementService } from "server/services/PlayerManagementService";

export default {
	function: Functions.Users.GetUserInventory,
	handle: async (player: Player, userId: number) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		if (userId <= 0 || !playerManagementService.hasPlayedBefore(userId)) {
			return new Map<string, string[]>();
		}

		return (await playerManagementService.getOfflineUserInventory(userId)).reduce((map, data) => {
			const itemId = data[0];
			if (!map.has(itemId)) {
				map.set(itemId, []);
			}
			map.get(itemId)!.push(`${data[1]}|${data[3]}`);
			return map;
		}, new Map<string, string[]>());
	},
};
