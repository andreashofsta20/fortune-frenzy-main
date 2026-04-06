import { useMemo } from "@rbxts/react";

/*
 * Groups duplicate items returned from the Case Battles API so that the
 * consumer can render a single card per unique item instead of repeating
 * the same item multiple times. The returned array keeps the first seen
 * reference of the item (so any data such as `case_index` is preserved)
 * and appends a `quantity` property describing how many times it occurs.
 */

// Generic stacked item type so the hook can be reused elsewhere.
export interface StackedItem<T = unknown> {
	item: T;
	quantity: number;
}

/*
 * Groups array elements by a key derived from each item.
 *
 * @param items     Array of data to process.
 * @param keyFn     Optional function that returns the grouping key. If omitted the
 *                  hook falls back to the item reference (i.e., no grouping).
 */
export const useStackedItems = <T>(items: ReadonlyArray<T> | undefined, keyFn?: (item: T) => string | number) => {
	return useMemo<StackedItem<T>[]>(() => {
		if (!items) return [];

		if (!keyFn) {
			const noGroup: StackedItem<T>[] = [];
			for (const itm of items) noGroup.push({ item: itm, quantity: 1 });
			return noGroup;
		}

		const map = new Map<string | number, StackedItem<T>>();

		for (const current of items) {
			const key = keyFn(current);
			const existing = map.get(key);
			if (existing) {
				existing.quantity += 1;
			} else {
				map.set(key, { item: current, quantity: 1 });
			}
		}

		const result: StackedItem<T>[] = [];
		map.forEach((value) => result.push(value));
		return result;
	}, [items, keyFn]);
};
