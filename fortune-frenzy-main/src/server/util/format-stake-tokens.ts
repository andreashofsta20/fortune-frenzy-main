import { ItemManagementService } from "server/services/ItemManagementService";

/** Normalizes API stake lines to `user_asset_id:item_id` for persistence and client display. */
export function formatStakeTokensWithItemIds(
	itemManagement: ItemManagementService,
	uaids: string[],
): string[] {
	const out: string[] = [];
	for (const raw of uaids) {
		const parts = raw.split(":");
		if (parts.size() >= 2 && parts[1] !== "") {
			out.push(`${parts[0]}:${parts[1]}`);
			continue;
		}
		const u = parts[0];
		const itemId = itemManagement.getItemIdFromUAID(u);
		if (itemId) out.push(`${u}:${itemId}`);
		else out.push(u);
	}
	return out;
}
