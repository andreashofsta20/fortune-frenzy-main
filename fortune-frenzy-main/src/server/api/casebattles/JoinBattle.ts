import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CaseBattleService } from "server/services/CaseBattleService";

export default {
	function: Functions.CaseBattles.JoinBattle,
	handle: async (player: Player, battleId: string, position: number) => {
		const caseBattleService = Modding.resolveSingleton(CaseBattleService);
		return caseBattleService.joinCaseBattle(player, battleId, position);
	},
};
