import { ClientStateController } from "client/controllers/ClientStateController";

/** Stake lines are `user_asset_id:item_id` or a bare user_asset_id. */
export function stakeTokenToUserAssetId(token: string): string {
	const parts = token.split(":");
	if (parts.size() >= 2 && parts[0].size() > 0) {
		return parts[0];
	}
	return token;
}

/** Client `Inventory` map values are `user_asset_id|copy_id` (see refreshInventory); normalize for comparisons. */
export function inventorySlotToUserAssetId(slot: string): string {
	const beforePipe = slot.split("|")[0];
	return stakeTokenToUserAssetId(beforePipe);
}

/**
 * UAIDs the given user must not pick for new coinflip / jackpot stakes (and similar UIs):
 * marketplace listings they created, copies committed to active coinflips, jackpots, or pending trades.
 */
export function collectUnavailableUserAssetIds(
	clientStateController: ClientStateController,
	ownerUserId: string,
): Set<string> {
	const unavailable = new Set<string>();

	clientStateController.ItemListings.forEach((listings) => {
		for (const l of listings) {
			if (tostring(l.seller_id) === ownerUserId) {
				unavailable.add(l.user_asset_id);
			}
		}
	});

	for (const cf of clientStateController.Coinflips) {
		if (cf.status === "completed" || cf.status === "failed") continue;
		if (tostring(cf.player1.id) === ownerUserId) {
			for (const t of cf.player1_items) {
				unavailable.add(stakeTokenToUserAssetId(t));
			}
		}
		if (cf.player2 && tostring(cf.player2.id) === ownerUserId && cf.player2_items) {
			for (const t of cf.player2_items) {
				unavailable.add(stakeTokenToUserAssetId(t));
			}
		}
	}

	for (const jp of clientStateController.Jackpots) {
		if (jp.status === "complete") continue;
		for (const m of jp.members ?? []) {
			if (tostring(m.player.id) === ownerUserId) {
				for (const t of m.items) {
					unavailable.add(stakeTokenToUserAssetId(t));
				}
			}
		}
	}

	for (const [, tr] of pairs(clientStateController.Trades)) {
		if (!tr || tr.status !== "pending") continue;
		if (tr.initiator.user_id === ownerUserId) {
			for (const t of tr.initiator.items) {
				unavailable.add(stakeTokenToUserAssetId(t));
			}
		}
		if (tr.receiver.user_id === ownerUserId) {
			for (const t of tr.receiver.items) {
				unavailable.add(stakeTokenToUserAssetId(t));
			}
		}
	}

	return unavailable;
}
