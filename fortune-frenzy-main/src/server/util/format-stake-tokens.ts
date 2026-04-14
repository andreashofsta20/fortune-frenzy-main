import { ItemManagementService } from "server/services/ItemManagementService";

/** Normalizes API stake lines to `user_asset_id:item_id` for persistence and client display. */
export function formatStakeTokensWithItemIds(
	itemManagement: ItemManagementService,
	uaids: string[],
): string[] {
	const out: string[] = [];
	for (const raw of uaids) {
		const parts = raw.split(":");
		const u = parts.size() >= 2 ? parts[0] : raw;
		const itemId = itemManagement.getItemIdFromUAID(u);
		if (itemId) out.push(`${u}:${itemId}`);
		else out.push(u);
	}
	return out;
}
