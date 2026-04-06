import { Modding } from "@flamework/core";
import { MarketplaceService } from "server/services/MarketplaceService";
import { Functions } from "server/network";

export default {
	function: Functions.Marketplace.BuyListedItem,
	handle: async (player: Player, targetId: string) => {
		const marketplaceService = Modding.resolveSingleton(MarketplaceService);

		if (targetId.sub(1, 5) === "item:") {
			const itemId = targetId.sub(6);
			if (itemId.size() === 0) {
				return { status: "error", code: 400, message: "Invalid item ID" };
			}

			return await marketplaceService.purchaseDirectItem(player, itemId);
		}

		if (targetId.sub(1, 8) === "listing:") {
			const uaid = targetId.sub(9);
			if (uaid.size() === 0) {
				return { status: "error", code: 400, message: "Invalid listing ID" };
			}

			return await marketplaceService.purchaseListing(player, uaid);
		}

		// Backward compatibility for clients still sending a raw listing UAID.
		return await marketplaceService.purchaseListing(player, targetId);
	},
};
