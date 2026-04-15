import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { ItemManagementService } from "server/services/ItemManagementService";
import { Item } from "typings/APIResponses";

async function waitLoaded(itemManagementService: ItemManagementService) {
	if (!itemManagementService.Loaded) {
		const startTime = tick();
		while (!itemManagementService.Loaded && tick() - startTime < 15) {
			task.wait();
		}
	}
}

export default {
	function: Functions.Marketplace.RefreshMarketplaceItemFromApi,
	handle: async (_player: Player, itemId: string) => {
		const itemManagementService = Modding.resolveSingleton(ItemManagementService);
		await waitLoaded(itemManagementService);
		const item = await itemManagementService.refreshCatalogItemRow(itemId);
		return item as Item | undefined;
	},
};
