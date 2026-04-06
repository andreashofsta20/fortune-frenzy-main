import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { ItemManagementService } from "server/services/ItemManagementService";

export default {
	function: Functions.Items.FindItemsInRange,
	handle: async (player: Player, minValue: number, maxValue: number, minItems: number, maxItems: number) => {
		const itemManagementService = Modding.resolveSingleton(ItemManagementService);
		return itemManagementService.findItemsInRange(player, minValue, maxValue, minItems, maxItems);
	},
};
