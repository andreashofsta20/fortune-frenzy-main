import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CaseBattleService } from "server/services/CaseBattleService";

export default {
	function: Functions.CaseBattles.GetCases,
	handle: async (player: Player) => {
		const caseBattleService = Modding.resolveSingleton(CaseBattleService);
		if (caseBattleService.CaseBattleCases.size() === 0) {
			await caseBattleService.refreshCases();
		}
		return caseBattleService.CaseBattleCases;
	},
};
