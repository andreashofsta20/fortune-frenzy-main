import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { CoinflipService } from "server/services/CoinflipService";

export default {
	function: Functions.Coinflip.CreateCoinflip,
	handle: async (player: Player, items: { [itemId: string]: number }, coin?: string) => {
		const coinflipService = Modding.resolveSingleton(CoinflipService);
		return await coinflipService.createCoinflip(player, items, coin);
	},
};
