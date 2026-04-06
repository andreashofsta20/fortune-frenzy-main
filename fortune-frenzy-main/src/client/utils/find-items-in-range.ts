import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { requestServer } from "./send-function";
import { Functions } from "client/network";

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
) {
	const normalizedMinValue = math.max(0, math.floor(minValue));
	const normalizedMaxValue = math.max(normalizedMinValue, math.floor(maxValue));
	const normalizedMinItems = math.max(1, math.floor(minItems));
	const normalizedMaxItems = math.max(normalizedMinItems, math.floor(maxItems));

	const candidates = new Array<CandidateItem>();
	clientStateController.Inventory.forEach((copies, itemId) => {
		const itemData = clientStateController.ItemInfo.get(itemId);
		if (!itemData) return;
		if (itemData.value <= 0 || itemData.value > normalizedMaxValue) return;

		const quantity = math.min(copies.size(), normalizedMaxItems);
		if (quantity <= 0) return;

		candidates.push({
			itemId,
			value: itemData.value,
			quantity,
		});
	});

	if (candidates.size() === 0) return [];

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

export default async function hybridSelectItems(
	minValue: number,
	maxValue: number,
	minItems: number,
	maxItems: number,
): Promise<string[]> {
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	const data = await requestServer(
		Functions.Items.FindItemsInRange,
		"Failed to find items",
		minValue,
		maxValue,
		minItems,
		maxItems,
	);

	if (data !== -1 && typeIs(data, "table")) {
		const matchedItems = data as string[];
		if (matchedItems.size() > 0) {
			return matchedItems;
		}
	}

	return findLocalItemsInRange(clientStateController, minValue, maxValue, minItems, maxItems);
}
