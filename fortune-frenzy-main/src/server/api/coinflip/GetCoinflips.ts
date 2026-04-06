import { Modding } from "@flamework/core";
import { CoinflipService } from "server/services/CoinflipService";
import { Functions } from "server/network";

export default {
	function: Functions.Coinflip.GetCoinflips,
	handle: async () => {
		const coinflipService = Modding.resolveSingleton(CoinflipService);
		return coinflipService.Coinflips;
	},
};
