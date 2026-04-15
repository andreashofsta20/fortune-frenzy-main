import { SubscriptionData } from "typings/APIResponses";

export function isSubscriptionDataActive(data: SubscriptionData | undefined): boolean {
	if (!data) return false;
	return (
		data.State === "SubscribedWillRenew" ||
		data.State === "SubscribedRenewalPaymentPending" ||
		data.State === "SubscribedWillNotRenew"
	);
}

/** Human-readable time until renewal (active) or expiry (cancelled but still active). */
export function formatSubscriptionTimeRemaining(data: SubscriptionData | undefined): string {
	if (!data || !isSubscriptionDataActive(data)) return "";

	const targetIso = data.State === "SubscribedWillNotRenew" ? data.ExpireTime : data.NextRenewTime ?? data.ExpireTime;
	if (!targetIso || targetIso.size() === 0) return "";

	const [ok, target] = pcall(() => DateTime.fromIsoDate(targetIso));
	if (!ok || !target) return "";

	const now = DateTime.now();
	const delta = target.UnixTimestamp - now.UnixTimestamp;
	const verb = data.State === "SubscribedWillNotRenew" ? "Ends" : "Renews";

	if (delta <= 0) return `${verb} soon`;

	const days = math.floor(delta / 86400);
	const hours = math.floor((delta % 86400) / 3600);
	const mins = math.floor((delta % 3600) / 60);

	if (days > 0) return `${verb} in ${days}d ${hours}h`;
	if (hours > 0) return `${verb} in ${hours}h ${mins}m`;
	return `${verb} in ${mins}m`;
}
