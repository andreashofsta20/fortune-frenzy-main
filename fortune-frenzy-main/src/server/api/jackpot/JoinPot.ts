import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { JackpotService } from "server/services/JackpotService";
import filterServerSeed from "server/util/jackpot/filterServerSeed";

export default {
	function: Functions.Jackpot.JoinPot,
	handle: async (player: Player, jackpotId: string, items: { [itemId: string]: number }) => {
		const jackpotService = Modding.resolveSingleton(JackpotService);
		return jackpotService.joinJackpot(player, jackpotId, items);
	},
};
