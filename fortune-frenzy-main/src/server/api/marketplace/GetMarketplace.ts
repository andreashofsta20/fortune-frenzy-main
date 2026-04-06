import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { ItemManagementService } from "server/services/ItemManagementService";
import { Item } from "typings/APIResponses";

async function WaitForLoaded(itemManagementService: ItemManagementService) {
	if (!itemManagementService.Loaded) {
		const startTime = tick();
		while (!itemManagementService.Loaded && tick() - startTime < 15) {
			task.wait();
		}
	}
}

export default {
	function: Functions.Marketplace.GetEntireMarketplace,
	handle: async (_player: Player) => {
		const itemManagementService = Modding.resolveSingleton(ItemManagementService);
		await WaitForLoaded(itemManagementService);
		return itemManagementService.ItemInfo;
	},
};
