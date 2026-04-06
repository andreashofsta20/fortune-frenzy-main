import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { TradingService } from "server/services/TradingService";

export default {
	function: Functions.Trading.CreateTrade,
	handle: async (
		player: Player,
		receiver_id: number,
		initiatorItems: { [itemId: string]: number },
		receiverItems: { [itemId: string]: number },
	) => {
		const tradingService = Modding.resolveSingleton(TradingService);
		return await tradingService.createTrade(player, receiver_id, initiatorItems, receiverItems);
	},
};
