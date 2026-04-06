import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CoinflipService } from "server/services/CoinflipService";

export default {
	function: Functions.Coinflip.CancelCoinflip,
	handle: async (player: Player, coinflipId: string) => {
		const coinflipService = Modding.resolveSingleton(CoinflipService);
		return await coinflipService.cancelCoinflip(player, coinflipId);
	},
};
