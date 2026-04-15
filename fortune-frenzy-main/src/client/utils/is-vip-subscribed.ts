import { SubscriptionData } from "typings/APIResponses";

function isVipSubscriptionStateActive(state: SubscriptionData["State"]): boolean {
	return (
		state === "SubscribedWillRenew" ||
		state === "SubscribedRenewalPaymentPending" ||
		state === "SubscribedWillNotRenew"
	);
}

/** Client mirror of server `CommerceService.isSubscribed(..., "VIP")` using cached subscription rows. */
export function isVipActiveInSubscriptionMap(subscriptionMap: Map<string, SubscriptionData>): boolean {
	const vip = subscriptionMap.get("VIP");
	if (!vip) return false;
	return isVipSubscriptionStateActive(vip.State);
}
