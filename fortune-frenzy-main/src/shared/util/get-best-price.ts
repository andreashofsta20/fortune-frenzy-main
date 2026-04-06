import { ItemListing } from "typings/APIResponses";

export function getBestPrice(listings?: ItemListing[]): number {
	let best = -1;
	for (const listing of listings ?? []) {
		const price = tonumber(listing.price);
		if (price !== undefined && (best === -1 || price < best)) best = price;
	}
	return best;
}
