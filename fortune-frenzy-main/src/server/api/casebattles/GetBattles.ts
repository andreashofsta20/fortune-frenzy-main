import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CaseBattleService } from "server/services/CaseBattleService";

export default {
	function: Functions.CaseBattles.GetBattles,
	handle: async (player: Player) => {
		const caseBattleService = Modding.resolveSingleton(CaseBattleService);
		return caseBattleService.CaseBattles;
	},
};
