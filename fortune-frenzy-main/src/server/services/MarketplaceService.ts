import { Service, OnStart } from "@flamework/core";
import {
	AllItemListingResponse,
	ItemListing,
	ItemListingResponse,
	ItemCopy,
	ItemCopiesResponse,
	PurchaseResponse,
} from "typings/APIResponses";
import { ItemManagementService } from "./ItemManagementService";
import { PlayerManagementService } from "./PlayerManagementService";
import { Events } from "server/network";
import { Request } from "server/util/packeter";
import { addCommasToNumber, setDecimalPlaces } from "shared/util/number-utils";
import log from "shared/util/log";
import { isItemDirectShopPurchaseBlocked } from "shared/util/is-item-direct-shop-blocked";
import getPollingCooldown from "server/util/get-polling-cooldown";
import { getPlayersOnMenu } from "server/util/player-menu-tracker";

@Service()
export class MarketplaceService implements OnStart {
	private readonly FALLBACK_POLL_INTERVAL = 12;

	constructor(
		private ItemManagementService: ItemManagementService,
		private PlayerManagementService: PlayerManagementService,
	) {}

	public ItemListings = new Map<string, ItemListing[]>();

	onStart() {
		const start_time = tick();
		log("warn", "⌛ [MarketplaceService] Starting...");
		task.spawn(async () => {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const isMarketplaceVisible = getPlayersOnMenu("Marketplace").size() > 0;
				if (isMarketplaceVisible) {
					await this.updateListingsCache();
				}
				task.wait(isMarketplaceVisible ? getPollingCooldown() : this.FALLBACK_POLL_INTERVAL);
			}
		});
		log("print", `✅ [MarketplaceService] Started in ${setDecimalPlaces(tick() - start_time)}s`);
	}

	private clearStatusAndRespond(
		map: Map<Player, string>,
		player: Player,
		status: "error" | "success",
		code?: number | string,
		message?: string,
	) {
		if (status === "error") {
			log(
				"warn",
				`[MarketplaceService] Error for player ${player.UserId}${code !== undefined ? ` (code: ${code})` : ""}${message !== undefined ? ` - ${message}` : ""}`,
			);
		}
		map.delete(player);
		return { status, code, message };
	}

	async updateListingsCache(itemId?: string): Promise<boolean> {
		const url = itemId ? `/marketplace/items/${itemId}/listings` : "/marketplace/items/all/listings";
		const request = await new Request("GET", url).GetResponse();
		const response = request.Response as AllItemListingResponse;

		if (!request.Success) {
			log("warn", `Failed to fetch marketplace listings:`, response);
			return false;
		}

		if (itemId) {
			const oldListings = this.ItemListings.get(itemId) ?? [];
			const { added, updated, removed } = this.computeListingsDelta(oldListings, response.listings);
			if (added.size() + updated.size() + removed.size() > 0) {
				Events.ItemResellersUpdate.broadcast([{ itemId, added, updated, removed }]);
			}
			this.ItemListings.set(itemId, response.listings);
		} else {
			const newItemListings = new Map<string, ItemListing[]>();

			response.listings.forEach((listing) => {
				if (!newItemListings.has(listing.item_id)) {
					newItemListings.set(listing.item_id, []);
				}
				newItemListings.get(listing.item_id)!.push(listing);
			});

			const oldItemListings = this.ItemListings;
			const broadcastPayload: Array<{
				itemId: string;
				added: ItemListing[];
				updated: ItemListing[];
				removed: string[];
			}> = [];

			newItemListings.forEach((newListings, itemId) => {
				const oldListings = oldItemListings.get(itemId) ?? [];
				const delta = this.computeListingsDelta(oldListings, newListings);
				if (delta.added.size() + delta.updated.size() + delta.removed.size() > 0) {
					broadcastPayload.push({ itemId, ...delta });
				}
			});

			oldItemListings.forEach((oldListings, itemId) => {
				if (!newItemListings.has(itemId)) {
					broadcastPayload.push({
						itemId,
						added: [],
						updated: [],
						removed: oldListings.map((l) => l.user_asset_id),
					});
				}
			});

			this.ItemListings = newItemListings;

			if (broadcastPayload.size() > 0) {
				Events.ItemResellersUpdate.broadcast(broadcastPayload);
			}
		}

		return true;
	}

	private listItemPlayerStatuses = new Map<Player, string>();

	private findCachedListingByUAID(uaid: string): ItemListing | undefined {
		for (const [, listings] of this.ItemListings) {
			const listing = listings.find((entry) => entry.user_asset_id === uaid);
			if (listing) return listing;
		}

		return undefined;
	}

	async listItemForSale(player: Player, uaid: string, price: number | undefined) {
		const action = price === undefined ? "unlist" : "list";
		log(
			"print",
			`[MarketplaceService] Player ${player.UserId} is attempting to ${action} UAID ${uaid}${price !== undefined ? ` for ${price}` : ""}`,
		);
		const playerStatus = this.listItemPlayerStatuses.get(player);
		if (playerStatus === "processing")
			return this.clearStatusAndRespond(this.listItemPlayerStatuses, player, "error", 403);
		if (playerStatus === "cooldown")
			return this.clearStatusAndRespond(this.listItemPlayerStatuses, player, "error", 429);
		const sessionProfile = this.PlayerManagementService.getSessionOnlyProfile(player);
		if (!sessionProfile) return this.clearStatusAndRespond(this.listItemPlayerStatuses, player, "error", 403);

		await this.PlayerManagementService.refreshInventory(player);

		const isUnlistRequest = price === undefined;
		if (isUnlistRequest) {
			let listing = this.findCachedListingByUAID(uaid);
			if (!listing) {
				await this.updateListingsCache();
				listing = this.findCachedListingByUAID(uaid);
			}

			if (!listing) {
				return this.clearStatusAndRespond(this.listItemPlayerStatuses, player, "error", 404);
			}

			if (listing.seller_id !== tostring(player.UserId)) {
				return this.clearStatusAndRespond(this.listItemPlayerStatuses, player, "error", 403);
			}
		} else {
			const inventory = sessionProfile.OwnedUAIDs;
			if (!inventory.includes(uaid)) {
				return this.clearStatusAndRespond(this.listItemPlayerStatuses, player, "error", 405);
			}
		}

		const MAXIMUM_PRICE = 999999999999.99;
		const MINIMUM_PRICE = 0.0;

		if (price !== undefined) {
			if (price < MINIMUM_PRICE || price > MAXIMUM_PRICE) {
				log(
					"warn",
					`[MarketplaceService] Price out of range while listing. Player: ${player.UserId}, UAID: ${uaid}, Price: ${price}`,
				);
				return { status: "error", code: 406 };
			}
		}

		const listingPrice = price !== undefined ? math.floor(price) : 0;
		const listRequestBody =
			price !== undefined ? { price: listingPrice } : ({} as { price?: number });

		let request = await new Request("POST", `/marketplace/copies/${uaid}/list`, undefined, listRequestBody).GetResponse();
		let response = request.Response as ItemListingResponse;

		if (!request.Success && request.Code === 404 && price !== undefined) {
			await this.PlayerManagementService.refreshInventory(player);
			request = await new Request("POST", `/marketplace/copies/${uaid}/list`, undefined, listRequestBody).GetResponse();
			response = request.Response as ItemListingResponse;
		}

		if (!request.Success) {
			log(
				"warn",
				`[MarketplaceService] Listing request failed for UAID ${uaid}. Player: ${player.UserId}. Code: ${request.Code}, Error: ${response.error}`,
			);

			if (request.Code === 404 || request.Code === 400) {
				task.spawn(async () => {
					await this.PlayerManagementService.refreshInventory(player);
					const itemId = this.ItemManagementService.getItemIdFromUAID(uaid);
					if (itemId) await this.updateListingsCache(itemId);
					else await this.updateListingsCache();
				});
			}

			return { status: "error", code: request.Code, message: response.error };
		}

		log("info", `[MarketplaceService] Player ${player.UserId} successfully ${action}ed UAID ${uaid}`);

		const itemId = this.ItemManagementService.getItemIdFromUAID(uaid);
		const itemInfo = itemId ? this.ItemManagementService.ItemInfo.get(itemId) : undefined;
		const itemName = itemInfo?.name ?? itemId ?? "item";
		const itemImage = itemInfo ? `rbxthumb://type=Asset&id=${itemInfo.asset_id}&w=150&h=150` : undefined;

		if (price !== undefined) {
			this.PlayerManagementService.recordRecentActivity(
				player,
				`Listed ${itemName} for $${addCommasToNumber(listingPrice)}`,
				itemImage,
			);
		} else {
			this.PlayerManagementService.recordRecentActivity(
				player,
				`Removed ${itemName} from the marketplace`,
				itemImage,
			);
		}

		task.spawn(() => {
			const itemId = this.ItemManagementService.getItemIdFromUAID(uaid);
			if (!itemId) return;
			this.updateListingsCache(itemId);
		});

		await this.PlayerManagementService.refreshInventory(player);

		return { status: "success" };
	}

	async getListingsForItem(itemId: string): Promise<ItemListing[]> {
		await this.updateListingsCache(itemId);
		return this.ItemListings.get(itemId) ?? [];
	}

	async getAllListings(): Promise<Map<string, ItemListing[]>> {
		await this.updateListingsCache();
		return this.ItemListings;
	}

	/** UAIDs the seller currently has listed (any item) — exclude from stakes / trade selection. */
	getListedUserAssetIdsForSeller(sellerId: string): Set<string> {
		const s = new Set<string>();
		for (const [, listings] of this.ItemListings) {
			for (const l of listings) {
				if (tostring(l.seller_id) === tostring(sellerId)) s.add(l.user_asset_id);
			}
		}
		return s;
	}

	private purchaseListingPlayerStatuses = new Map<Player, string>();
	private readonly DIRECT_PURCHASE_MULTIPLIER = 2;

	private computeListingsDelta(
		oldListings: ItemListing[],
		newListings: ItemListing[],
	): { added: ItemListing[]; updated: ItemListing[]; removed: string[] } {
		const oldMap = new Map<string, ItemListing>();
		oldListings.forEach((l) => oldMap.set(l.user_asset_id, l));

		const newMap = new Map<string, ItemListing>();
		newListings.forEach((l) => newMap.set(l.user_asset_id, l));

		const added: ItemListing[] = [];
		const updated: ItemListing[] = [];
		const removed: string[] = [];

		newListings.forEach((listing) => {
			const existing = oldMap.get(listing.user_asset_id);
			if (!existing) {
				added.push(listing);
			} else if (existing.price !== listing.price || existing.seller_id !== listing.seller_id) {
				updated.push(listing);
			}
		});

		oldListings.forEach((listing) => {
			if (!newMap.has(listing.user_asset_id)) {
				removed.push(listing.user_asset_id);
			}
		});

		return { added, updated, removed };
	}

	private getDirectPurchasePrice(itemId: string): number | undefined {
		const item = this.ItemManagementService.ItemInfo.get(itemId);
		if (!item) return undefined;

		const basePrice = item.value;
		if (basePrice <= 0) return undefined;

		return math.max(1, math.ceil(basePrice * this.DIRECT_PURCHASE_MULTIPLIER));
	}

	async purchaseDirectItem(
		player: Player,
		itemId: string,
	): Promise<{ status: string; message?: string; code?: number | string }> {
		log("print", `[MarketplaceService] Player ${player.UserId} is attempting to directly purchase item ${itemId}`);
		const playerStatus = this.purchaseListingPlayerStatuses.get(player);
		if (playerStatus === "processing")
			return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 403);
		if (playerStatus === "cooldown")
			return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 429);
		this.purchaseListingPlayerStatuses.set(player, "processing");

		const onlineProfile = await this.PlayerManagementService.getOnlineProfile(player);
		if (!onlineProfile) return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 403);

		const itemInfo = this.ItemManagementService.ItemInfo.get(itemId);
		if (!itemInfo) return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 404);

		if (isItemDirectShopPurchaseBlocked(itemInfo)) {
			return this.clearStatusAndRespond(
				this.purchaseListingPlayerStatuses,
				player,
				"error",
				403,
				"This item is not sold in the shop. Get it from cases or trading.",
			);
		}

		const directPurchasePrice = this.getDirectPurchasePrice(itemId);
		if (directPurchasePrice === undefined)
			return this.clearStatusAndRespond(
				this.purchaseListingPlayerStatuses,
				player,
				"error",
				500,
				"Item price unavailable",
			);

		const bypassSpendLimit = this.PlayerManagementService.hasUnlimitedSpendLimit(player);

		if (!bypassSpendLimit && directPurchasePrice > onlineProfile.Data.Cash)
			return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 406);

		let transactionId: string | undefined;
		if (!bypassSpendLimit) {
			transactionId = await this.PlayerManagementService.addCash(player, -directPurchasePrice, {
				transactionType: Enum.AnalyticsEconomyTransactionType.Shop.Name,
				stockKeepingUnit: this.ItemManagementService.getItemSKU(itemId),
			});
		}

		const addedToInventory = await this.PlayerManagementService.addItemToInventory(player, itemId);
		if (!addedToInventory) {
			if (transactionId !== undefined) {
				this.PlayerManagementService.rollbackAddCash(transactionId);
			}
			return this.clearStatusAndRespond(
				this.purchaseListingPlayerStatuses,
				player,
				"error",
				500,
				"Failed to grant item",
			);
		}

		if (transactionId !== undefined) {
			this.PlayerManagementService.confirmAddCash(transactionId);
		}

		const itemImage = `rbxthumb://type=Asset&id=${itemInfo.asset_id}&w=150&h=150`;
		this.PlayerManagementService.recordRecentActivity(
			player,
			`Bought ${itemInfo.name} for $${addCommasToNumber(directPurchasePrice)} (Direct +100%)`,
			itemImage,
		);

		this.purchaseListingPlayerStatuses.delete(player);
		log(
			"print",
			`[MarketplaceService] Player ${player.UserId} successfully directly purchased item ${itemId} for ${directPurchasePrice}`,
		);

		return { status: "success" };
	}

	async purchaseListing(
		player: Player,
		uaid: string,
	): Promise<{ status: string; message?: string; code?: number | string }> {
		log("print", `[MarketplaceService] Player ${player.UserId} is attempting to purchase UAID ${uaid}`);
		const playerStatus = this.purchaseListingPlayerStatuses.get(player);
		if (playerStatus === "processing")
			return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 403);
		if (playerStatus === "cooldown")
			return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 429);
		this.purchaseListingPlayerStatuses.set(player, "processing");

		let listing: ItemListing | undefined;
		for (const [_item_id, listings] of this.ItemListings) {
			listing = listings.find((listing) => listing.user_asset_id === uaid);
			if (listing) break;
		}

		if (!listing) return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 404);
		const { price } = listing;
		const onlineProfile = await this.PlayerManagementService.getOnlineProfile(player);
		if (!onlineProfile) return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 403);
		const bypassSpendLimit = this.PlayerManagementService.hasUnlimitedSpendLimit(player);
		if (!bypassSpendLimit && (tonumber(price) ?? math.huge) > onlineProfile.Data.Cash)
			return this.clearStatusAndRespond(this.purchaseListingPlayerStatuses, player, "error", 406);
		let transactionId: string | undefined;
		if (!bypassSpendLimit) {
			transactionId = await this.PlayerManagementService.addCash(player, -(tonumber(price) || 0), {
				transactionType: Enum.AnalyticsEconomyTransactionType.Shop.Name,
				stockKeepingUnit: this.ItemManagementService.getItemSKU(listing.item_id),
			});
		}
		const request = await new Request("POST", `/marketplace/copies/${listing.user_asset_id}/buy`, undefined, {
			buyer_id: tostring(player.UserId),
		}).GetResponse();
		const response = request.Response as PurchaseResponse;

		task.delay(0.1, () => {
			this.purchaseListingPlayerStatuses.delete(player);
		});

		if (!request.Success) {
			if (transactionId !== undefined) {
				this.PlayerManagementService.rollbackAddCash(transactionId);
			}
			log(
				"warn",
				`[MarketplaceService] Purchase request failed for UAID ${uaid}. Code: ${request.Code}, Error: ${response.error}`,
			);
			return this.clearStatusAndRespond(
				this.purchaseListingPlayerStatuses,
				player,
				"error",
				`500-${request.Code}`,
				response.error,
			);
		}

		if (transactionId !== undefined) {
			this.PlayerManagementService.confirmAddCash(transactionId);
		}

		const itemInfo = this.ItemManagementService.ItemInfo.get(listing.item_id);
		const itemName = itemInfo?.name ?? listing.item_id;
		const itemImage = itemInfo ? `rbxthumb://type=Asset&id=${itemInfo.asset_id}&w=150&h=150` : undefined;
		const priceNumber = tonumber(price) ?? 0;
		this.PlayerManagementService.recordRecentActivity(
			player,
			`Bought ${itemName} for $${addCommasToNumber(priceNumber)}`,
			itemImage,
		);

		const seller = game.GetService("Players").GetPlayerByUserId(tonumber(listing.seller_id) ?? 0);
		if (seller) {
			this.PlayerManagementService.recordRecentActivity(
				seller,
				`Sold ${itemName} for $${addCommasToNumber(priceNumber)}`,
				itemImage,
			);
		}

		log("print", `[MarketplaceService] Player ${player.UserId} successfully purchased UAID ${uaid} for ${price}`);

		task.spawn(() => {
			this.updateListingsCache(listing.item_id);
			this.PlayerManagementService.refreshInventory(player);

			const seller = game.GetService("Players").GetPlayerByUserId(tonumber(listing.seller_id) ?? 0);
			if (seller) this.PlayerManagementService.refreshInventory(seller);
		});

		return { status: "success" };
	}
}
