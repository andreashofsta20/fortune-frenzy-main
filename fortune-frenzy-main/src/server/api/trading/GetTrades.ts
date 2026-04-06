import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Trading.GetTrades,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const Profile = await playerManagementService.getOnlineProfile(player, true);

		return Profile?.Data.Trades ?? {};
	},
};
