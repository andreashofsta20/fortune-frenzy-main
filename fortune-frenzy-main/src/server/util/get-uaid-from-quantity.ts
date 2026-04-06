/* eslint-disable roblox-ts/no-array-pairs */
import { ItemManagementService } from "server/services/ItemManagementService";
import { PlayerManagementService } from "server/services/PlayerManagementService";

export function GetUAIDsForOnlineInventory(
	ItemManagementService: ItemManagementService,
	PlayerManagementService: PlayerManagementService,
	player: Player,
	items: Record<string, number>,
): string[] {
	const profile = PlayerManagementService.getSessionOnlyProfile(player);
	if (!profile) return [];

	return selectUAIDs(
		profile.OwnedUAIDs,
		items,
		(uaid) => {
			const info = ItemManagementService.UAIDInfo.get(uaid);
			return info ? info[0] : "";
		},
		(uaid) => uaid,
	);
}

export function GetUAIDsForOfflineInventory(
	inventory: [string, string, string, string][],
	items: Record<string, number>,
): string[] {
	return selectUAIDs(
		inventory,
		items,
		(entry) => entry[0],
		(entry) => entry[1],
	);
}

function selectUAIDs<S>(
	sources: S[],
	itemsNeeded: Record<string, number>,
	getItemId: (source: S) => string,
	getUAID: (source: S) => string,
): string[] {
	let totalNeeded = 0;
	for (const [, qty] of pairs(itemsNeeded)) {
		totalNeeded += qty as number;
	}
	if (totalNeeded === 0) return [];

	const selectedCount: Record<string, number> = {};
	const results: string[] = [];

	for (const entry of sources) {
		const itemId = getItemId(entry);
		if (!(itemId in itemsNeeded)) continue;

		selectedCount[itemId] ??= 0;
		if (selectedCount[itemId] < itemsNeeded[itemId]) {
			selectedCount[itemId] += 1;
			results.push(getUAID(entry));

			if (results.size() >= totalNeeded) break;
		}
	}

	return results.size() < totalNeeded ? [] : results;
}
