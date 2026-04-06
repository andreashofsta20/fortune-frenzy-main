import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Loading.GetCurrencies,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const Profile = await playerManagementService.getOnlineProfile(player, true);
		const SessionProfile = playerManagementService.getSessionOnlyProfile(player);

		return {
			Cash: Profile?.Data.Cash ?? 0,
			Gems: Profile?.Data.Gems ?? 0,
			ItemValue: SessionProfile?.TotalItemValue ?? 0,
		};
	},
};
