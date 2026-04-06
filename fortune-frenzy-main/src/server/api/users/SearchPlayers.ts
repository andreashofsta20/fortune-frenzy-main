import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { PlayerManagementService } from "server/services/PlayerManagementService";

export default {
	function: Functions.Users.SearchPlayers,
	handle: async (
		player: Player,
		query: string,
		sortOrder: "value_high" | "value_low" | "name_a-z" | "name_z-a" = "value_high",
	) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		return await playerManagementService.searchPlayers(player, query, sortOrder);
	},
};
