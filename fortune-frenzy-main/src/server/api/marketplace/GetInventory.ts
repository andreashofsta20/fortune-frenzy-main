import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { ItemManagementService } from "server/services/ItemManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Marketplace.GetInventory,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const itemManagementService = Modding.resolveSingleton(ItemManagementService);

		if (!player.GetAttribute("__SERVER_LOADED")) {
			player.GetAttributeChangedSignal("__SERVER_LOADED").Wait();
		}

		const sessionProfile = playerManagementService.getSessionOnlyProfile(player);
		if (!sessionProfile) return new Map<string, string[]>();

		const inventory = sessionProfile.OwnedUAIDs;
		const allItems = itemManagementService.UAIDInfo;
		const ownedItems = new Map<string, string[]>();

		inventory.forEach((uaid) => {
			const item = allItems.get(uaid);
			if (!item) return;

			const itemId = item[0];
			if (!ownedItems.has(itemId)) {
				ownedItems.set(itemId, []);
			}
			ownedItems.get(itemId)!.push(`${item[1]}|${item[3]}`);
		});

		return ownedItems;
	},
};
