import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { PlayerManagementService } from "server/services/PlayerManagementService";

export default {
	function: Functions.Commerce.SpinRewardWheel,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		return await playerManagementService.spinRewardWheel(player);
	},
};
