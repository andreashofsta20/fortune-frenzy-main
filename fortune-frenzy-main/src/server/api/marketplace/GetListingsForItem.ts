import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { MarketplaceService } from "server/services/MarketplaceService";

export default {
	function: Functions.Marketplace.GetListingsForItem,
	handle: async (_player: Player, itemId: string) => {
		const marketplaceService = Modding.resolveSingleton(MarketplaceService);
		return marketplaceService.getListingsForItem(itemId);
	},
};
