/* eslint-disable roblox-ts/no-array-pairs */
import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";
import { SubscriptionData } from "typings/APIResponses";

export default {
	function: Functions.Commerce.GetSubscriptionStatuses,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const Profile = await playerManagementService.getOnlineProfile(player);

		// Convert to Map using manual iteration
		const subscriptionData = Profile?.Data.SubscriptionData ?? {};
		const resultMap = new Map<string, SubscriptionData>();

		for (const [key, value] of pairs(subscriptionData)) {
			resultMap.set(tostring(key), value as SubscriptionData);
		}

		return resultMap;
	},
};
