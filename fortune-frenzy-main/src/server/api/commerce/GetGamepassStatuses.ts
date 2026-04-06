import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Commerce.GetGamepassStatuses,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const Profile = await playerManagementService.getOnlineProfile(player);

		// Convert to Map using manual iteration
		const gamepassData = Profile?.Data.GamepassData ?? {};
		const resultMap = new Map<string, boolean>();

		for (const [key, value] of pairs(gamepassData)) {
			resultMap.set(tostring(key), value as boolean);
		}

		return resultMap;
	},
};
