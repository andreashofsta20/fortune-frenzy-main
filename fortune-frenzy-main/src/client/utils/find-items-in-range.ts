import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { HttpService, Players } from "@rbxts/services";
import { requestServer } from "./send-function";
import { Functions } from "client/network";
import {
	collectUnavailableUserAssetIds,
	inventorySlotToUserAssetId,
} from "client/utils/collect-unavailable-stake-uaids";

/** Same copy filtering as `InventoryMenu` `gridInventory` when stake-safe (listings, pending trades, active stakes). */
function filterStakeSafeInventoryCopyMap(clientStateController: ClientStateController): Map<string, string[]> {
	const unavailable = collectUnavailableUserAssetIds(
		clientStateController,
		tostring(Players.LocalPlayer.UserId),
	);
	const out = new Map<string, string[]>();
	clientStateController.Inventory.forEach((slots, itemId) => {
		out.set(
			itemId,
			slots.filter((slot) => !unavailable.has(inventorySlotToUserAssetId(slot))),
		);
	});
	return out;
}

// #region agent log
const _AGENT_INGEST = "http://127.0.0.1:7528/ingest/1b6715ac-5dbe-4e21-b0fb-3326720d79ad";
function _agentDbgFindInRange(location: string, message: string, hypothesisId: string, data: Record<string, unknown>) {
	const [ok] = pcall(() =>
		HttpService.RequestAsync({
			Url: _AGENT_INGEST,
			Method: "POST",
			Headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "a18dcf" },
			Body: HttpService.JSONEncode({
				sessionId: "a18dcf",
				location,
				message,
				data,
				timestamp: math.floor(tick() * 1000),
				hypothesisId,
				runId: "pre-fix",
			}),
		}),
	);
	void ok;
}
// #endregion

interface CandidateItem {
	itemId: string;
	value: number;
	quantity: number;
}

function findLocalItemsInRange(
	clientStateController: ClientStateController,
	minValue: number,
	maxValue: number,
	minItems: number,
	maxItems: number,
	stakeSafeCopiesOnly: boolean,
) {
	const normalizedMinValue = math.max(0, math.floor(minValue));
	const normalizedMaxValue = math.max(normalizedMinValue, math.floor(maxValue));
	const normalizedMinItems = math.max(1, math.floor(minItems));
	const normalizedMaxItems = math.max(normalizedMinItems, math.floor(maxItems));

	const inventoryForSearch = stakeSafeCopiesOnly
		? filterStakeSafeInventoryCopyMap(clientStateController)
		: clientStateController.Inventory;

	const candidates = new Array<CandidateItem>();
	inventoryForSearch.forEach((copies, itemId) => {
		const itemData = clientStateController.ItemInfo.get(itemId);
		if (!itemData || itemData.value <= 0) return;
		// Join rules use *total* value in [min,max] (see CoinflipService.joinCoinflip). Do not require each
		// item's value to fall in that band — smaller items can combine to a valid total.
		if (itemData.value > normalizedMaxValue) return;

		const quantity = math.min(copies.size(), normalizedMaxItems);
		if (quantity <= 0) return;

		candidates.push({
			itemId,
			value: itemData.value,
			quantity,
		});
	});

	if (candidates.size() === 0) {
		// #region agent log
		_agentDbgFindInRange("find-items-in-range.ts:findLocalItemsInRange", "no_candidates_after_per_item_filter", "H3", {
			minValue: normalizedMinValue,
			maxValue: normalizedMaxValue,
		});
		// #endregion
		return [];
	}

	candidates.sort((a, b) => a.value > b.value);

	const suffixCopyCapacity = new Array<number>();
	for (let i = 0; i <= candidates.size(); i++) {
		suffixCopyCapacity[i] = 0;
	}

	for (let i = candidates.size() - 1; i >= 0; i--) {
		suffixCopyCapacity[i] =
			(suffixCopyCapacity[i + 1] ?? 0) + math.min(candidates[i].quantity, normalizedMaxItems);
	}

	const tryFindWithExactCount = (targetCount: number) => {
		const pickedItems = new Array<string>();

		const search = (startIndex: number, remaining: number, totalValue: number): boolean => {
			if (remaining === 0) {
				return totalValue >= normalizedMinValue && totalValue <= normalizedMaxValue;
			}

			if (startIndex >= candidates.size()) return false;
			if ((suffixCopyCapacity[startIndex] ?? 0) < remaining) return false;

			for (let i = startIndex; i < candidates.size(); i++) {
				const candidate = candidates[i];

				// With descending values, this prune lets us stop once even the best possible sum cannot reach the floor.
				if (totalValue + remaining * candidate.value < normalizedMinValue) {
					break;
				}

				const maxTake = math.min(candidate.quantity, remaining);
				for (let take = maxTake; take >= 1; take--) {
					const nextTotalValue = totalValue + candidate.value * take;
					if (nextTotalValue > normalizedMaxValue) continue;

					for (let count = 0; count < take; count++) {
						pickedItems.push(candidate.itemId);
					}

					if (search(i + 1, remaining - take, nextTotalValue)) {
						return true;
					}

					for (let count = 0; count < take; count++) {
						pickedItems.pop();
					}
				}
			}

			return false;
		};

		return search(0, targetCount, 0) ? pickedItems : undefined;
	};

	const maxSelectableItems = math.min(normalizedMaxItems, suffixCopyCapacity[0] ?? 0);
	for (let desiredCount = normalizedMinItems; desiredCount <= maxSelectableItems; desiredCount++) {
		const found = tryFindWithExactCount(desiredCount);
		if (found && found.size() > 0) {
			return found;
		}
	}

	return [];
}

export interface HybridSelectItemsOptions {
	/**
	 * When true (default), only counts copies usable for new stakes — not listed, not in pending trades,
	 * not already in active coinflip/jackpot stakes — matching `InventoryMenu` selection grid and `buildSelectionFromItemIds`.
	 */
	stakeSafeCopiesOnly?: boolean;
}

export default async function hybridSelectItems(
	minValue: number,
	maxValue: number,
	minItems: number,
	maxItems: number,
	options?: HybridSelectItemsOptions,
): Promise<string[]> {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const stakeSafeCopiesOnly = options?.stakeSafeCopiesOnly !== false;

	const data = await requestServer(
		Functions.Items.FindItemsInRange,
		"Failed to find items",
		minValue,
		maxValue,
		minItems,
		maxItems,
	);

	const serverIsTable = data !== -1 && typeIs(data, "table");
	const serverSize = serverIsTable ? (data as string[]).size() : 0;

	if (serverIsTable) {
		const matchedItems = data as string[];
		if (matchedItems.size() > 0) {
			// #region agent log
			_agentDbgFindInRange("find-items-in-range.ts:hybridSelectItems", "using_server_picks", "H3", {
				minValue,
				maxValue,
				serverSize: matchedItems.size(),
			});
			// #endregion
			return matchedItems;
		}
	}

	const localItems = findLocalItemsInRange(
		clientStateController,
		minValue,
		maxValue,
		minItems,
		maxItems,
		stakeSafeCopiesOnly,
	);
	// #region agent log
	_agentDbgFindInRange("find-items-in-range.ts:hybridSelectItems", "server_empty_using_local", "H3", {
		minValue,
		maxValue,
		serverRequestFailedOrNotTable: !serverIsTable,
		serverEmptyTable: serverIsTable && serverSize === 0,
		localSize: localItems.size(),
	});
	// #endregion
	return localItems;
}
