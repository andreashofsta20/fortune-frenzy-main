import { Modding } from "@flamework/core";
import { CommerceService } from "server/services/CommerceService";
import { Functions } from "server/network";

export default {
	function: Functions.Commerce.GetRobuxProducts,
	handle: async () => {
		const commerceService = Modding.resolveSingleton(CommerceService);

		const devProducts = new Map<string, string>();
		const gamepasses = new Map<string, string>();
		const subscriptions = new Map<string, string>();

		for (const [key, value] of pairs(commerceService.developerProducts)) {
			devProducts.set(tostring(key), tostring(value));
		}
		for (const [key, value] of pairs(commerceService.gamepasses)) {
			gamepasses.set(tostring(key), tostring(value));
		}
		for (const [key, value] of pairs(commerceService.subscriptions)) {
			subscriptions.set(tostring(key), tostring(value));
		}

		return {
			DeveloperProducts: devProducts,
			Gamepasses: gamepasses,
			Subscriptions: subscriptions,
		};
	},
};
