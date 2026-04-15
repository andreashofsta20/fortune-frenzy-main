import { Service, OnInit, OnStart } from "@flamework/core";
import { Events } from "server/network";
import { Request } from "server/util/packeter";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";
import { MarketplaceItemsDataResponse, MarketplaceItemDataResponse, Item } from "typings/APIResponses";
import { ServerScriptService } from "@rbxts/services";
import getPollingCooldown from "server/util/get-polling-cooldown";
import { getPlayersOnMenu } from "server/util/player-menu-tracker";

@Service()
export class ItemManagementService implements OnInit {
	public UAIDInfo = new Map<string, [string, string, string, string, number]>();
	public ItemInfo = new Map<string, Item>();
	private findItemsInRangeLocks = new Set<number>();
	public Loaded = false;
	private readonly FALLBACK_POLL_INTERVAL = 12;

	async onInit() {
		log("warn", "🚀 [ItemManagementService] Initializing...");
		const start_time = tick();

		const marketplaceRequest = await new Request("GET", "/marketplace/items", undefined, undefined, {
			id: ServerScriptService.GetAttribute("server_id") as string,
		}).GetResponse<MarketplaceItemsDataResponse>();

		if (marketplaceRequest.Success && marketplaceRequest.Response?.data) {
			for (const item of marketplaceRequest.Response.data) {
				this.ItemInfo.set(item.id, item);
			}
		} else {
			warn(
				`[ItemManagementService] Could not load marketplace catalog (Success=${marketplaceRequest.Success}, Code=${marketplaceRequest.Code})`,
			);
		}

		game.GetService("Players").PlayerRemoving.Connect((player: Player) => {
			this.tidyUp(player.UserId);
		});

		this.Loaded = true;
		task.spawn(async () => {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				const hasInterestedMenus =
					getPlayersOnMenu("Marketplace", "Inventory", "Coinflip", "CaseBattles", "Jackpot").size() > 0;
				if (hasInterestedMenus) {
					await this.pollForItemUpdates();
				}
				task.wait(hasInterestedMenus ? getPollingCooldown() : this.FALLBACK_POLL_INTERVAL);
			}
		});

		log("print", `✅ [ItemManagementService] Initialized in ${setDecimalPlaces(tick() - start_time)}ms`);
	}

	registerUAIDs(uaids: [string, string, string, string, number][]) {
		uaids.forEach((uaid) => {
			this.updateUAID(uaid);
		});
	}

	updateUAID(uaid: [string, string, string, string, number]) {
		this.UAIDInfo.set(uaid[1], [...uaid]);
	}

	tidyUp(userId: number) {
		for (const [key, value] of this.UAIDInfo) if (value[4] === userId) this.UAIDInfo.delete(key);
	}

	getItemIdFromUAID(uaid: string) {
		const uaidInfo = this.UAIDInfo.get(uaid);
		if (!uaidInfo) return;
		return uaidInfo[0];
	}

	getItemSKU(itemId: string): string {
		const item = this.ItemInfo.get(itemId);
		if (!item) return "";

		const SKUs = new Map<string, [number, number]>([
			["ItemValueTier_1", [0, 1000]],
			["ItemValueTier_2", [1001, 10000]],
			["ItemValueTier_3", [10001, 50000]],
			["ItemValueTier_4", [50001, 100000]],
			["ItemValueTier_5", [100001, 500000]],
			["ItemValueTier_6", [500001, 1000000]],
			["ItemValueTier_7", [1000001, 5000000]],
			["ItemValueTier_8", [5000001, 10000000]],
			["ItemValueTier_9", [10000001, 25000000]],
			["ItemValueTier_10", [25000001, 60000000]],
		]);

		for (const [sku, range] of SKUs) {
			const [min, max] = range;
			if (item.value >= min && item.value <= max) {
				return sku;
			}
		}

		return "";
	}

	/** Pull one catalog row from the API (live average_price + copies_in_circulation). Updates cache and broadcasts ItemUpdate. */
	async refreshCatalogItemRow(itemId: string): Promise<Item | undefined> {
		if (!this.Loaded || itemId.size() === 0) return undefined;

		const response = await new Request("GET", `/marketplace/items/${itemId}`, undefined, undefined).GetResponse<MarketplaceItemDataResponse>();

		if (!response.Success || !response.Response?.data) {
			return undefined;
		}

		const item = response.Response.data;
		this.ItemInfo.set(item.id, item);
		Events.ItemUpdate.broadcast([item]);
		return item;
	}

	getRandomItemBetweenValues(minValue: number, maxValue: number): string | undefined {
		const candidates = new Array<Item>();
		this.ItemInfo.forEach((item) => {
			if (item.value >= minValue && item.value <= maxValue) {
				candidates.push(item);
			}
		});

		if (candidates.size() === 0) return undefined;
		const randomIndex = math.random(1, candidates.size()) - 1;
		return candidates[randomIndex].id;
	}

	async findItemsInRange(
		player: Player,
		minValue: number,
		maxValue: number,
		minItems: number,
		maxItems: number,
	): Promise<string[]> {
		if (this.findItemsInRangeLocks.has(player.UserId)) return [];
		this.findItemsInRangeLocks.add(player.UserId);
		try {
			const maxFloored = math.floor(maxValue);
			const maxValueQuery =
				maxValue === math.huge || maxFloored > 9e15 ? "9223372036854775807" : tostring(maxFloored);

			const request = new Request("GET", "/items/find_items_in_range", undefined, undefined, {
				user_id: tostring(player.UserId),
				minValue: tostring(math.floor(minValue)),
				maxValue: maxValueQuery,
				minItems: tostring(math.floor(minItems)),
				maxItems: tostring(math.floor(maxItems)),
			});

			const response = await request.GetResponse<{ picks: Record<string, number>; success: boolean }>();
			if (!response.Success) {
				log(
					"warn",
					`❌ [ItemManagementService] Failed to retrieve items in range for player ${player.UserId}.`,
				);
				return [];
			}

			const picks = response.Response.picks;
			const items = new Array<string>();
			let insertIndex = 1;
			for (const [itemId, quantity] of pairs(picks)) {
				const segment = table.create(quantity as number, itemId as string);
				(table as unknown as { move: <T>(src: T[], f: number, e: number, t: number, dst: T[]) => void }).move(
					segment,
					1,
					quantity as number,
					insertIndex,
					items,
				);
				insertIndex += quantity as number;
			}

			return items;
		} finally {
			this.findItemsInRangeLocks.delete(player.UserId);
		}
	}

	private async pollForItemUpdates() {
		if (!this.Loaded) return;

		const pollRequest = new Request("GET", "/marketplace/items", undefined, undefined, {
			monitoring: "true",
			id: ServerScriptService.GetAttribute("server_id") as string,
		});

		const response = await pollRequest.GetResponse<{ status: string; data: Item[] }>();
		if (!response.Success || !response.Response?.data) {
			return;
		}

		const changedItems = response.Response.data;
		if (changedItems.size() > 0) {
			changedItems.forEach((item) => this.ItemInfo.set(item.id, item));
			Events.ItemUpdate.broadcast(changedItems);
		}
	}
}
