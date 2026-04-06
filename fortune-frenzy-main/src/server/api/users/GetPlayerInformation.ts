import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { PlayerManagementService } from "server/services/PlayerManagementService";

export default {
	function: Functions.Users.GetPlayerInformation,
	handle: async (player: Player, user_id: number) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		if (user_id <= 0 || !playerManagementService.hasPlayedBefore(user_id)) {
			return { status: "error", message: "Player has never joined this game" };
		}

		return await playerManagementService.getPlayerInformation(user_id);
	},
};
