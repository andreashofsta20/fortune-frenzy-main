import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Commerce.ClaimDailyReward,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		return await playerManagementService.claimDailyReward(player);
	},
};
