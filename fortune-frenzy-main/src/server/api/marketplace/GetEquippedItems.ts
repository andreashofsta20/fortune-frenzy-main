import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { PlayerManagementService } from "server/services/PlayerManagementService";

export default {
	function: Functions.Marketplace.GetEquippedItems,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const onlineProfile = await playerManagementService.getOnlineProfile(player, true);
		if (!onlineProfile) return [];
		return onlineProfile.Data.EquippedItems;
	},
};
