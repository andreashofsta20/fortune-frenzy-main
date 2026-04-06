import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { MarketplaceService } from "server/services/MarketplaceService";

export default {
	function: Functions.Marketplace.ListItemForSale,
	handle: async (player: Player, uaid: string, price?: number) => {
		const marketplaceService = Modding.resolveSingleton(MarketplaceService);
		const res = await marketplaceService.listItemForSale(player, uaid, price);
		if (res.status === "error") {
			warn(`RESULT FOR LISTING ITEM FOR SALE (${player.Name}):`, res.code, res.message, res.status);
		}
		return res;
	},
};
