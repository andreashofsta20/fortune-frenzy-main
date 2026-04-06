import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CoinflipService } from "server/services/CoinflipService";

export default {
	function: Functions.Coinflip.JoinCoinflip,
	handle: async (player: Player, coinflipId: string, items: { [itemId: string]: number }) => {
		const coinflipService = Modding.resolveSingleton(CoinflipService);
		return await coinflipService.joinCoinflip(player, coinflipId, items);
	},
};
