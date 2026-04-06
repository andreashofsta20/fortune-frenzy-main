import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { TradingService } from "server/services/TradingService";

export default {
	function: Functions.Trading.AcceptTrade,
	handle: async (player: Player, tradeId: string) => {
		const tradingService = Modding.resolveSingleton(TradingService);
		return await tradingService.acceptTrade(player, tradeId);
	},
};
