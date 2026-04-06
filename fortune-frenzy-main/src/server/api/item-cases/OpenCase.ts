import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { ItemCaseService } from "server/services/ItemCaseService";

export default {
	function: Functions.ItemCases.OpenCase,
	handle: async (player: Player, caseId: string, flag?: "lucky" | "robux") => {
		const itemCaseService = Modding.resolveSingleton(ItemCaseService);
		return await itemCaseService.openCase(player, caseId, flag);
	},
};
