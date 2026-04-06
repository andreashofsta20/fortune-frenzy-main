import { Modding } from "@flamework/core";
import { Profile } from "@rbxts/profile-store";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { DataTemplate } from "../data-template";

const diamondProducts: { [key: string]: number } = {
	"3569717806": 500000,
	"3569717620": 100000,
	"3569717373": 25000,
	"3569717165": 12500,
	"3569716949": 5000,
	"3569716763": 1000,
	"3569716567": 200,
};

const productIdArray: number[] = [];
for (const [key, _] of pairs(diamondProducts)) productIdArray.push(tonumber(key) as number);

export default {
	category: "Gems",
	productIds: productIdArray,
	callback: async (player: Player, productId: number, purchased: boolean, profile: Profile<DataTemplate>) => {
		if (!purchased) return;

		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const productIdString = tostring(productId);

		playerManagementService.confirmAddDiamonds(
			await playerManagementService.addDiamonds(player, diamondProducts[productIdString], {
				transactionType: Enum.AnalyticsEconomyTransactionType.IAP.Name,
				stockKeepingUnit: productIdString,
			}),
		);
	},
};
