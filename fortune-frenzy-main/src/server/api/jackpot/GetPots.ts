import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { JackpotService } from "server/services/JackpotService";
import filterServerSeed from "server/util/jackpot/filterServerSeed";

export default {
	function: Functions.Jackpot.GetPots,
	handle: async (player: Player) => {
		const jackpotService = Modding.resolveSingleton(JackpotService);

		return jackpotService.Jackpots.map(filterServerSeed);
	},
};
