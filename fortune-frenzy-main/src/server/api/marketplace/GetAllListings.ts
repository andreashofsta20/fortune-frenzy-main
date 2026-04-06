import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { MarketplaceService } from "server/services/MarketplaceService";

export default {
	function: Functions.Marketplace.GetAllListings,
	handle: async (_player: Player) => {
		const marketplaceService = Modding.resolveSingleton(MarketplaceService);
		return marketplaceService.getAllListings();
	},
};
