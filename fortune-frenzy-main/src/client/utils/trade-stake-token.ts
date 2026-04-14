import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";

/** Trade / coinflip stakes may be `uaid:item_id` or a bare `FF…` user_asset_id. */
export function resolveStakeItemId(stakeToken: string): string {
	const parts = stakeToken.split(":");
	if (parts.size() >= 2 && parts[1] !== "") {
		return parts[1];
	}
	const [ok, ctrl] = pcall(() => Modding.resolveSingleton(ClientStateController));
	if (ok) {
		const state = ctrl as ClientStateController;
		for (const [itemId, uaids] of state.Inventory) {
			if (uaids.includes(stakeToken)) {
				return itemId;
			}
		}
	}
	return stakeToken;
}
