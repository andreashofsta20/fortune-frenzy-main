import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { TradingService } from "server/services/TradingService";

export default {
	function: Functions.Trading.CancelTrade,
	handle: async (player: Player, tradeId: string) => {
		const tradingService = Modding.resolveSingleton(TradingService);
		return await tradingService.cancelTrade(player, tradeId);
	},
};
