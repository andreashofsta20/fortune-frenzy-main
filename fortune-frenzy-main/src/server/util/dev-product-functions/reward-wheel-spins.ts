import { Profile } from "@rbxts/profile-store";
import { DataTemplate } from "../data-template";
import { HttpService } from "@rbxts/services";
import { Events } from "server/network";
import GetRewardWheelSpins from "server/api/commerce/GetRewardWheelSpins";

const rewardWheelSpins: { [key: string]: number } = {
	"3324383953": 3,
	"3324384110": 10,
};

const productIdArray: number[] = [];
for (const [key, _] of pairs(rewardWheelSpins)) productIdArray.push(tonumber(key) as number);

export default {
	category: "RewardWheelSpins",
	productIds: productIdArray,
	callback: async (player: Player, productId: number, purchased: boolean, profile: Profile<DataTemplate>) => {
		if (!purchased) return;

		const spins = rewardWheelSpins[tostring(productId)] ?? 3;
		for (let i = 0; i < spins; i++) {
			profile.Data.RewardWheelData.Spins.push({
				id: HttpService.GenerateGUID(),
				expires_at: os.time() + 60 * 60 * 12,
				used: false,
				purchased_at: os.time(),
			});
		}

		const newSpins = await GetRewardWheelSpins.handle(player);
		Events.RewardWheelSpinsUpdated.fire(player, { spins: newSpins.spins, nextFreeAt: newSpins.nextFreeAt });
	},
};
