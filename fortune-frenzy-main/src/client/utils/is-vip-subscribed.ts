import { Players } from "@rbxts/services";
import { SubscriptionData } from "typings/APIResponses";

function isVipSubscriptionStateActive(state: SubscriptionData["State"]): boolean {
	return (
		state === "SubscribedWillRenew" ||
		state === "SubscribedRenewalPaymentPending" ||
		state === "SubscribedWillNotRenew"
	);
}

/**
 * Client mirror of server `CommerceService.isSubscribed(..., "VIP")`.
 * Uses cached subscription rows; also trusts `VIP` on the local player (replicated from server) so
 * dev grants and timing gaps where the map is not updated yet still match server enforcement.
 */
export function isVipActiveInSubscriptionMap(subscriptionMap: Map<string, SubscriptionData>): boolean {
	const vip = subscriptionMap.get("VIP");
	if (vip && isVipSubscriptionStateActive(vip.State)) return true;
	const lp = Players.LocalPlayer;
	return lp !== undefined && lp.GetAttribute("VIP") === true;
}
