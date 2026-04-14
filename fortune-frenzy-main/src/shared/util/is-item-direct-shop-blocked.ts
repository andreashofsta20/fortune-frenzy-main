import { Item } from "typings/APIResponses";

/**
 * True when quick-buy (100% fee shop) must be hidden and blocked.
 * API sends 0/1 so the value survives some serializers that drop JSON `false` on Remotes.
 */
export function isItemDirectShopPurchaseBlocked(item: Pick<Item, "allow_direct_shop_purchase">): boolean {
	const v = item.allow_direct_shop_purchase;
	return v === false || v === 0;
}
