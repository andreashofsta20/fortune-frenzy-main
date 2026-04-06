import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CaseBattleService } from "server/services/CaseBattleService";
import { CaseBattleData } from "typings/APIResponses";

export default {
	function: Functions.CaseBattles.CreateBattle,
	handle: async (
		player: Player,
		cases: string[],
		mode: CaseBattleData["mode"],
		crazy: boolean,
		fast_mode: boolean,
		team_mode: CaseBattleData["team_mode"],
	) => {
		warn("Creating battle", cases, mode, crazy, fast_mode, team_mode);
		const caseBattleService = Modding.resolveSingleton(CaseBattleService);
		return caseBattleService.createCaseBattle(player, cases, mode, crazy, fast_mode, team_mode);
	},
};
