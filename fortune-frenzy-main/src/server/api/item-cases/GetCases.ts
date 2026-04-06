import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { ItemCaseService } from "server/services/ItemCaseService";

export default {
	function: Functions.ItemCases.GetCases,
	handle: async (player: Player) => {
		const itemCaseService = Modding.resolveSingleton(ItemCaseService);
		return itemCaseService.Cases;
	},
};
