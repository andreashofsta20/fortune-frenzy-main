import { DataStoreService, HttpService, Players, RunService, ServerScriptService } from "@rbxts/services";
import {
	Case,
	CaseBattleCase,
	CaseBattleData,
	Coinflip,
	Item,
	ItemListing,
	JackpotData,
	Trade,
} from "typings/APIResponses";
import { JACKPOT_INFINITY_VALUE_CAP, normalizeJackpotValueCap } from "shared/util/jackpot-value-cap";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type InventoryTuple = [string, string, string, string];

type MinigameStats = {
	current_ccu: number;
	total_spent: number;
	total_games_played: number;
	total_wins?: number;
	total_losses?: number;
};

type RouteResponse = {
	code: number;
	response: unknown;
};

type RolimonsItemRow = [
	name: string,
	acronym: string,
	rap: number,
	value: number,
	defaultValue: number,
	isDemand: number,
	trend: number,
	projected: number,
	hyped: number,
	rare: number,
];

type RolimonsItemDetailsResponse = {
	success: boolean;
	items: Record<string, RolimonsItemRow>;
};

type RolimonsItemMeta = {
	name: string;
	rap: number;
	value: number;
};

type RolimonsCatalogCacheState = {
	updated_at?: number;
	items?: Record<string, [name: string, rap: number, value: number]>;
};

type LocalUser = {
	user_id: string;
	created_at: string;
	updated_at: string;
	last_seen_at?: string;
	name: string;
	display_name: string;
	country: string;
	statistics: {
		total_cash_earned: number;
		total_cash_spent: number;
		win_rate: number;
		biggest_win: number;
		total_plays: number;
		favourite_mode: string;
		time_played: number;
		xp: number;
	};
	current_cash: number;
	current_value: number;
	recent_activity: {
		image: string;
		text: string;
	}[];
};

type ListingRecord = {
	listing: ItemListing;
	itemTuple: InventoryTuple;
};

type CoinflipRecord = {
	data: Coinflip;
	player1Items: InventoryTuple[];
	player2Items?: InventoryTuple[];
	lockedItems: InventoryTuple[];
	joinedAt?: number;
	completedAt?: number;
};

type TradeRecord = {
	data: Trade;
	initiatorItems: InventoryTuple[];
	receiverItems: InventoryTuple[];
};

type JackpotRecord = {
	data: JackpotData;
	lockedByUser: Map<string, InventoryTuple[]>;
	inProgressAt?: number;
	completedAt?: number;
};

type CaseBattleRecord = {
	data: CaseBattleData;
	completedAt?: number;
	resolvedPulls?: CaseBattleData["player_pulls"];
	resolvedWinners?: CaseBattleData["winners_info"];
};

type SettingsResponse = {
	status: string;
	result: {
		game_open: boolean;
		paycheck: number;
		polling_cooldown: number;
		dailywheel: {
			rewards: {
				id: string;
				type: "item" | "cash" | "gems" | "mystery";
				value: string;
				chance: number;
			}[];
		};
	};
};

type LocalCaseStats = {
	opened_counts?: Record<string, number>;
	updated_at?: number;
};

type GlobalCashChangesState = {
	changes?: Record<string, number>;
	updated_at?: number;
};

type PersistedListingRecord = {
	listing: ItemListing;
	item_tuple: InventoryTuple;
};

type GlobalMarketplaceState = {
	listings?: Record<string, PersistedListingRecord>;
	updated_at?: number;
};

type PersistedTradeRecord = {
	data: Trade;
	initiator_items: InventoryTuple[];
	receiver_items: InventoryTuple[];
};

type GlobalTradesState = {
	next_trade_id?: number;
	trades?: Record<string, PersistedTradeRecord>;
	updated_at?: number;
};

type GlobalInventoryChangesState = {
	changes?: Record<string, InventoryTuple[]>;
	updated_at?: number;
};

type PersistedCoinflipRecord = {
	data: Coinflip;
	player1_items: InventoryTuple[];
	player2_items?: InventoryTuple[];
	locked_items: InventoryTuple[];
	joined_at?: number;
	completed_at?: number;
};

type GlobalCoinflipsState = {
	next_coinflip_auto_id?: number;
	coinflips?: Record<string, PersistedCoinflipRecord>;
	updated_at?: number;
};

type PersistedCaseBattleRecord = {
	data: CaseBattleData;
	completed_at?: number;
	resolved_pulls?: CaseBattleData["player_pulls"];
	resolved_winners?: CaseBattleData["winners_info"];
};

type GlobalCaseBattlesState = {
	case_battles?: Record<string, PersistedCaseBattleRecord>;
	updated_at?: number;
};

type PersistedJackpotRecord = {
	data: JackpotData;
	locked_by_user: Record<string, InventoryTuple[]>;
	in_progress_at?: number;
	completed_at?: number;
};

type GlobalJackpotsState = {
	jackpots?: Record<string, PersistedJackpotRecord>;
	updated_at?: number;
};

type GlobalUsersState = {
	users?: Record<string, LocalUser>;
	updated_at?: number;
};

type DataStoreOperationTelemetry = {
	attempts: number;
	successes: number;
	failures: number;
	retries: number;
	contention: number;
	last_error?: string;
	last_failure_at?: number;
};

class LocalBackend {
	private readonly items = new Map<string, Item>();
	private readonly cases = new Map<string, Case>();
	private readonly caseBattleCases = new Array<CaseBattleCase>();
	private readonly caseBattleItemIds = new Map<string, number>();
	private readonly inventories = new Map<string, InventoryTuple[]>();
	private readonly users = new Map<string, LocalUser>();
	private readonly listings = new Map<string, ListingRecord>();
	private readonly coinflips = new Map<string, CoinflipRecord>();
	private readonly trades = new Map<number, TradeRecord>();
	private readonly jackpots = new Map<string, JackpotRecord>();
	private readonly caseBattles = new Map<string, CaseBattleRecord>();
	private readonly pendingCashChanges = new Map<string, number>();
	private readonly itemSerialByItemId = new Map<string, number>();
	private readonly monitoredMarketplaceSignatures = new Map<string, string>();
	private readonly minigameStats = new Map<string, MinigameStats>();
	private readonly persistenceStore = DataStoreService.GetDataStore("FF_LocalBackend_State_v6");
	private readonly caseStatsStore = DataStoreService.GetDataStore("FF_LocalBackend_CaseStats_v6");
	private readonly globalMarketplaceStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalMarketplace_v6");
	private readonly globalTradesStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalTrades_v6");
	private readonly globalCashChangesStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalCashChanges_v6");
	private readonly globalCoinflipsStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalCoinflips_v6");
	private readonly globalCaseBattlesStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalCaseBattles_v6");
	private readonly globalJackpotsStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalJackpots_v6");
	private readonly globalUsersStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalUsers_v6");
	private readonly globalItemSerialsStore = DataStoreService.GetDataStore("FF_LocalBackend_GlobalItemSerials_v6");
	private readonly globalInventoryChangesStore = DataStoreService.GetDataStore(
		"FF_LocalBackend_GlobalInventoryChanges_v6",
	);
	private readonly globalUsers = new Map<string, LocalUser>();
	private readonly loadedUsers = new Set<string>();
	private readonly dirtyUsers = new Set<string>();
	private readonly pendingGlobalUserSync = new Set<string>();
	private readonly pendingCaseOpenIncrements = new Map<string, number>();
	private readonly pendingInventoryGrants = new Map<string, InventoryTuple[]>();
	private readonly dataStoreTelemetry = new Map<string, DataStoreOperationTelemetry>();
	private readonly GLOBAL_SYNC_INTERVAL = RunService.IsStudio() ? 10 : 8;
	private readonly GLOBAL_USERS_SYNC_INTERVAL = RunService.IsStudio() ? 15 : 12;
	private readonly CASH_CHANGES_SYNC_INTERVAL = RunService.IsStudio() ? 10 : 5;
	private readonly MINIGAME_SYNC_INTERVAL = RunService.IsStudio() ? 2 : 4;
	private readonly MAX_ACTIVE_JACKPOT_JOINS_PER_PLAYER = 3;
	private readonly INVENTORY_CHANGES_SYNC_INTERVAL = RunService.IsStudio() ? 10 : 5;
	private readonly COPY_ID_AUDIT_INTERVAL = 60;
	private readonly MINIGAME_TICK_INTERVAL = 1;
	private readonly ACTIVE_USER_WINDOW_SECONDS = RunService.IsStudio() ? 30 : 20;
	private readonly FORCE_SYNC_COOLDOWN_SECONDS = RunService.IsStudio() ? 0.5 : 2.5;
	private readonly FORCE_SYNC_JITTER_SECONDS = RunService.IsStudio() ? 0.1 : 0.8;
	private readonly LOOP_JITTER_RATIO = RunService.IsStudio() ? 0.05 : 0.25;
	private readonly USER_ACTIVITY_SYNC_INTERVAL = RunService.IsStudio() ? 2 : 8;
	private readonly ROLIMONS_RETRY_INTERVAL = 60;
	private readonly ROLIMONS_CACHE_KEY = "rolimons_catalog_cache_v1";
	private readonly forceSyncNextAllowedAt = new Map<string, number>();
	private lastGlobalMarketplaceSync = 0;
	private lastGlobalTradesSync = 0;
	private lastGlobalCashChangesSync = 0;
	private lastGlobalCoinflipsSync = 0;
	private lastGlobalCaseBattlesSync = 0;
	private lastGlobalJackpotsSync = 0;
	private lastGlobalUsersSync = 0;
	private lastGlobalInventoryChangesSync = 0;
	private lastCoinflipUpdateAt = 0;
	private lastCaseBattleUpdateAt = 0;
	private lastJackpotUpdateAt = 0;
	private lastUserActivitySyncAt = 0;
	private cachedGlobalCashChangesState: GlobalCashChangesState = {
		changes: {},
		updated_at: 0,
	};
	private cachedGlobalInventoryChangesState: GlobalInventoryChangesState = {
		changes: {},
		updated_at: 0,
	};
	private rolimonsCatalogLoaded = false;

	private nextTradeId = 1;
	private nextCoinflipAutoId = 1;

	constructor() {
		this.seedItems();
		this.seedCases();
		this.loadCaseStats();
		this.seedCaseBattleCases();
		this.seedMinigameStats();
		this.syncGlobalMarketplace(true);
		this.syncGlobalTrades(true);
		this.syncGlobalCashChanges(true);
		this.syncGlobalCoinflips(true);
		this.syncGlobalCaseBattles(true);
		this.syncGlobalJackpots(true);
		this.syncGlobalUsers(true);
		this.syncGlobalInventoryChanges(true);

		Players.PlayerRemoving.Connect((player) => {
			const userId = tostring(player.UserId);
			this.saveUserState(userId);
			this.loadedUsers.delete(userId);
			this.dirtyUsers.delete(userId);
		});

		task.spawn(() => {
			for (;;) {
				this.flushDirtyUsers();
				this.flushCaseStats();
				task.wait(30);
			}
		});

		task.spawn(() => {
			for (;;) {
				this.runLoopSafely("global sync", () => {
					this.syncGlobalMarketplace();
					this.syncGlobalTrades();
					this.syncGlobalCashChanges();
					this.syncGlobalUsers();
					this.syncGlobalInventoryChanges();
				});
				task.wait(this.getJitteredIntervalSeconds(this.GLOBAL_SYNC_INTERVAL));
			}
		});

		task.spawn(() => {
			for (;;) {
				this.runLoopSafely("minigame tick", () => {
					this.updateCoinflips();
					this.updateJackpots();
					this.updateCaseBattles();
				});
				task.wait(this.getJitteredIntervalSeconds(this.MINIGAME_TICK_INTERVAL, 0.1));
			}
		});

		task.spawn(() => {
			for (;;) {
				this.auditGlobalInventoryCopyIds();
				task.wait(this.COPY_ID_AUDIT_INTERVAL);
			}
		});

		task.spawn(() => {
			for (;;) {
				this.runLoopSafely("rolimons hydrate", () => {
					if (!this.rolimonsCatalogLoaded) {
						this.tryHydrateRolimonsCatalog();
					}
				});
				task.wait(this.getJitteredIntervalSeconds(this.ROLIMONS_RETRY_INTERVAL, 0.1));
			}
		});

		game.BindToClose(() => {
			this.flushDirtyUsers();
			this.flushCaseStats();
			this.syncGlobalUsers(true);
		});
	}

	private flushDirtyUsers() {
		const userIds = new Array<string>();
		for (const userId of this.dirtyUsers) userIds.push(userId);

		userIds.forEach((userId) => {
			if (this.saveUserState(userId)) this.dirtyUsers.delete(userId);
		});
	}

	private getDataStoreTelemetry(operationName: string) {
		let telemetry = this.dataStoreTelemetry.get(operationName);
		if (!telemetry) {
			telemetry = {
				attempts: 0,
				successes: 0,
				failures: 0,
				retries: 0,
				contention: 0,
			};
			this.dataStoreTelemetry.set(operationName, telemetry);
		}

		return telemetry;
	}

	private runDataStoreWithRetry<T>(
		operationName: string,
		operation: () => T,
		maxAttempts = RunService.IsStudio() ? 2 : 3,
		baseDelaySeconds = RunService.IsStudio() ? 0.2 : 0.15,
	): [boolean, T | undefined, unknown?] {
		const telemetry = this.getDataStoreTelemetry(operationName);
		let lastError: unknown = undefined;

		for (let attempt = 1; attempt <= maxAttempts; attempt++) {
			telemetry.attempts += 1;
			const [success, resultOrError] = pcall(operation) as LuaTuple<[boolean, unknown]>;

			if (success) {
				telemetry.successes += 1;
				if (attempt > 1) {
					telemetry.retries += attempt - 1;
				}
				return [true, resultOrError as T, undefined];
			}

			lastError = resultOrError;

			if (attempt < maxAttempts) {
				const jitterSeconds = math.random() * 0.06;
				const backoffSeconds = baseDelaySeconds * math.pow(2, attempt - 1) + jitterSeconds;
				task.wait(backoffSeconds);
			}
		}

		telemetry.failures += 1;
		telemetry.last_error = tostring(lastError);
		telemetry.last_failure_at = os.time();

		warn(`[LocalBackend] DataStore operation '${operationName}' failed after ${maxAttempts} attempts:`, lastError);
		return [false, undefined, lastError];
	}

	private runLoopSafely(loopLabel: string, operation: () => void) {
		const [success, err] = pcall(operation) as LuaTuple<[boolean, unknown]>;
		if (!success) {
			warn(`[LocalBackend] ${loopLabel} loop iteration failed:`, err);
		}
	}

	private getJitteredIntervalSeconds(baseSeconds: number, jitterRatio = this.LOOP_JITTER_RATIO) {
		if (baseSeconds <= 0 || jitterRatio <= 0) return baseSeconds;
		const jitter = baseSeconds * jitterRatio * math.random();
		return baseSeconds + jitter;
	}

	private shouldRunSync(force: boolean, lastSyncAt: number, intervalSeconds: number, scope: string) {
		const now = tick();

		if (!force) {
			return now - lastSyncAt >= intervalSeconds;
		}

		if (now - lastSyncAt >= intervalSeconds) {
			return true;
		}

		const nextAllowed = this.forceSyncNextAllowedAt.get(scope) ?? 0;
		if (now < nextAllowed) {
			return false;
		}

		const cooldown = this.FORCE_SYNC_COOLDOWN_SECONDS + math.random() * this.FORCE_SYNC_JITTER_SECONDS;
		this.forceSyncNextAllowedAt.set(scope, now + cooldown);
		return true;
	}

	private shouldManageServerScopedRecord(serverId: string) {
		if (serverId === "global") return true;

		const currentServerId = this.getCurrentServerId();
		if (serverId === currentServerId) return true;

		if (RunService.IsStudio() && serverId === "LOCAL_SERVER") return true;
		return false;
	}

	private shouldManageJackpotRecord(record: JackpotRecord) {
		if (record.data.server_id !== "global") {
			return this.shouldManageServerScopedRecord(record.data.server_id);
		}

		for (const member of record.data.members) {
			const memberId = this.toNumber(member.player.id, 0);
			if (memberId > 0 && Players.GetPlayerByUserId(memberId)) {
				return true;
			}
		}

		return false;
	}

	private recordDataStoreContention(operationName: string) {
		const telemetry = this.getDataStoreTelemetry(operationName);
		telemetry.contention += 1;
	}

	private getDataStoreTelemetrySnapshot() {
		const snapshot = {} as Record<string, DataStoreOperationTelemetry>;
		for (const [operationName, telemetry] of this.dataStoreTelemetry) {
			snapshot[operationName] = {
				attempts: telemetry.attempts,
				successes: telemetry.successes,
				failures: telemetry.failures,
				retries: telemetry.retries,
				contention: telemetry.contention,
				last_error: telemetry.last_error,
				last_failure_at: telemetry.last_failure_at,
			};
		}

		return snapshot;
	}

	private normalizeInventoryTuple(rawTuple: unknown): InventoryTuple | undefined {
		if (!typeIs(rawTuple, "table")) return;

		const tuple = rawTuple as unknown[];
		const itemId = tostring(tuple[0] ?? "");
		const uaid = tostring(tuple[1] ?? "");
		const serial = tostring(tuple[2] ?? "1");
		const copyId = tostring(tuple[3] ?? serial);

		if (itemId.size() === 0 || uaid.size() === 0) return;

		const normalizedSerial = tostring(math.max(1, math.floor(tonumber(serial) ?? 1)));
		const normalizedCopyId = this.normalizeCopyId(copyId, normalizedSerial);

		return [itemId, uaid, normalizedSerial, normalizedCopyId];
	}

	private normalizeInventoryTupleArray(rawTuples: unknown): InventoryTuple[] {
		if (!typeIs(rawTuples, "table")) return [];
		const normalized = new Array<InventoryTuple>();

		for (const rawTuple of rawTuples as unknown[]) {
			const tuple = this.normalizeInventoryTuple(rawTuple);
			if (!tuple) continue;
			normalized.push(tuple);
		}

		return normalized;
	}

	private serializeListingRecord(record: ListingRecord): PersistedListingRecord {
		return {
			listing: {
				...record.listing,
			},
			item_tuple: [record.itemTuple[0], record.itemTuple[1], record.itemTuple[2], record.itemTuple[3]],
		};
	}

	private deserializeListingRecord(rawRecord: unknown): ListingRecord | undefined {
		if (!typeIs(rawRecord, "table")) return;

		const record = rawRecord as PersistedListingRecord;
		if (!typeIs(record.listing, "table")) return;

		const tuple = this.normalizeInventoryTuple(record.item_tuple);
		if (!tuple) return;

		const listing = record.listing;
		if (!typeIs(listing.user_asset_id, "string") || listing.user_asset_id.size() === 0) return;
		if (!typeIs(listing.seller_id, "string") || listing.seller_id.size() === 0) return;
		if (!typeIs(listing.item_id, "string") || listing.item_id.size() === 0) return;

		return {
			listing: {
				...listing,
				user_asset_id: tostring(listing.user_asset_id),
				seller_id: tostring(listing.seller_id),
				currency: tostring(listing.currency ?? "Cash"),
				created_at: tostring(listing.created_at ?? this.nowIso()),
				price: tostring(listing.price ?? "0"),
				item_id: tostring(listing.item_id),
				username: tostring(listing.username ?? "Unknown"),
				display_name: tostring(listing.display_name ?? "Unknown"),
				expires_at: listing.expires_at,
			},
			itemTuple: tuple,
		};
	}

	private normalizeGlobalMarketplaceState(rawState: unknown): GlobalMarketplaceState {
		const listings = {} as Record<string, PersistedListingRecord>;
		let updatedAt = os.time();

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalMarketplaceState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (state.listings && typeIs(state.listings, "table")) {
				for (const [uaid, rawListingRecord] of pairs(state.listings)) {
					const listingRecord = this.deserializeListingRecord(rawListingRecord);
					if (!listingRecord) continue;
					listings[tostring(uaid)] = this.serializeListingRecord(listingRecord);
				}
			}
		}

		return {
			listings,
			updated_at: updatedAt,
		};
	}

	private syncGlobalMarketplace(force = false) {
		if (!this.shouldRunSync(force, this.lastGlobalMarketplaceSync, this.GLOBAL_SYNC_INTERVAL, "marketplace"))
			return;

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_marketplace_get", () =>
			this.globalMarketplaceStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global marketplace state:", err);
			return;
		}

		const normalizedState = this.normalizeGlobalMarketplaceState(rawState);
		const nextListings = new Map<string, ListingRecord>();
		for (const [uaid, persistedRecord] of pairs(normalizedState.listings ?? {})) {
			const listingRecord = this.deserializeListingRecord(persistedRecord);
			if (!listingRecord) continue;
			nextListings.set(tostring(uaid), listingRecord);
		}

		this.listings.clear();
		for (const [uaid, listingRecord] of nextListings) {
			this.listings.set(uaid, listingRecord);
		}

		this.lastGlobalMarketplaceSync = tick();
	}

	private serializeTradeRecord(record: TradeRecord): PersistedTradeRecord {
		return {
			data: {
				...record.data,
			},
			initiator_items: record.initiatorItems.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
			receiver_items: record.receiverItems.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
		};
	}

	private deserializeTradeRecord(rawRecord: unknown): TradeRecord | undefined {
		if (!typeIs(rawRecord, "table")) return;

		const record = rawRecord as PersistedTradeRecord;
		if (!typeIs(record.data, "table")) return;

		const tradeData = record.data;
		if (!typeIs(tradeData.trade_id, "number")) return;
		if (!typeIs(tradeData.status, "string")) return;

		const initiatorItems = this.normalizeInventoryTupleArray(record.initiator_items);
		const receiverItems = this.normalizeInventoryTupleArray(record.receiver_items);

		return {
			data: {
				...tradeData,
				trade_id: math.floor(tradeData.trade_id),
				created_at: tostring(tradeData.created_at ?? this.nowIso()),
				updated_at: tostring(tradeData.updated_at ?? this.nowIso()),
			},
			initiatorItems,
			receiverItems,
		};
	}

	private normalizeGlobalTradesState(rawState: unknown): GlobalTradesState {
		const trades = {} as Record<string, PersistedTradeRecord>;
		let updatedAt = os.time();
		let nextTradeId = math.max(1, this.nextTradeId);

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalTradesState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (typeIs(state.next_trade_id, "number")) {
				nextTradeId = math.max(nextTradeId, math.floor(state.next_trade_id));
			}

			if (state.trades && typeIs(state.trades, "table")) {
				for (const [tradeId, rawTradeRecord] of pairs(state.trades)) {
					const tradeRecord = this.deserializeTradeRecord(rawTradeRecord);
					if (!tradeRecord) continue;
					trades[tostring(tradeId)] = this.serializeTradeRecord(tradeRecord);
				}
			}
		}

		for (const [tradeId] of pairs(trades)) {
			nextTradeId = math.max(nextTradeId, this.toNumber(tradeId, 0) + 1);
		}

		return {
			next_trade_id: math.max(1, nextTradeId),
			trades,
			updated_at: updatedAt,
		};
	}

	private syncGlobalTrades(force = false) {
		if (!this.shouldRunSync(force, this.lastGlobalTradesSync, this.GLOBAL_SYNC_INTERVAL, "trades")) return;

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_trades_get", () =>
			this.globalTradesStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global trades state:", err);
			return;
		}

		const normalizedState = this.normalizeGlobalTradesState(rawState);
		const nextTrades = new Map<number, TradeRecord>();
		for (const [tradeId, persistedTradeRecord] of pairs(normalizedState.trades ?? {})) {
			const tradeRecord = this.deserializeTradeRecord(persistedTradeRecord);
			if (!tradeRecord) continue;
			nextTrades.set(this.toNumber(tradeId, tradeRecord.data.trade_id), tradeRecord);
		}

		this.trades.clear();
		for (const [tradeId, tradeRecord] of nextTrades) {
			this.trades.set(tradeId, tradeRecord);
		}

		this.nextTradeId = math.max(1, normalizedState.next_trade_id ?? this.nextTradeId);
		this.lastGlobalTradesSync = tick();
	}

	private normalizeGlobalCashChangesState(rawState: unknown): GlobalCashChangesState {
		const changes = {} as Record<string, number>;
		let updatedAt = os.time();

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalCashChangesState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (state.changes && typeIs(state.changes, "table")) {
				for (const [userId, amount] of pairs(state.changes)) {
					if (!typeIs(amount, "number") || amount === 0) continue;
					changes[tostring(userId)] = amount;
				}
			}
		}

		return {
			changes,
			updated_at: updatedAt,
		};
	}

	private syncGlobalCashChanges(force = false) {
		if (
			!this.shouldRunSync(force, this.lastGlobalCashChangesSync, this.CASH_CHANGES_SYNC_INTERVAL, "cash_changes")
		) {
			return;
		}

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_cash_changes_get", () =>
			this.globalCashChangesStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global cash change state:", err);
			return;
		}

		this.cachedGlobalCashChangesState = this.normalizeGlobalCashChangesState(rawState);
		this.lastGlobalCashChangesSync = tick();
	}

	private serializeCoinflipRecord(record: CoinflipRecord): PersistedCoinflipRecord {
		return {
			data: {
				...record.data,
				player1_items: this.toItemStrings(record.player1Items),
				player2_items: record.player2Items ? this.toItemStrings(record.player2Items) : undefined,
			},
			player1_items: record.player1Items.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
			player2_items: record.player2Items?.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
			locked_items: record.lockedItems.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
			joined_at: record.joinedAt,
			completed_at: record.completedAt,
		};
	}

	private deserializeCoinflipRecord(rawRecord: unknown): CoinflipRecord | undefined {
		if (!typeIs(rawRecord, "table")) return;

		const record = rawRecord as PersistedCoinflipRecord;
		if (!typeIs(record.data, "table")) return;

		const data = record.data;
		if (!typeIs(data.id, "string") || data.id.size() === 0) return;
		if (!typeIs(data.player1, "table")) return;

		const player1Id = tostring(data.player1.id ?? "");
		if (player1Id.size() === 0) return;

		const player1Items = this.normalizeInventoryTupleArray(record.player1_items);
		const player2Items = this.normalizeInventoryTupleArray(record.player2_items);
		const lockedItems = this.normalizeInventoryTupleArray(record.locked_items);

		const mergedLockedItems = lockedItems.size() > 0 ? lockedItems : [...player1Items, ...player2Items];

		const status = tostring(data.status ?? "waiting_for_player");
		const normalizedStatus =
			status === "awaiting_confirmation" || status === "completed" || status === "failed"
				? status
				: "waiting_for_player";

		const flipType = tostring(data.type ?? "global");
		const normalizedType =
			flipType === "server" || flipType === "friends" || flipType === "global" ? flipType : "global";

		const player2 = typeIs(data.player2, "table")
			? {
					id: tostring(data.player2.id ?? ""),
					username: tostring(data.player2.username ?? "Unknown"),
					display_name: tostring(data.player2.display_name ?? data.player2.username ?? "Unknown"),
				}
			: undefined;

		const normalizedData: Coinflip = {
			...data,
			id: tostring(data.id),
			auto_id: typeIs(data.auto_id, "number") ? math.max(1, math.floor(data.auto_id)) : undefined,
			player1: {
				id: player1Id,
				username: tostring(data.player1.username ?? "Unknown"),
				display_name: tostring(data.player1.display_name ?? data.player1.username ?? "Unknown"),
			},
			player2,
			player1_items: this.toItemStrings(player1Items),
			player2_items: player2Items.size() > 0 ? this.toItemStrings(player2Items) : undefined,
			status: normalizedStatus as Coinflip["status"],
			type: normalizedType as Coinflip["type"],
			server_id: tostring(data.server_id ?? "LOCAL_SERVER"),
			player1_coin: data.player1_coin === 2 ? 2 : 1,
			winning_coin: data.winning_coin === 2 ? 2 : data.winning_coin === 1 ? 1 : undefined,
			transfer_id: typeIs(data.transfer_id, "string") ? data.transfer_id : undefined,
			locked: data.locked,
		};

		return {
			data: normalizedData,
			player1Items,
			player2Items: player2Items.size() > 0 ? player2Items : undefined,
			lockedItems: mergedLockedItems,
			joinedAt: typeIs(record.joined_at, "number") ? math.floor(record.joined_at) : undefined,
			completedAt: typeIs(record.completed_at, "number") ? math.floor(record.completed_at) : undefined,
		};
	}

	private normalizeGlobalCoinflipsState(rawState: unknown): GlobalCoinflipsState {
		const coinflips = {} as Record<string, PersistedCoinflipRecord>;
		let updatedAt = os.time();
		let nextAutoId = math.max(1, this.nextCoinflipAutoId);

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalCoinflipsState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (typeIs(state.next_coinflip_auto_id, "number")) {
				nextAutoId = math.max(nextAutoId, math.floor(state.next_coinflip_auto_id));
			}

			   if (state.coinflips && typeIs(state.coinflips, "table")) {
				   for (const [coinflipId, rawCoinflipRecord] of pairs(state.coinflips)) {
					   const coinflipRecord = this.deserializeCoinflipRecord(rawCoinflipRecord);
					   if (!coinflipRecord) continue;
					   const now = os.time();
					   const completedAt = typeIs(rawCoinflipRecord, "table") && typeIs(rawCoinflipRecord.completed_at, "number") ? math.floor(rawCoinflipRecord.completed_at) : 0;
					   if (
						   coinflipRecord.data.status === "completed" &&
						   now - completedAt > 10 // wait 10s before removing
					   ) {
						   continue; // skip adding = deletes it from sync
					   }
					   coinflips[tostring(coinflipId)] = this.serializeCoinflipRecord(coinflipRecord);
					   nextAutoId = math.max(nextAutoId, (coinflipRecord.data.auto_id ?? 0) + 1);
				   }
			   }
		}

		return {
			next_coinflip_auto_id: math.max(1, nextAutoId),
			coinflips,
			updated_at: updatedAt,
		};
	}

	private syncGlobalCoinflips(force = false) {
		if (!this.shouldRunSync(force, this.lastGlobalCoinflipsSync, this.MINIGAME_SYNC_INTERVAL, "coinflips")) {
			return;
		}

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_coinflips_get", () =>
			this.globalCoinflipsStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global coinflips state:", err);
			return;
		}

		const normalizedState = this.normalizeGlobalCoinflipsState(rawState);
		const nextCoinflips = new Map<string, CoinflipRecord>();
		for (const [coinflipId, persistedCoinflipRecord] of pairs(normalizedState.coinflips ?? {})) {
			const coinflipRecord = this.deserializeCoinflipRecord(persistedCoinflipRecord);
			if (!coinflipRecord) continue;
			nextCoinflips.set(tostring(coinflipId), coinflipRecord);
		}

		this.coinflips.clear();
		for (const [coinflipId, coinflipRecord] of nextCoinflips) {
			this.coinflips.set(coinflipId, coinflipRecord);
		}

		this.nextCoinflipAutoId = math.max(1, normalizedState.next_coinflip_auto_id ?? this.nextCoinflipAutoId);
		this.lastGlobalCoinflipsSync = tick();
	}

	private serializeCaseBattleRecord(record: CaseBattleRecord): PersistedCaseBattleRecord {
		return {
			data: {
				...record.data,
			},
			completed_at: record.completedAt,
			resolved_pulls: record.resolvedPulls,
			resolved_winners: record.resolvedWinners,
		};
	}

	private deserializeCaseBattleRecord(rawRecord: unknown): CaseBattleRecord | undefined {
		if (!typeIs(rawRecord, "table")) return;

		const record = rawRecord as PersistedCaseBattleRecord;
		if (!typeIs(record.data, "table")) return;

		const data = record.data;
		if (!typeIs(data.id, "string") || data.id.size() === 0) return;

		const allowedTeamModes = new Set<CaseBattleData["team_mode"]>(["1v1", "1v1v1", "1v1v1v1", "2v2"]);
		const teamModeRaw = tostring(data.team_mode ?? "1v1") as CaseBattleData["team_mode"];
		const teamMode = allowedTeamModes.has(teamModeRaw) ? teamModeRaw : "1v1";

		const allowedModes = new Set<CaseBattleData["mode"]>(["Standard", "Randomized", "Showdown", "Group"]);
		const modeRaw = tostring(data.mode ?? "Standard") as CaseBattleData["mode"];
		const mode = allowedModes.has(modeRaw) ? modeRaw : "Standard";

		const statusRaw = tostring(data.status ?? "waiting_for_players");
		const status = statusRaw === "in_progress" || statusRaw === "completed" ? statusRaw : "waiting_for_players";

		const players = new Array<CaseBattleData["players"][number]>();
		if (typeIs(data.players, "table")) {
			for (const rawPlayer of data.players as unknown[]) {
				if (!typeIs(rawPlayer, "table")) continue;
				const playerId = tostring((rawPlayer as { id?: string }).id ?? "");
				if (playerId.size() === 0) continue;

				players.push({
					id: playerId,
					username: tostring((rawPlayer as { username?: string }).username ?? "Unknown"),
					display_name: tostring(
						(rawPlayer as { display_name?: string; username?: string }).display_name ??
							(rawPlayer as { username?: string }).username ??
							"Unknown",
					),
					position: math.max(1, math.floor(tonumber((rawPlayer as { position?: number }).position) ?? 1)),
					bot: (rawPlayer as { bot?: boolean }).bot === true,
					client_seed: tostring((rawPlayer as { client_seed?: string }).client_seed ?? ""),
				});
			}
		}

		const cases = new Array<string>();
		if (typeIs(data.cases, "table")) {
			for (const caseId of data.cases as unknown[]) {
				const normalizedCaseId = tostring(caseId ?? "");
				if (normalizedCaseId.size() === 0) continue;
				cases.push(normalizedCaseId);
			}
		}

		const currentSpinData = typeIs(data.current_spin_data, "table")
			? {
					current_case_index: math.max(
						0,
						math.floor(tonumber(data.current_spin_data.current_case_index ?? 0) ?? 0),
					),
					case_id: tostring(data.current_spin_data.case_id ?? ""),
					progress: tostring(data.current_spin_data.progress ?? "0"),
				}
			: {
					current_case_index: 0,
					case_id: cases[0] ?? "",
					progress: "0",
				};

		const normalizedData: CaseBattleData = {
			...data,
			id: tostring(data.id),
			server_id: tostring(data.server_id ?? "LOCAL_SERVER"),
			server_seed: tostring(data.server_seed ?? ""),
			team_mode: teamMode,
			crazy: data.crazy === true,
			mode,
			fast_mode: data.fast_mode === true,
			players,
			cases,
			player_pulls: typeIs(data.player_pulls, "table")
				? (data.player_pulls as CaseBattleData["player_pulls"])
				: ({} as CaseBattleData["player_pulls"]),
			current_spin_data: currentSpinData,
			winners_info: typeIs(data.winners_info, "table")
				? (data.winners_info as CaseBattleData["winners_info"])
				: undefined,
			status: status as CaseBattleData["status"],
			next_step_at: typeIs(data.next_step_at, "number") ? math.floor(data.next_step_at) : undefined,
			created_at: math.floor(tonumber(data.created_at ?? os.time()) ?? os.time()),
			started_at: math.max(0, math.floor(tonumber(data.started_at ?? 0) ?? 0)),
			completed_at: math.max(0, math.floor(tonumber(data.completed_at ?? 0) ?? 0)),
			updated_at: math.floor(tonumber(data.updated_at ?? os.time()) ?? os.time()),
		};

		return {
			data: normalizedData,
			completedAt: typeIs(record.completed_at, "number") ? math.floor(record.completed_at) : undefined,
			resolvedPulls: typeIs(record.resolved_pulls, "table")
				? (record.resolved_pulls as CaseBattleData["player_pulls"])
				: undefined,
			resolvedWinners: typeIs(record.resolved_winners, "table")
				? (record.resolved_winners as CaseBattleData["winners_info"])
				: undefined,
		};
	}

	private normalizeGlobalCaseBattlesState(rawState: unknown): GlobalCaseBattlesState {
		const caseBattles = {} as Record<string, PersistedCaseBattleRecord>;
		let updatedAt = os.time();

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalCaseBattlesState;

			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (state.case_battles && typeIs(state.case_battles, "table")) {
				for (const [battleId, rawCaseBattleRecord] of pairs(state.case_battles)) {
					const caseBattleRecord = this.deserializeCaseBattleRecord(rawCaseBattleRecord);
					if (!caseBattleRecord) continue;

					const now = os.time();
					const completedAt = caseBattleRecord.data.completed_at ?? 0;

					if (
						caseBattleRecord.data.status === "completed" &&
						now - completedAt > 10 // wait 10s before removing
					) {
						continue; // ❌ skip adding = deletes it from sync
					}

					caseBattles[tostring(battleId)] = this.serializeCaseBattleRecord(caseBattleRecord);
				}
			}
		}

		return {
			case_battles: caseBattles,
			updated_at: updatedAt,
		};
	}

	private syncGlobalCaseBattles(force = false) {
		if (!this.shouldRunSync(force, this.lastGlobalCaseBattlesSync, this.MINIGAME_SYNC_INTERVAL, "case_battles"))
			return;

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_case_battles_get", () =>
			this.globalCaseBattlesStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global case battles state:", err);
			return;
		}

		const normalizedState = this.normalizeGlobalCaseBattlesState(rawState);
		const nextCaseBattles = new Map<string, CaseBattleRecord>();
		for (const [battleId, persistedCaseBattleRecord] of pairs(normalizedState.case_battles ?? {})) {
			const caseBattleRecord = this.deserializeCaseBattleRecord(persistedCaseBattleRecord);
			if (!caseBattleRecord) continue;
			nextCaseBattles.set(tostring(battleId), caseBattleRecord);
		}

		this.caseBattles.clear();
		for (const [battleId, caseBattleRecord] of nextCaseBattles) {
			this.caseBattles.set(battleId, caseBattleRecord);
		}

		this.lastGlobalCaseBattlesSync = tick();
	}

	private serializeJackpotRecord(record: JackpotRecord): PersistedJackpotRecord {
		const lockedByUser = {} as Record<string, InventoryTuple[]>;
		record.lockedByUser.forEach((tuples, userId) => {
			lockedByUser[userId] = tuples.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]);
		});

		return {
			data: {
				...record.data,
			},
			locked_by_user: lockedByUser,
			in_progress_at: record.inProgressAt,
			completed_at: record.completedAt,
		};
	}

	private deserializeJackpotRecord(rawRecord: unknown): JackpotRecord | undefined {
		if (!typeIs(rawRecord, "table")) return;

		const record = rawRecord as PersistedJackpotRecord;
		if (!typeIs(record.data, "table")) return;

		const data = record.data;
		if (!typeIs(data.id, "string") || data.id.size() === 0) return;

		const creatorId = tostring(data.creator?.id ?? "0");
		const members = new Array<JackpotData["members"][number]>();
		if (typeIs(data.members, "table")) {
			for (const rawMember of data.members as unknown[]) {
				if (!typeIs(rawMember, "table")) continue;
				const member = rawMember as {
					player?: { id?: unknown; username?: unknown; display_name?: unknown };
					total_value?: unknown;
					items?: unknown;
					client_seed?: unknown;
				};

				if (!typeIs(member.player, "table")) continue;
				const memberId = tostring(member.player.id ?? "");
				if (memberId.size() === 0) continue;

				const memberItems = new Array<string>();
				if (typeIs(member.items, "table")) {
					for (const entry of member.items as unknown[]) {
						memberItems.push(tostring(entry ?? ""));
					}
				}

				members.push({
					player: {
						id: memberId,
						username: tostring(member.player.username ?? "Unknown"),
						display_name: tostring(member.player.display_name ?? member.player.username ?? "Unknown"),
					},
					total_value: math.max(0, math.floor(tonumber(member.total_value ?? 0) ?? 0)),
					items: memberItems,
					client_seed: tostring(member.client_seed ?? ""),
				});
			}
		}

		const statusRaw = tostring(data.status ?? "waiting_for_start");
		const status =
			statusRaw === "countdown" || statusRaw === "in_progress" || statusRaw === "complete"
				? statusRaw
				: "waiting_for_start";

		const lockedByUser = new Map<string, InventoryTuple[]>();
		if (record.locked_by_user && typeIs(record.locked_by_user, "table")) {
			for (const [userId, tuples] of pairs(record.locked_by_user)) {
				const normalizedTuples = this.normalizeInventoryTupleArray(tuples);
				if (normalizedTuples.size() === 0) continue;
				lockedByUser.set(tostring(userId), normalizedTuples);
			}
		}

		const normalizedData: JackpotData = {
			...data,
			id: tostring(data.id),
			server_id: tostring(data.server_id ?? "LOCAL_SERVER"),
			server_seed: tostring(data.server_seed ?? ""),
			creator: {
				id: creatorId,
				username: tostring(data.creator?.username ?? "System"),
				display_name: tostring(data.creator?.display_name ?? data.creator?.username ?? "System"),
			},
			value_cap: normalizeJackpotValueCap(
				data.value_cap,
				creatorId === "0" ? 1000000 : JACKPOT_INFINITY_VALUE_CAP,
			),
			joinable: data.joinable === true,
			leaveable: data.leaveable === true,
			status: status as JackpotData["status"],
			members,
			countdown_end_at: math.max(0, math.floor(tonumber(data.countdown_end_at ?? 0) ?? 0)),
			created_at: math.floor(tonumber(data.created_at ?? os.time()) ?? os.time()),
			updated_at: math.floor(tonumber(data.updated_at ?? os.time()) ?? os.time()),
			transfer_id: typeIs(data.transfer_id, "string") ? data.transfer_id : undefined,
			winning_data: typeIs(data.winning_data, "table") ? data.winning_data : undefined,
			is_system_pot: data.is_system_pot === true || creatorId === "0",
			auto_start_at: typeIs(data.auto_start_at, "number") ? math.floor(data.auto_start_at) : undefined,
			value_floor: typeIs(data.value_floor, "number") ? math.max(0, math.floor(data.value_floor)) : undefined,
			max_players: typeIs(data.max_players, "number") ? math.max(2, math.floor(data.max_players)) : undefined,
		};

		return {
			data: normalizedData,
			lockedByUser,
			inProgressAt: typeIs(record.in_progress_at, "number") ? math.floor(record.in_progress_at) : undefined,
			completedAt: typeIs(record.completed_at, "number") ? math.floor(record.completed_at) : undefined,
		};
	}

	private normalizeGlobalJackpotsState(rawState: unknown): GlobalJackpotsState {
		const jackpots = {} as Record<string, PersistedJackpotRecord>;
		let updatedAt = os.time();

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalJackpotsState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			   if (state.jackpots && typeIs(state.jackpots, "table")) {
				   for (const [jackpotId, rawJackpotRecord] of pairs(state.jackpots)) {
					   const jackpotRecord = this.deserializeJackpotRecord(rawJackpotRecord);
					   if (!jackpotRecord) continue;
					   const now = os.time();
					   const completedAt = typeIs(rawJackpotRecord, "table") && typeIs(rawJackpotRecord.completed_at, "number") ? math.floor(rawJackpotRecord.completed_at) : 0;
					   if (
						   jackpotRecord.data.status === "complete" &&
						   now - completedAt > 10 // wait 10s before removing
					   ) {
						   continue; // skip adding = deletes it from sync
					   }
					   jackpots[tostring(jackpotId)] = this.serializeJackpotRecord(jackpotRecord);
				   }
			   }
		}

		return {
			jackpots,
			updated_at: updatedAt,
		};
	}

	private syncGlobalJackpots(force = false) {
		if (!this.shouldRunSync(force, this.lastGlobalJackpotsSync, this.MINIGAME_SYNC_INTERVAL, "jackpots")) {
			return;
		}

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_jackpots_get", () =>
			this.globalJackpotsStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global jackpots state:", err);
			return;
		}

		const normalizedState = this.normalizeGlobalJackpotsState(rawState);
		const nextJackpots = new Map<string, JackpotRecord>();
		for (const [jackpotId, persistedJackpotRecord] of pairs(normalizedState.jackpots ?? {})) {
			const jackpotRecord = this.deserializeJackpotRecord(persistedJackpotRecord);
			if (!jackpotRecord) continue;
			nextJackpots.set(tostring(jackpotId), jackpotRecord);
		}

		this.jackpots.clear();
		for (const [jackpotId, jackpotRecord] of nextJackpots) {
			this.jackpots.set(jackpotId, jackpotRecord);
		}

		this.lastGlobalJackpotsSync = tick();
	}

	private normalizeGlobalInventoryChangesState(rawState: unknown): GlobalInventoryChangesState {
		const changes = {} as Record<string, InventoryTuple[]>;
		let updatedAt = os.time();

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalInventoryChangesState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (state.changes && typeIs(state.changes, "table")) {
				for (const [userId, tuples] of pairs(state.changes)) {
					const normalizedTuples = this.normalizeInventoryTupleArray(tuples);
					if (normalizedTuples.size() === 0) continue;
					changes[tostring(userId)] = normalizedTuples;
				}
			}
		}

		return {
			changes,
			updated_at: updatedAt,
		};
	}

	private syncGlobalInventoryChanges(force = false) {
		if (
			!this.shouldRunSync(
				force,
				this.lastGlobalInventoryChangesSync,
				this.INVENTORY_CHANGES_SYNC_INTERVAL,
				"inventory_changes",
			)
		)
			return;

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_inventory_changes_get", () =>
			this.globalInventoryChangesStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to sync global inventory changes state:", err);
			return;
		}

		this.cachedGlobalInventoryChangesState = this.normalizeGlobalInventoryChangesState(rawState);
		this.lastGlobalInventoryChangesSync = tick();
	}

	private normalizeGlobalUsersState(rawState: unknown): GlobalUsersState {
		const users = {} as Record<string, LocalUser>;
		let updatedAt = os.time();

		if (typeIs(rawState, "table")) {
			const state = rawState as GlobalUsersState;
			if (typeIs(state.updated_at, "number")) {
				updatedAt = state.updated_at;
			}

			if (state.users && typeIs(state.users, "table")) {
				for (const [userId, rawUser] of pairs(state.users)) {
					const normalizedUserId = tostring(userId);
					if (!this.isRobloxUserId(normalizedUserId)) continue;
					if (!typeIs(rawUser, "table")) continue;
					users[normalizedUserId] = this.normalizeLocalUserSnapshot(normalizedUserId, rawUser as LocalUser);
				}
			}
		}

		return {
			users,
			updated_at: updatedAt,
		};
	}

	private setGlobalUsersFromState(state: GlobalUsersState) {
		this.globalUsers.clear();
		for (const [userId, user] of pairs(state.users ?? {})) {
			const normalizedUserId = tostring(userId);
			if (!this.isRobloxUserId(normalizedUserId)) continue;
			this.globalUsers.set(normalizedUserId, this.normalizeLocalUserSnapshot(normalizedUserId, user));
		}
	}

	private syncGlobalUsers(force = false) {
		if (!this.shouldRunSync(force, this.lastGlobalUsersSync, this.GLOBAL_USERS_SYNC_INTERVAL, "users")) return;

		const pendingIds = new Array<string>();
		const pendingUpdates = {} as Record<string, LocalUser>;
		for (const userId of this.pendingGlobalUserSync) {
			if (!this.isRobloxUserId(userId)) continue;
			const localUser = this.users.get(userId);
			if (!localUser) continue;
			pendingIds.push(userId);
			pendingUpdates[userId] = this.normalizeLocalUserSnapshot(userId, localUser);
		}

		if (pendingIds.size() > 0) {
			const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_users_update", () =>
				this.globalUsersStore.UpdateAsync("global", (existingState) => {
					const normalizedState = this.normalizeGlobalUsersState(existingState);
					const nextUsers = normalizedState.users ?? {};

					for (const [userId, user] of pairs(pendingUpdates)) {
						const normalizedUserId = tostring(userId);
						const existingUser = nextUsers[normalizedUserId];
						if (!existingUser) {
							nextUsers[normalizedUserId] = user;
							continue;
						}

						const existingLastSeen = tostring(existingUser.last_seen_at ?? "");
						const nextLastSeen = tostring(user.last_seen_at ?? "");
						let mergedLastSeen = existingLastSeen;

						if (nextLastSeen.size() > 0) {
							const existingLastSeenUnix = this.parseIsoDateToUnixTimestamp(existingLastSeen);
							const nextLastSeenUnix = this.parseIsoDateToUnixTimestamp(nextLastSeen);
							if (
								existingLastSeenUnix === undefined ||
								(nextLastSeenUnix !== undefined && nextLastSeenUnix > existingLastSeenUnix)
							) {
								mergedLastSeen = nextLastSeen;
							}
						}

						nextUsers[normalizedUserId] = {
							...existingUser,
							...user,
							last_seen_at: mergedLastSeen.size() > 0 ? mergedLastSeen : undefined,
						};
					}

					const nextState: GlobalUsersState = {
						users: nextUsers,
						updated_at: os.time(),
					};

					return $tuple(nextState);
				}),
			);

			if (success) {
				const normalizedState = this.normalizeGlobalUsersState(rawState);
				this.setGlobalUsersFromState(normalizedState);
				pendingIds.forEach((userId) => this.pendingGlobalUserSync.delete(userId));
				this.lastGlobalUsersSync = tick();
				return;
			}

			warn("[LocalBackend] Failed to sync global users state:", err);
		}

		const [success, rawState, err] = this.runDataStoreWithRetry<unknown>("global_users_get", () =>
			this.globalUsersStore.GetAsync("global"),
		);
		if (!success) {
			warn("[LocalBackend] Failed to fetch global users state:", err);
			return;
		}

		const normalizedState = this.normalizeGlobalUsersState(rawState);
		this.setGlobalUsersFromState(normalizedState);
		this.lastGlobalUsersSync = tick();
	}

	private consumeLocalInventoryGrants(userId: string) {
		const localGrants = this.pendingInventoryGrants.get(userId);
		if (!localGrants || localGrants.size() === 0) return [] as InventoryTuple[];
		this.pendingInventoryGrants.delete(userId);
		return localGrants;
	}

	private consumeGlobalInventoryGrants(userId: string) {
		if (userId.size() === 0) return [] as InventoryTuple[];

		this.syncGlobalInventoryChanges();
		const cachedChanges = this.cachedGlobalInventoryChangesState.changes ?? {};
		const pendingFromGlobal = cachedChanges[userId];

		if (!pendingFromGlobal || pendingFromGlobal.size() === 0) {
			return this.consumeLocalInventoryGrants(userId);
		}

		let consumed = new Array<InventoryTuple>();
		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_inventory_changes_consume_update", () =>
			this.globalInventoryChangesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalInventoryChangesState(existingState);
				const nextChanges = normalizedState.changes ?? {};
				const userChanges = nextChanges[userId] ?? [];

				if (userChanges.size() === 0) {
					consumed = [];
					return $tuple(existingState);
				}

				consumed = new Array<InventoryTuple>();
				userChanges.forEach((tuple) => consumed.push([tuple[0], tuple[1], tuple[2], tuple[3]]));
				delete nextChanges[userId];

				const nextState: GlobalInventoryChangesState = {
					changes: nextChanges,
					updated_at: os.time(),
				};

				this.cachedGlobalInventoryChangesState = nextState;
				this.lastGlobalInventoryChangesSync = tick();

				return $tuple(nextState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to consume global inventory grants:", err);
			return this.consumeLocalInventoryGrants(userId);
		}

		if (consumed.size() === 0) {
			return this.consumeLocalInventoryGrants(userId);
		}

		const localFallback = this.consumeLocalInventoryGrants(userId);
		if (localFallback.size() === 0) return consumed;

		for (const tuple of localFallback) {
			consumed.push(tuple);
		}
		return consumed;
	}

	private queueInventoryGrant(userId: string, tuples: InventoryTuple[]) {
		if (userId.size() === 0 || tuples.size() === 0) return;

		const normalizedTuples = tuples.map((tuple) => {
			const normalizedSerial = tostring(math.max(1, math.floor(tonumber(tuple[2]) ?? 1)));
			const normalizedCopyId = this.normalizeCopyId(tostring(tuple[3]), normalizedSerial);
			return [tuple[0], tuple[1], normalizedSerial, normalizedCopyId] as InventoryTuple;
		});

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_inventory_changes_queue_update", () =>
			this.globalInventoryChangesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalInventoryChangesState(existingState);
				const nextChanges = normalizedState.changes ?? {};
				const existingTuples = nextChanges[userId] ?? [];

				normalizedTuples.forEach((tuple) => existingTuples.push([tuple[0], tuple[1], tuple[2], tuple[3]]));
				nextChanges[userId] = existingTuples;

				const nextState: GlobalInventoryChangesState = {
					changes: nextChanges,
					updated_at: os.time(),
				};

				this.cachedGlobalInventoryChangesState = nextState;
				this.lastGlobalInventoryChangesSync = tick();

				return $tuple(nextState);
			}),
		);

		if (success) return;

		warn("[LocalBackend] Failed to queue global inventory grant:", err);
		const currentLocalGrants = this.pendingInventoryGrants.get(userId) ?? [];
		normalizedTuples.forEach((tuple) => currentLocalGrants.push(tuple));
		this.pendingInventoryGrants.set(userId, currentLocalGrants);
	}

	private consumeLocalCashChanges(userIds: string[]) {
		const changes = new Array<{ user_id: string; amount: string }>();
		userIds.forEach((id) => {
			const amount = this.pendingCashChanges.get(id);
			if (!amount || amount === 0) return;
			this.pendingCashChanges.delete(id);
			changes.push({
				user_id: id,
				amount: tostring(amount),
			});
		});
		return changes;
	}

	private consumeGlobalCashChanges(userIds: string[]) {
		if (userIds.size() === 0) return [] as { user_id: string; amount: string }[];

		this.syncGlobalCashChanges();
		const cachedChanges = this.cachedGlobalCashChangesState.changes ?? {};
		const hasPendingGlobalChanges = userIds.some((userId) => (cachedChanges[userId] ?? 0) !== 0);

		if (!hasPendingGlobalChanges) {
			return this.consumeLocalCashChanges(userIds);
		}

		let consumed = new Array<{ user_id: string; amount: string }>();
		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_cash_changes_consume_update", () =>
			this.globalCashChangesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCashChangesState(existingState);
				const nextChanges = normalizedState.changes ?? {};
				let changed = false;

				consumed = new Array<{ user_id: string; amount: string }>();
				userIds.forEach((userId) => {
					const amount = nextChanges[userId] ?? 0;
					if (amount === 0) return;
					consumed.push({
						user_id: userId,
						amount: tostring(amount),
					});
					delete nextChanges[userId];
					changed = true;
				});

				if (!changed) {
					return $tuple(existingState);
				}

				const nextState: GlobalCashChangesState = {
					changes: nextChanges,
					updated_at: os.time(),
				};

				this.cachedGlobalCashChangesState = nextState;
				this.lastGlobalCashChangesSync = tick();

				return $tuple(nextState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to consume global cash changes:", err);
			return this.consumeLocalCashChanges(userIds);
		}

		if (consumed.size() === 0) {
			return this.consumeLocalCashChanges(userIds);
		}

		return consumed;
	}

	private loadCaseStats() {
		const [success, result] = this.runDataStoreWithRetry<unknown>("case_stats_get", () =>
			this.caseStatsStore.GetAsync("global"),
		);
		if (!success || !typeIs(result, "table")) return;

		const state = result as LocalCaseStats;
		const openedCounts = state.opened_counts;
		if (!openedCounts || !typeIs(openedCounts, "table")) return;

		for (const [caseId, caseData] of this.cases) {
			const persistedCount = openedCounts[caseId];
			if (!typeIs(persistedCount, "number")) continue;
			caseData.opened_count = math.max(0, math.floor(persistedCount));
		}
	}

	private flushCaseStats() {
		if (this.pendingCaseOpenIncrements.size() === 0) return;

		const incrementsSnapshot = new Map<string, number>();
		for (const [caseId, amount] of this.pendingCaseOpenIncrements) {
			if (amount > 0) incrementsSnapshot.set(caseId, amount);
		}

		if (incrementsSnapshot.size() === 0) return;
		if (!this.applyCaseOpenIncrements(incrementsSnapshot)) return;

		for (const [caseId, amount] of incrementsSnapshot) {
			const remaining = (this.pendingCaseOpenIncrements.get(caseId) ?? 0) - amount;
			if (remaining <= 0) {
				this.pendingCaseOpenIncrements.delete(caseId);
			} else {
				this.pendingCaseOpenIncrements.set(caseId, remaining);
			}
		}
	}

	private applyCaseOpenIncrements(increments: Map<string, number>) {
		const [success, _, err] = this.runDataStoreWithRetry<unknown>("case_stats_update", () =>
			this.caseStatsStore.UpdateAsync("global", (existingState) => {
				const openedCounts = {} as Record<string, number>;

				if (typeIs(existingState, "table")) {
					const existingOpenedCounts = (existingState as LocalCaseStats).opened_counts;
					if (existingOpenedCounts && typeIs(existingOpenedCounts, "table")) {
						for (const [caseId, count] of pairs(existingOpenedCounts)) {
							if (typeIs(count, "number")) {
								openedCounts[tostring(caseId)] = math.max(0, math.floor(count));
							}
						}
					}
				}

				for (const [caseId, increment] of increments) {
					if (increment <= 0) continue;
					const currentValue = openedCounts[caseId] ?? 0;
					openedCounts[caseId] = math.max(0, math.floor(currentValue + increment));
				}

				return $tuple({
					opened_counts: openedCounts,
					updated_at: os.time(),
				});
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to persist case stats:", err);
			return false;
		}

		return true;
	}

	private syncCaseBattleCaseOpenCount(caseId: string) {
		const caseData = this.cases.get(caseId);
		if (!caseData) return;

		const battleCase = this.caseBattleCases.find((entry) => entry.id === caseId);
		if (battleCase) {
			battleCase.total_opened = caseData.opened_count;
		}
	}

	private loadUserState(userId: string) {
		if (this.loadedUsers.has(userId)) return;
		this.loadedUsers.add(userId);

		const [success, result] = pcall(() => this.persistenceStore.GetAsync(userId));

		if (success && typeIs(result, "table")) {
			const state = result as {
				inventory?: InventoryTuple[];
				user?: LocalUser;
			};

			if (state.user) this.users.set(userId, state.user);
			if (state.inventory) {
				const normalizedInventory = new Array<InventoryTuple>();
				let inventoryWasNormalized = false;

				state.inventory.forEach((tuple) => {
					const itemId = tostring(tuple[0] ?? "");
					const uaid = tostring(tuple[1] ?? `FF${HttpService.GenerateGUID(false)}`);
					const rawSerial = tostring(tuple[2] ?? "1");
					const serialNumber = tonumber(rawSerial) ?? 1;
					const normalizedSerial = tostring(math.max(1, math.floor(serialNumber)));
					const rawCopyId = tostring(tuple[3] ?? "");
					const normalizedCopyId = this.normalizeCopyId(rawCopyId, normalizedSerial);

					if (rawSerial !== normalizedSerial || rawCopyId !== normalizedCopyId) {
						inventoryWasNormalized = true;
					}

					normalizedInventory.push([itemId, uaid, normalizedSerial, normalizedCopyId]);

					const serial = tonumber(normalizedSerial) ?? 0;
					const copyNumber = tonumber(normalizedCopyId) ?? serial;
					const knownSerial = math.max(serial, copyNumber);
					const current = this.itemSerialByItemId.get(itemId) ?? 0;
					if (knownSerial > current) this.itemSerialByItemId.set(itemId, knownSerial);
				});

				this.inventories.set(userId, normalizedInventory);
				if (inventoryWasNormalized) this.markDirty(userId);
			}
		}

		if (!this.users.has(userId)) this.users.set(userId, this.createDefaultUser(userId));
		if (!this.inventories.has(userId)) {
			this.inventories.set(userId, []);
			this.seedStarterInventory(userId);
		}

		this.recalculateUserValue(userId);
	}

	private saveUserState(userId: string) {
		const user = this.users.get(userId);
		const inventory = this.inventories.get(userId);
		if (!user || !inventory) return true;

		const [success, err] = pcall(() =>
			this.persistenceStore.SetAsync(userId, {
				user,
				inventory,
			}),
		) as LuaTuple<[boolean, unknown]>;

		if (!success) {
			warn(`[LocalBackend] Failed to persist user ${userId}:`, err);
			return false;
		}

		return true;
	}

	private markDirty(userId: string) {
		if (userId.size() === 0) return;
		this.dirtyUsers.add(userId);
		if (this.isRobloxUserId(userId)) {
			this.pendingGlobalUserSync.add(userId);
		}
	}

	handleRequest(method: HttpMethod, route: string, headers?: Record<string, string>, body?: unknown): RouteResponse {
		const [rawPath, rawQuery] = route.split("?");
		const path = rawPath.size() > 0 ? rawPath : "/";
		const query = this.parseQuery(rawQuery);
		const segments = path.split("/");

		if (method === "GET" && path === "/settings") {
			return this.ok(this.getSettings());
		}

		if (method === "GET" && path === "/users/get-cash-changes") {
			const userIds = (headers?.["user-ids"] ?? "").split(",").filter((id) => id.size() > 0);
			const changes = this.consumeGlobalCashChanges(userIds);

			return this.ok({
				status: "OK",
				changes,
			});
		}

		if (method === "POST" && path === "/logging/network") {
			return this.ok({ status: "OK" });
		}

		if (method === "GET" && path === "/leaderboard") {
			return this.ok(this.getLeaderboardPayload());
		}

		if (method === "GET" && path === "/statistics/minigames") {
			return this.ok(this.getMinigameStatsPayload());
		}

		if (method === "GET" && path === "/debug/datastore-telemetry") {
			return this.ok({
				status: "OK",
				telemetry: this.getDataStoreTelemetrySnapshot(),
			});
		}

		if (method === "GET" && path === "/marketplace/items") {
			if (query.monitoring !== "true") {
				this.ensureActivePlayersLoaded();
			}

			if (query.monitoring === "true") {
				return this.ok({
					status: "OK",
					data: this.getMonitoredItemUpdates(),
				});
			}

			const allItems = this.getAllItems();
			this.primeMonitoredItemSignatures(allItems);

			return this.ok({
				status: "OK",
				data: allItems,
			});
		}

		if (method === "GET" && path === "/items/find_items_in_range") {
			const userId = query.user_id;
			if (!userId) return this.fail(400, { success: false, picks: {} });
			const minValue = this.toNumber(query.minValue, 0);
			const maxValue = this.toNumber(query.maxValue, 0);
			const minItems = math.max(1, math.floor(this.toNumber(query.minItems, 1)));
			const maxItems = math.max(minItems, math.floor(this.toNumber(query.maxItems, minItems)));
			return this.ok(this.findItemsInRange(userId, minValue, maxValue, minItems, maxItems));
		}

		if (method === "GET" && path === "/cases") {
			return this.ok({
				status: "OK",
				data: this.getAllCases(),
			});
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "cases" && segments[2] === "open") {
			const caseId = segments[3];
			const payload = (body as { user_id?: string; lucky?: boolean }) ?? {};
			const userId = payload.user_id ?? "";
			return this.openCase(userId, caseId, payload.lucky === true);
		}

		if (method === "GET" && (path === "/coinflips" || path === "/coinflip" || path === "/coinflip/")) {
			return this.ok({
				status: "OK",
				coinflips: this.getCoinflips(),
			});
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "coinflip" && segments[2] === "create") {
			const serverId = segments[3];
			const payload =
				(body as {
					user_id?: number;
					items?: string[];
					item_counts?: Record<string, number>;
					coin?: 1 | 2;
					type?: "server" | "global" | "friends";
				}) ?? {};

			return this.createCoinflip(
				tostring(payload.user_id ?? 0),
				payload.items ?? [],
				this.normalizeRequestedItemCounts(payload.item_counts),
				serverId,
				payload.coin ?? 1,
				payload.type ?? "global",
			);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "coinflip" && segments[2] === "cancel") {
			return this.cancelCoinflip(segments[3]);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "coinflip" && segments[2] === "join") {
			const payload =
				(body as {
					user_id?: number;
					items?: string[];
					item_counts?: Record<string, number>;
				}) ?? {};
			return this.joinCoinflip(
				segments[3],
				tostring(payload.user_id ?? 0),
				payload.items ?? [],
				this.normalizeRequestedItemCounts(payload.item_counts),
			);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "coinflip" && segments[2] === "call-bot") {
			const payload =
				(body as {
					user_id?: number;
				}) ?? {};
			return this.callBotCoinflip(segments[3], tostring(payload.user_id ?? 0));
		}

		if (method === "GET" && path === "/casebattles") {
			return this.ok({
				status: "OK",
				casebattles: this.getCaseBattles(),
			});
		}

		if (method === "GET" && path === "/casebattles/cases") {
			return this.ok({
				status: "OK",
				data: this.caseBattleCases,
			});
		}

		if (method === "POST" && path === "/casebattles/create") {
			const payload =
				(body as {
					user_id?: number;
					client_seed?: string;
					cases?: string[];
					mode?: CaseBattleData["mode"];
					team_mode?: CaseBattleData["team_mode"];
					fast_mode?: boolean;
					crazy?: boolean;
					server_id?: string;
				}) ?? {};
			return this.createCaseBattle(payload);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "casebattles" && segments[2] === "join") {
			const payload =
				(body as {
					user_id?: number;
					position?: number;
					client_seed?: string;
				}) ?? {};
			return this.joinCaseBattle(segments[3], payload);
		}

		if (method === "GET" && path === "/jackpot/pots") {
			return this.ok({
				status: "OK",
				pots: this.getJackpots(),
			});
		}

		if (method === "POST" && path === "/jackpot/create") {
			const payload =
				(body as {
					creator?: number;
					server_id?: string;
					value_cap?: unknown;
					value_floor?: number;
					max_players?: number;
					starting_after?: number;
				}) ?? {};
			return this.createJackpot(payload);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "jackpot" && segments[2] === "join") {
			const payload =
				(body as {
					user_id?: number;
					items?: string[];
					item_counts?: Record<string, number>;
					client_seed?: string;
				}) ?? {};
			return this.joinJackpot(segments[3], {
				...payload,
				item_counts: this.normalizeRequestedItemCounts(payload.item_counts),
			});
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "jackpot" && segments[2] === "leave") {
			const payload = (body as { user_id?: number }) ?? {};
			return this.leaveJackpot(segments[3], tostring(payload.user_id ?? 0));
		}

		if (method === "GET" && segments.size() === 3 && segments[1] === "trades") {
			return this.ok({
				status: "OK",
				trades: this.getTradesForUsers(segments[2]),
			});
		}

		if (method === "POST" && path === "/trades/create") {
			const payload =
				(body as {
					initiator_id?: string;
					receiver_id?: string;
					initiator_items?: string[];
					receiver_items?: string[];
				}) ?? {};
			return this.createTrade(payload);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "trades" && segments[3] === "accept") {
			return this.acceptTrade(this.toNumber(segments[2], -1));
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "trades" && segments[3] === "cancel") {
			return this.cancelTrade(this.toNumber(segments[2], -1));
		}

		if (method === "POST" && path === "/users/update") {
			const payload = (body as Array<Record<string, unknown>>) ?? [];
			payload.forEach((entry) => this.updateUserSnapshot(entry));
			return this.ok({ status: "OK" });
		}

		if (method === "POST" && segments.size() === 3 && segments[1] === "users") {
			const userId = segments[2];
			const payload =
				(body as {
					name?: string;
					display_name?: string;
					country?: string;
				}) ?? {};
			return this.registerUser(userId, payload);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "users" && segments[3] === "add-cash") {
			const userId = segments[2];
			const maybeBody = body as { amount?: number | string };
			const rawAmount = maybeBody?.amount ?? headers?.amount;
			const amount = this.toNumber(rawAmount, 0);
			this.queueCashChange(userId, amount);
			return this.ok({ status: "OK" });
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "users" && segments[3] === "remove-cash") {
			const userId = segments[2];
			const maybeBody = body as { amount?: number | string };
			const rawAmount = maybeBody?.amount ?? headers?.amount;
			const amount = math.abs(this.toNumber(rawAmount, 0));
			if (amount <= 0) return this.fail(400, { status: "error", error: "Invalid amount" });
			this.queueCashChange(userId, -amount);
			return this.ok({ status: "OK" });
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "users" && segments[3] === "remove-items") {
			const userId = segments[2];
			const payload =
				(body as { item_id?: string; amount?: number | string; item_counts?: Record<string, number> }) ?? {};
			const itemCounts = this.normalizeRequestedItemCounts(payload.item_counts ?? {});
			const itemId = tostring(payload.item_id ?? "");
			const amount = math.max(0, math.floor(this.toNumber(payload.amount, 0)));
			if (itemId.size() > 0 && amount > 0) {
				itemCounts[itemId] = (itemCounts[itemId] ?? 0) + amount;
			}

			if (next(itemCounts)[0] === undefined) {
				return this.fail(400, { status: "error", error: "No items requested" });
			}

			const taken = this.takeItemsByItemCounts(userId, itemCounts);
			if (!taken) {
				return this.fail(400, {
					status: "error",
					error: this.getInventorySelectionFailureMessageByItemCounts(userId, itemCounts),
				});
			}

			return this.ok({ status: "OK", removed: taken.size() });
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "users" && segments[3] === "wipe-profile") {
			const userId = segments[2];
			return this.wipeUserProfile(userId);
		}

		if (method === "GET" && segments.size() === 4 && segments[1] === "users" && segments[3] === "inventory") {
			const userId = segments[2];
			const inventory = this.getUserInventory(userId);
			return this.ok({
				status: "OK",
				inventory,
			});
		}

		if (method === "GET" && segments.size() === 4 && segments[1] === "users" && segments[3] === "active") {
			const userId = segments[2];
			return this.ok({
				status: "OK",
				active: this.isUserActiveInGame(userId),
			});
		}

		if (method === "GET" && segments.size() === 3 && segments[1] === "users") {
			return this.getUserInformation(segments[2]);
		}

		if (method === "GET" && segments.size() >= 3 && segments[1] === "search" && segments[2] === "users") {
			return this.searchUsers(query);
		}

		if (method === "POST" && path === "/items/add") {
			const payload =
				(body as {
					user_id?: string;
					item_id?: string;
				}) ?? {};
			return this.addItem(payload.user_id ?? "", payload.item_id ?? "");
		}

		if (method === "GET" && path === "/marketplace/items/all/listings") {
			return this.ok({
				status: "OK",
				listings: this.getAllListings(),
			});
		}

		if (method === "GET" && path === "/marketplace/listings") {
			return this.ok({
				status: "OK",
				listings: this.getAllListings(),
			});
		}

		if (method === "GET" && segments.size() === 4 && segments[1] === "marketplace" && segments[2] === "items") {
			this.ensureActivePlayersLoaded();
			const item = this.getItemSnapshot(segments[3]);
			if (!item) return this.fail(404, { status: "error", error: "Item not found" });
			return this.ok({ status: "OK", data: item });
		}

		if (
			method === "GET" &&
			segments.size() === 5 &&
			segments[1] === "marketplace" &&
			segments[2] === "items" &&
			segments[4] === "listings"
		) {
			const itemId = segments[3];
			return this.ok({
				status: "OK",
				listings: this.getAllListings().filter((listing) => listing.item_id === itemId),
			});
		}

		if (method === "GET" && segments.size() === 4 && segments[1] === "marketplace" && segments[2] === "listings") {
			const itemId = segments[3];
			return this.ok({
				status: "OK",
				listings: this.getAllListings().filter((listing) => listing.item_id === itemId),
			});
		}

		if (
			method === "POST" &&
			segments.size() === 5 &&
			segments[1] === "marketplace" &&
			segments[2] === "copies" &&
			segments[4] === "list"
		) {
			const uaid = segments[3];
			const payload = (body as { price?: number }) ?? {};
			return this.listItem(uaid, payload.price);
		}

		if (method === "POST" && segments.size() === 4 && segments[1] === "marketplace" && segments[2] === "listings") {
			const uaid = segments[3];
			const payload = (body as { price?: number }) ?? {};
			return this.listItem(uaid, payload.price);
		}

		if (
			method === "POST" &&
			segments.size() === 5 &&
			segments[1] === "marketplace" &&
			segments[2] === "copies" &&
			segments[4] === "buy"
		) {
			const uaid = segments[3];
			const payload = (body as { buyer_id?: string }) ?? {};
			return this.buyItem(uaid, payload.buyer_id ?? "");
		}

		return this.fail(404, { status: "error", error: `Unknown local route: ${method} ${path}` });
	}

	private seedItems() {
		const now = this.nowIso();
		const seed: Array<[string, string, number, string, string, string]> = [
			["starter_cap", "Starter Cap", 500, "#9aa6b2", "1028606", "1028606"],
			["lucky_shades", "Lucky Shades", 1200, "#3b82f6", "1272715", "1272715"],
			["arcane_band", "Arcane Band", 2400, "#6366f1", "60115635", "60115635"],
			["neon_chain", "Neon Chain", 4500, "#14b8a6", "46357082", "46357082"],
			["rogue_mask", "Rogue Mask", 8200, "#ef4444", "1365767", "1365767"],
			["royal_crown", "Royal Crown", 18000, "#f59e0b", "68258723", "68258723"],
			["lava_horns", "Lava Horns", 42000, "#dc2626", "63043890", "63043890"],
			["frost_blade", "Frost Blade", 76000, "#0ea5e9", "48545806", "48545806"],
			["void_wings", "Void Wings", 140000, "#111827", "31101391", "31101391"],
			["storm_halo", "Storm Halo", 260000, "#22c55e", "9910070", "9910070"],
			["celestial_orb", "Celestial Orb", 450000, "#8b5cf6", "17449820", "17449820"],
			["mythic_dragon", "Mythic Dragon", 1000000, "#f97316", "21070012", "21070012"],
		];

		const rolimonsItems = this.loadRolimonsCatalogCache();
		const curatedAssetIds = new Set<string>();

		seed.forEach(([id, fallbackName, value, color, fallbackAssetId, rolimonsAssetId]) => {
			const rolimonsRow = rolimonsItems?.[rolimonsAssetId];
			const name = rolimonsRow?.name && rolimonsRow.name.size() > 0 ? rolimonsRow.name : fallbackName;
			const assetId = rolimonsRow ? rolimonsAssetId : fallbackAssetId;
			const resolvedValue = this.resolveRolimonsValue(rolimonsRow, value);
			const resolvedAveragePrice = this.resolveRolimonsAveragePrice(rolimonsRow, resolvedValue);
			curatedAssetIds.add(assetId);

			this.items.set(id, {
				id,
				asset_id: assetId,
				name,
				creator: "Roblox",
				description: `${name} limited collectible`,
				average_price: resolvedAveragePrice,
				total_unboxed: 0,
				maximum_copies: 0,
				value: resolvedValue,
				created_at: now,
				updated_at: now,
				color,
				category: "Accessories",
			});
		});

		if (!rolimonsItems) {
			warn("[LocalBackend] Rolimons catalog not cached at startup; using curated catalog only.");
			return;
		}

		warn("[LocalBackend] Loaded Rolimons catalog from cache; refreshing in background.");

		const added = this.mergeRolimonsCatalogItems(rolimonsItems, now, curatedAssetIds);
		const updated = this.applyRolimonsValuesToExistingItems(rolimonsItems, now);
		this.rolimonsCatalogLoaded = true;
		if (added > 0) {
			warn(`[LocalBackend] Loaded ${added} Rolimons items into local marketplace catalog.`);
		}

		if (updated > 0 && this.cases.size() > 0) {
			this.refreshCaseOddsAndRanges();
		}
	}

	private resolveRolimonsValue(rolimonsRow: RolimonsItemMeta | undefined, fallbackValue: number) {
		const fallback = math.max(1, math.floor(fallbackValue));
		if (!rolimonsRow) return fallback;

		const normalizedValue = math.floor(rolimonsRow.value);
		if (normalizedValue > 0) return normalizedValue;

		const normalizedRap = math.floor(rolimonsRow.rap);
		if (normalizedRap > 0) return normalizedRap;

		return fallback;
	}

	private resolveRolimonsAveragePrice(rolimonsRow: RolimonsItemMeta | undefined, fallbackValue: number) {
		if (!rolimonsRow) return math.max(1, math.floor(fallbackValue));

		const normalizedRap = math.floor(rolimonsRow.rap);
		if (normalizedRap > 0) return normalizedRap;

		const normalizedValue = math.floor(rolimonsRow.value);
		if (normalizedValue > 0) return normalizedValue;

		return math.max(1, math.floor(fallbackValue));
	}

	private applyRolimonsValuesToExistingItems(rolimonsItems: Record<string, RolimonsItemMeta>, now: string) {
		let updatedCount = 0;

		for (const [, item] of this.items) {
			const rolimonsRow = rolimonsItems[item.asset_id];
			if (!rolimonsRow) continue;

			const nextName = rolimonsRow.name.size() > 0 ? rolimonsRow.name : item.name;
			const nextValue = this.resolveRolimonsValue(rolimonsRow, item.value);
			const nextAveragePrice = this.resolveRolimonsAveragePrice(rolimonsRow, nextValue);

			const changed =
				item.name !== nextName || item.value !== nextValue || item.average_price !== nextAveragePrice;
			if (!changed) continue;

			item.name = nextName;
			item.description = `${nextName} limited collectible`;
			item.value = nextValue;
			item.average_price = nextAveragePrice;
			item.updated_at = now;
			updatedCount += 1;
		}

		return updatedCount;
	}

	private mergeRolimonsCatalogItems(
		rolimonsItems: Record<string, RolimonsItemMeta>,
		now: string,
		skipAssetIds?: Set<string>,
	): number {
		const existingAssetIds = new Set<string>();
		for (const [, item] of this.items) {
			existingAssetIds.add(item.asset_id);
		}

		let added = 0;
		for (const [assetId, row] of pairs(rolimonsItems)) {
			const normalizedAssetId = tostring(assetId);
			if (skipAssetIds && skipAssetIds.has(normalizedAssetId)) continue;
			if (existingAssetIds.has(normalizedAssetId)) continue;

			const name = row.name.size() > 0 ? row.name : `Limited ${normalizedAssetId}`;
			const value = this.resolveRolimonsValue(row, 1000);
			const averagePrice = this.resolveRolimonsAveragePrice(row, value);
			const id = `limited_${normalizedAssetId}`;

			this.items.set(id, {
				id,
				asset_id: normalizedAssetId,
				name,
				creator: "Roblox",
				description: `${name} limited collectible`,
				average_price: averagePrice,
				total_unboxed: 0,
				maximum_copies: 0,
				value,
				created_at: now,
				updated_at: now,
				color: "#9ca3af",
				category: "Accessories",
			});

			existingAssetIds.add(normalizedAssetId);
			added += 1;
		}

		return added;
	}

	private decodeRolimonsItems(rawPayload: string): Record<string, RolimonsItemMeta> | undefined {
		const [parseSuccess, decodedPayload] = pcall(() => HttpService.JSONDecode(rawPayload)) as LuaTuple<
			[boolean, unknown]
		>;
		if (!parseSuccess || !typeIs(decodedPayload, "table")) return;

		const payload = decodedPayload as Partial<RolimonsItemDetailsResponse>;
		if (!payload.success || !payload.items) return;

		const normalizedItems = {} as Record<string, RolimonsItemMeta>;
		for (const [assetId, row] of pairs(payload.items)) {
			if (!typeIs(row, "table")) continue;

			const rowName = row[0];
			const name = typeIs(rowName, "string") && rowName.size() > 0 ? rowName : `Limited ${assetId}`;
			normalizedItems[tostring(assetId)] = {
				name,
				rap: typeIs(row[2], "number") ? row[2] : 0,
				value: typeIs(row[3], "number") ? row[3] : 0,
			};
		}

		if (next(normalizedItems)[0] === undefined) return;
		return normalizedItems;
	}

	private loadRolimonsCatalogCache(): Record<string, RolimonsItemMeta> | undefined {
		const [success, rawState] = this.runDataStoreWithRetry<unknown>(
			"rolimons_catalog_cache_get",
			() => this.persistenceStore.GetAsync(this.ROLIMONS_CACHE_KEY),
			2,
		);
		if (!success || !typeIs(rawState, "table")) return;

		const cacheState = rawState as RolimonsCatalogCacheState;
		if (!cacheState.items || !typeIs(cacheState.items, "table")) return;

		const restoredItems = {} as Record<string, RolimonsItemMeta>;
		for (const [assetId, row] of pairs(cacheState.items)) {
			if (!typeIs(row, "table")) continue;

			const name = typeIs(row[0], "string") && row[0].size() > 0 ? row[0] : `Limited ${assetId}`;
			const rap = typeIs(row[1], "number") ? row[1] : 0;
			const value = typeIs(row[2], "number") ? row[2] : 0;
			restoredItems[tostring(assetId)] = { name, rap, value };
		}

		if (next(restoredItems)[0] === undefined) return;
		return restoredItems;
	}

	private saveRolimonsCatalogCache(rolimonsItems: Record<string, RolimonsItemMeta>) {
		const compactItems = {} as Record<string, [string, number, number]>;
		for (const [assetId, row] of pairs(rolimonsItems)) {
			compactItems[tostring(assetId)] = [row.name, row.rap, row.value];
		}

		const cachePayload: RolimonsCatalogCacheState = {
			updated_at: os.time(),
			items: compactItems,
		};

		const [success] = this.runDataStoreWithRetry<unknown>(
			"rolimons_catalog_cache_set",
			() => this.persistenceStore.SetAsync(this.ROLIMONS_CACHE_KEY, cachePayload),
			2,
		);
		if (!success) {
			warn("[LocalBackend] Failed to persist Rolimons catalog cache.");
		}
	}

	private tryGetRolimonsItems(): Record<string, RolimonsItemMeta> | undefined {
		const endpoint = "https://www.rolimons.com/itemapi/itemdetails";
		let lastRequestError: unknown;

		for (let attempt = 1; attempt <= 3; attempt++) {
			const [requestSuccess, rawPayload] = pcall(() => HttpService.GetAsync(endpoint)) as LuaTuple<
				[boolean, unknown]
			>;

			if (requestSuccess && typeIs(rawPayload, "string")) {
				const decodedItems = this.decodeRolimonsItems(rawPayload);
				if (decodedItems) {
					task.spawn(() => this.saveRolimonsCatalogCache(decodedItems));
					return decodedItems;
				}
			} else {
				lastRequestError = rawPayload;
			}

			if (attempt < 3) task.wait(0.15 * attempt);
		}

		const cachedItems = this.loadRolimonsCatalogCache();
		if (cachedItems) {
			warn("[LocalBackend] Rolimons API unavailable; loaded catalog from DataStore cache.");
			return cachedItems;
		}

		if (lastRequestError !== undefined) {
			warn("[LocalBackend] Rolimons API request failed:", lastRequestError);
		}

		return;
	}

	private tryHydrateRolimonsCatalog() {
		const rolimonsItems = this.tryGetRolimonsItems();
		if (!rolimonsItems) return;

		const now = this.nowIso();
		const updated = this.applyRolimonsValuesToExistingItems(rolimonsItems, now);
		const added = this.mergeRolimonsCatalogItems(rolimonsItems, now);
		if (updated > 0 || added > 0) {
			this.refreshCaseOddsAndRanges();
		}

		this.rolimonsCatalogLoaded = true;
		if (added > 0) {
			warn(`[LocalBackend] Hydrated ${added} Rolimons items after startup.`);
		}
	}

	private seedCases() {
		const tomorrow = DateTime.fromUnixTimestamp(os.time() + 24 * 60 * 60).ToIsoDate();
		const previousCases = new Map<string, Case>();
		for (const [caseId, caseData] of this.cases) {
			previousCases.set(caseId, caseData);
		}

		const definitions: Array<{
			id: string;
			price: number;
			available_for_gems: boolean;
			dev_product: string;
			image: string;
			color: string;
			itemIds: string[];
		}> = [
			{
				id: "starter",
				price: 1500,
				available_for_gems: true,
				dev_product: "3569876418",
				image: "rbxassetid://136984828704039",
				color: "#22c55e",
				itemIds: ["starter_cap", "lucky_shades", "arcane_band", "neon_chain"],
			},
			{
				id: "street",
				price: 3200,
				available_for_gems: true,
				dev_product: "3569882473",
				image: "rbxassetid://140669583639572",
				color: "#10b981",
				itemIds: ["starter_cap", "lucky_shades", "arcane_band", "neon_chain"],
			},
			{
				id: "premium",
				price: 18000,
				available_for_gems: true,
				dev_product: "3569876512",
				image: "rbxassetid://109732800962295",
				color: "#3b82f6",
				itemIds: ["rogue_mask", "royal_crown", "lava_horns", "frost_blade"],
			},
			{
				id: "royal",
				price: 42000,
				available_for_gems: true,
				dev_product: "3569882751",
				image: "rbxassetid://77517248563684",
				color: "#60a5fa",
				itemIds: ["royal_crown", "lava_horns", "frost_blade", "void_wings"],
			},
			{
				id: "legend",
				price: 95000,
				available_for_gems: false,
				dev_product: "3569876626",
				image: "rbxassetid://78562763263294",
				color: "#f97316",
				itemIds: ["lava_horns", "frost_blade", "void_wings", "storm_halo"],
			},
			{
				id: "mythic",
				price: 260000,
				available_for_gems: false,
				dev_product: "3569882999",
				image: "rbxassetid://88579616548700",
				color: "#f43f5e",
				itemIds: ["void_wings", "storm_halo", "celestial_orb", "mythic_dragon"],
			},
		];

		this.cases.clear();

		definitions.forEach((definition) => {
			const previousCaseData = previousCases.get(definition.id);
			const previousClaimedByItem = new Map<string, number>();
			previousCaseData?.items.forEach((entry) => {
				previousClaimedByItem.set(entry.id, entry.claimed);
			});

			const oddsData = this.calculateCaseOddsForValues(definition.id, definition.itemIds);
			if (oddsData.items.size() === 0) return;

			this.cases.set(definition.id, {
				id: definition.id,
				price: oddsData.suggestedPrice,
				items: oddsData.items.map((entry) => ({
					id: entry.id,
					chance: entry.chance,
					claimed: previousClaimedByItem.get(entry.id) ?? 0,
				})),
				next_rotation: tomorrow,
				ui_data: {
					primary: this.normalizeCaseBattleImage(definition.image),
					colour: definition.color,
				},
				opened_count: previousCaseData?.opened_count ?? 0,
				min_value: oddsData.minValue,
				max_value: oddsData.maxValue,
				available_for_gems: definition.available_for_gems,
				dev_product: definition.dev_product,
			});
		});

		this.enforceCasePriceOrdering();
	}

	private getCaseHouseEdge(caseId: string) {
		switch (caseId) {
			case "starter":
				return 0.06;
			case "street":
				return 0.07;
			case "premium":
				return 0.08;
			case "royal":
				return 0.09;
			case "legend":
				return 0.1;
			case "mythic":
				return 0.11;
			default:
				return 0.08;
		}
	}

	private enforceCasePriceOrdering() {
		const order = ["starter", "street", "premium", "royal", "legend", "mythic"];
		let lastPrice = 0;
		for (const caseId of order) {
			const caseData = this.cases.get(caseId);
			if (!caseData) continue;
			const minGap = lastPrice > 0 ? math.max(1, math.floor(lastPrice * 0.02)) : 0;
			const minPrice = lastPrice + minGap;
			if (caseData.price < minPrice) {
				caseData.price = minPrice;
			}
			lastPrice = caseData.price;
		}
	}

	private calculateCaseOddsForValues(caseId: string, itemIds: string[]) {
		const entries = new Array<{ id: string; value: number }>();
		itemIds.forEach((itemId) => {
			const itemData = this.items.get(itemId);
			if (!itemData) return;
			entries.push({
				id: itemId,
				value: math.max(1, math.floor(itemData.value)),
			});
		});

		if (entries.size() === 0) {
			return {
				items: [] as Array<{ id: string; chance: number }>,
				minValue: 0,
				maxValue: 0,
				expectedValue: 0,
				suggestedPrice: 0,
			};
		}

		const minValue = entries.reduce((min, entry) => math.min(min, entry.value), entries[0].value);
		const maxValue = entries.reduce((max, entry) => math.max(max, entry.value), entries[0].value);

		entries.sort((a, b) => a.value < b.value);

		const baseTierWeights = [79.92, 15.98, 3.2, 0.64, 0.26];
		const tierItemShares = [0.5, 0.25, 0.15, 0.07, 0.03];
		const tierCount = math.min(entries.size(), baseTierWeights.size());
		const shareSlice = new Array<number>();
		for (let i = 0; i < tierCount; i++) {
			shareSlice.push(tierItemShares[i]);
		}
		let shareSum = 0;
		for (const share of shareSlice) {
			shareSum += share;
		}
		const counts = new Array<number>();
		for (const share of shareSlice) {
			counts.push(math.max(1, math.floor((entries.size() * (share / shareSum)) as number)));
		}
		let countSum = 0;
		for (const count of counts) {
			countSum += count;
		}
		for (let i = 0; i < counts.size() && countSum > entries.size(); i++) {
			while (counts[i] > 1 && countSum > entries.size()) {
				counts[i] -= 1;
				countSum -= 1;
			}
		}
		while (countSum < entries.size()) {
			counts[0] += 1;
			countSum += 1;
		}

		const tiers = new Array<Array<{ id: string; value: number }>>();
		let cursor = 0;
		for (let i = 0; i < tierCount; i++) {
			const take = math.min(counts[i], entries.size() - cursor);
			const tierItems = new Array<{ id: string; value: number }>();
			for (let j = 0; j < take; j++) {
				tierItems.push(entries[cursor + j]);
			}
			tiers[i] = tierItems;
			cursor += take;
		}
		if (cursor < entries.size()) {
			const lastTierIndex = math.max(0, tiers.size() - 1);
			if (!tiers[lastTierIndex]) tiers[lastTierIndex] = [];
			for (let i = cursor; i < entries.size(); i++) {
				tiers[lastTierIndex].push(entries[i]);
			}
		}

		const baseWeights = new Array<number>();
		for (let i = 0; i < tierCount; i++) {
			baseWeights.push(baseTierWeights[i]);
		}

		let weightSum = 0;
		for (const weight of baseWeights) {
			weightSum += weight;
		}

		if (weightSum <= 0) {
			const evenChance = 100 / entries.size();
			const expectedValue = minValue;
			const suggestedPrice = math.max(1, math.floor(expectedValue / (1 - this.getCaseHouseEdge(caseId))));
			return {
				items: entries.map((entry) => ({ id: entry.id, chance: evenChance })),
				minValue,
				maxValue,
				expectedValue,
				suggestedPrice,
			};
		}

		const tierChances = new Array<number>();
		for (const weight of baseWeights) {
			tierChances.push((weight / weightSum) * 100);
		}
		const rawItems = new Array<{ id: string; chance: number }>();
		for (let i = 0; i < tierCount; i++) {
			const tierItems = tiers[i];
			if (!tierItems || tierItems.size() === 0) continue;
			const perItemChance = tierChances[i] / tierItems.size();
			tierItems.forEach((entry) => rawItems.push({ id: entry.id, chance: perItemChance }));
		}

		let totalChance = 0;
		for (const entry of rawItems) {
			totalChance += entry.chance;
		}
		if (totalChance <= 0) {
			const evenChance = 100 / entries.size();
			const expectedValue = minValue;
			const suggestedPrice = math.max(1, math.floor(expectedValue / (1 - this.getCaseHouseEdge(caseId))));
			return {
				items: entries.map((entry) => ({ id: entry.id, chance: evenChance })),
				minValue,
				maxValue,
				expectedValue,
				suggestedPrice,
			};
		}

		const normalizedItems = new Array<{ id: string; chance: number }>();
		let chanceUsed = 0;
		rawItems.forEach((entry, index) => {
			const rawChance = (entry.chance / totalChance) * 100;
			const isLast = index === rawItems.size() - 1;
			const chance = isLast ? math.max(0, 100 - chanceUsed) : rawChance;
			chanceUsed += chance;

			normalizedItems.push({
				id: entry.id,
				chance,
			});
		});

		let expectedValue = 0;
		for (let i = 0; i < tierCount; i++) {
			const tierItems = tiers[i];
			if (!tierItems || tierItems.size() === 0) continue;
			const perItemChance = tierChances[i] / tierItems.size();
			for (const entry of tierItems) {
				expectedValue += entry.value * (perItemChance / 100);
			}
		}

		const suggestedPrice = math.max(1, math.floor(expectedValue / (1 - this.getCaseHouseEdge(caseId))));

		return {
			items: normalizedItems,
			minValue,
			maxValue,
			expectedValue,
			suggestedPrice,
		};
	}

	private refreshCaseOddsAndRanges() {
		for (const [caseId, caseData] of this.cases) {
			const previousClaimedByItem = new Map<string, number>();
			caseData.items.forEach((entry) => {
				previousClaimedByItem.set(entry.id, entry.claimed);
			});

			const itemIds = caseData.items.map((entry) => entry.id);
			const oddsData = this.calculateCaseOddsForValues(caseId, itemIds);
			if (oddsData.items.size() === 0) continue;

			caseData.items = oddsData.items.map((entry) => ({
				id: entry.id,
				chance: entry.chance,
				claimed: previousClaimedByItem.get(entry.id) ?? 0,
			}));
			caseData.min_value = oddsData.minValue;
			caseData.max_value = oddsData.maxValue;
			caseData.price = oddsData.suggestedPrice;
		}
		this.enforceCasePriceOrdering();

		this.seedCaseBattleCases();
	}

	private seedCaseBattleCases() {
		this.caseBattleCases.clear();
		this.caseBattleItemIds.clear();
		let itemNumericId = 1;
		const dicebloxCases = [
			{
				id: "cheap-box",
				name: "Cheap Box",
				slug: "cheap-box",
				image: "106910674225786",
				price: 62,
				total_opened: 185445,
				created_at: "2023-08-14T05:09:04.391Z",
				items: [
					{
						asset_id: "3798243238",
						asset_type: "HAT",
						name: "Party Fedora ",
						value: 101,
						image: "",
						min_ticket: 0,
						max_ticket: 9999,
					},
					{
						asset_id: "108150260",
						asset_type: "HAT",
						name: "Tiger Egg",
						value: 98,
						image: "",
						min_ticket: 10000,
						max_ticket: 29999,
					},
					{
						asset_id: "4771699155",
						asset_type: "HAT",
						name: "Egg of Hidden Treasures",
						value: 67,
						image: "",
						min_ticket: 30000,
						max_ticket: 49999,
					},
					{
						asset_id: "3798239844",
						asset_type: "ACCESSORY",
						name: " Frosting Flyers",
						value: 34,
						image: "",
						min_ticket: 50000,
						max_ticket: 74999,
					},
					{
						asset_id: "3581868178",
						asset_type: "ACCESSORY",
						name: "Goldrow",
						value: 15,
						image: "",
						min_ticket: 75000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "zoo-case",
				name: "Zoo Case",
				slug: "zoo-case",
				image: "137664246075209",
				price: 323,
				total_opened: 601882,
				created_at: "2023-07-15T04:12:37.890Z",
				items: [
					{
						asset_id: "258183582",
						asset_type: "HAT",
						name: "When Animals Attack: Tiger Tussle",
						value: 6000,
						image: "",
						min_ticket: 0,
						max_ticket: 1499,
					},
					{
						asset_id: "489170175",
						asset_type: "HAT",
						name: "Neon Bombastic Animal Hoodie",
						value: 1200,
						image: "",
						min_ticket: 1500,
						max_ticket: 4999,
					},
					{
						asset_id: "928911381",
						asset_type: "HAT",
						name: "Viridian Animal Hoodie",
						value: 550,
						image: "",
						min_ticket: 5000,
						max_ticket: 19999,
					},
					{
						asset_id: "153581866",
						asset_type: "HAT",
						name: "Rabid Egg",
						value: 210,
						image: "",
						min_ticket: 20000,
						max_ticket: 39999,
					},
					{
						asset_id: "108150260",
						asset_type: "HAT",
						name: "Tiger Egg",
						value: 98,
						image: "",
						min_ticket: 40000,
						max_ticket: 69999,
					},
					{
						asset_id: "3581868178",
						asset_type: "ACCESSORY",
						name: "Goldrow",
						value: 15,
						image: "",
						min_ticket: 70000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "yellowmania",
				name: "Yellowmania",
				slug: "yellowmania",
				image: "127743821848767",
				price: 823,
				total_opened: 458205,
				created_at: "2023-07-15T04:12:37.860Z",
				items: [
					{
						asset_id: "323191430",
						asset_type: "FACE",
						name: "Daring Blonde Beard Face",
						value: 4800,
						image: "",
						min_ticket: 0,
						max_ticket: 1499,
					},
					{
						asset_id: "93723594",
						asset_type: "HAT",
						name: "Yellow Bucket Hat",
						value: 4500,
						image: "",
						min_ticket: 1500,
						max_ticket: 4999,
					},
					{
						asset_id: "1048037",
						asset_type: "HAT",
						name: "Bighead",
						value: 2800,
						image: "",
						min_ticket: 5000,
						max_ticket: 14999,
					},
					{
						asset_id: "10467322128",
						asset_type: "HAT",
						name: "Gold Headphones",
						value: 700,
						image: "",
						min_ticket: 15000,
						max_ticket: 24999,
					},
					{
						asset_id: "136217608",
						asset_type: "HAT",
						name: "Golden Pilgrim Hat",
						value: 492,
						image: "",
						min_ticket: 25000,
						max_ticket: 39999,
					},
					{
						asset_id: "3339364587",
						asset_type: "ACCESSORY",
						name: "Mid-Summer Lapel Pin",
						value: 260,
						image: "",
						min_ticket: 40000,
						max_ticket: 69999,
					},
					{
						asset_id: "3581868178",
						asset_type: "ACCESSORY",
						name: "Goldrow",
						value: 30,
						image: "",
						min_ticket: 70000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "50-50",
				name: "50/50",
				slug: "50-50",
				image: "128156851800240",
				price: 141,
				total_opened: 439962,
				created_at: "2023-07-15T04:12:34.709Z",
				items: [
					{
						asset_id: "2620478831",
						asset_type: "ACCESSORY",
						name: "Pizza Bandit",
						value: 238,
						image: "",
						min_ticket: 0,
						max_ticket: 49999,
					},
					{
						asset_id: "3581868178",
						asset_type: "ACCESSORY",
						name: "Goldrow",
						value: 15,
						image: "",
						min_ticket: 50000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "8-bit-case",
				name: "8-Bit Case",
				slug: "8-bit-case",
				image: "99991983806844",
				price: 1317,
				total_opened: 377037,
				created_at: "2024-08-14T06:15:37.173Z",
				items: [
					{
						asset_id: "383507353",
						asset_type: "HAT",
						name: "Gold 8-Bit Headphones",
						value: 15541,
						image: "",
						min_ticket: 0,
						max_ticket: 3499,
					},
					{
						asset_id: "10159600649",
						asset_type: "HAT",
						name: "8-Bit Royal Crown",
						value: 4360,
						image: "",
						min_ticket: 3500,
						max_ticket: 7499,
					},
					{
						asset_id: "121925071",
						asset_type: "HAT",
						name: "8-Bit Viking",
						value: 2345,
						image: "",
						min_ticket: 7500,
						max_ticket: 14999,
					},
					{
						asset_id: "507783603",
						asset_type: "HAT",
						name: "Blue 8-Bit Antlers",
						value: 1186,
						image: "",
						min_ticket: 15000,
						max_ticket: 19999,
					},
					{
						asset_id: "10159617728",
						asset_type: "ACCESSORY",
						name: "8-Bit Tabby Cat",
						value: 614,
						image: "",
						min_ticket: 20000,
						max_ticket: 34999,
					},
					{
						asset_id: "10159606132",
						asset_type: "HAT",
						name: "8-Bit Extra Life",
						value: 468,
						image: "",
						min_ticket: 35000,
						max_ticket: 54999,
					},
					{
						asset_id: "833773264",
						asset_type: "ACCESSORY",
						name: "Red 8-Bit Bow Tie",
						value: 103,
						image: "",
						min_ticket: 55000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "50-percent-legit",
				name: "50% Legit",
				slug: "50-percent-legit",
				image: "121966037685970",
				price: 2224,
				total_opened: 111860,
				created_at: "2024-08-14T06:15:37.173Z",
				items: [
					{
						asset_id: "19027209",
						asset_type: "HAT",
						name: "Perfectly Legitimate Business Hat",
						value: 3989,
						image: "",
						min_ticket: 0,
						max_ticket: 49999,
					},
					{
						asset_id: "12777646",
						asset_type: "FACE",
						name: "Blerg!",
						value: 20,
						image: "",
						min_ticket: 50000,
						max_ticket: 59999,
					},
					{
						asset_id: "22119034",
						asset_type: "FACE",
						name: "Square Eyes",
						value: 16,
						image: "",
						min_ticket: 60000,
						max_ticket: 69999,
					},
					{
						asset_id: "7074893",
						asset_type: "FACE",
						name: "Drool",
						value: 15,
						image: "",
						min_ticket: 70000,
						max_ticket: 79999,
					},
					{
						asset_id: "25321961",
						asset_type: "FACE",
						name: "Friendly Grin",
						value: 11,
						image: "",
						min_ticket: 80000,
						max_ticket: 89999,
					},
					{
						asset_id: "7075502",
						asset_type: "FACE",
						name: "Lazy Eye",
						value: 10,
						image: "",
						min_ticket: 90000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "headless-express",
				name: "Headless Express",
				slug: "headless-express",
				image: "95174026943271",
				price: 6395,
				total_opened: 85431,
				created_at: "2024-10-10T02:32:59.699Z",
				items: [
					{
						asset_id: "headless",
						asset_type: "GEAR",
						name: "Headless Horseman",
						value: 31000,
						image: "rbxthumb://type=BundleThumbnail&id=201&w=150&h=150",
						min_ticket: 0,
						max_ticket: 9999,
					},
					{
						asset_id: "95245137",
						asset_type: "ACCESSORY",
						name: "Pumpkin Headrow",
						value: 6698,
						image: "",
						min_ticket: 10000,
						max_ticket: 27999,
					},
					{
						asset_id: "37820239",
						asset_type: "ACCESSORY",
						name: "Pumpkin Necklace",
						value: 5371,
						image: "",
						min_ticket: 28000,
						max_ticket: 45999,
					},
					{
						asset_id: "313544522",
						asset_type: "HAT",
						name: "Mysterious Witch Pumpkin",
						value: 1420,
						image: "",
						min_ticket: 46000,
						max_ticket: 63999,
					},
					{
						asset_id: "16986805",
						asset_type: "GEAR",
						name: "Pumpkin Pi",
						value: 1120,
						image: "",
						min_ticket: 64000,
						max_ticket: 81999,
					},
					{
						asset_id: "94262384",
						asset_type: "HAT",
						name: "Candy Corn Knit",
						value: 143,
						image: "",
						min_ticket: 82000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "gaelic-luck",
				name: "Gaelic Luck",
				slug: "gaelic-luck",
				image: "96999318188771",
				price: 5051,
				total_opened: 88666,
				created_at: "2025-05-06T15:49:18.274Z",
				items: [
					{
						asset_id: "226189871",
						asset_type: "ACCESSORY",
						name: "St Patrick's Day Fairy",
						value: 50000,
						image: "",
						min_ticket: 0,
						max_ticket: 4999,
					},
					{
						asset_id: "45084008",
						asset_type: "FACE",
						name: "Angelic",
						value: 25000,
						image: "",
						min_ticket: 5000,
						max_ticket: 9999,
					},
					{
						asset_id: "48039287",
						asset_type: "HAT",
						name: "St Patrick's Fedora",
						value: 10000,
						image: "",
						min_ticket: 10000,
						max_ticket: 14999,
					},
					{
						asset_id: "48039333",
						asset_type: "HAT",
						name: "For the Ages: Saint Patrick",
						value: 800,
						image: "",
						min_ticket: 15000,
						max_ticket: 24999,
					},
					{
						asset_id: "149598968",
						asset_type: "HAT",
						name: "Skull Patrick",
						value: 500,
						image: "",
						min_ticket: 25000,
						max_ticket: 34999,
					},
					{
						asset_id: "227695091",
						asset_type: "HAT",
						name: "Gaelic Guardian",
						value: 100,
						image: "",
						min_ticket: 35000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "grim-or-pilgrim",
				name: "Grim or Pilgrim",
				slug: "grim-or-pilgrim",
				image: "120988455047608",
				price: 2444,
				total_opened: 82337,
				created_at: "2023-07-15T04:12:36.995Z",
				items: [
					{
						asset_id: "64559699",
						asset_type: "HAT",
						name: "Grim Glow",
						value: 48000,
						image: "",
						min_ticket: 0,
						max_ticket: 1499,
					},
					{
						asset_id: "107458531",
						asset_type: "GEAR",
						name: "Grim Axe",
						value: 11000,
						image: "",
						min_ticket: 1500,
						max_ticket: 4999,
					},
					{
						asset_id: "136172656",
						asset_type: "HAT",
						name: "Angry Pilgrim",
						value: 3000,
						image: "",
						min_ticket: 5000,
						max_ticket: 29999,
					},
					{
						asset_id: "136217608",
						asset_type: "HAT",
						name: "Golden Pilgrim Hat",
						value: 492,
						image: "",
						min_ticket: 30000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "horns",
				name: "Horns!",
				slug: "horns",
				image: "75059684181443",
				price: 7343,
				total_opened: 75417,
				created_at: "2023-07-15T04:12:37.062Z",
				items: [
					{
						asset_id: "628771505",
						asset_type: "HAT",
						name: "Black Iron Horns",
						value: 48595,
						image: "",
						min_ticket: 0,
						max_ticket: 4999,
					},
					{
						asset_id: "867827055",
						asset_type: "HAT",
						name: "8-Bit Dark Horns of Pwnage",
						value: 22088,
						image: "",
						min_ticket: 5000,
						max_ticket: 9999,
					},
					{
						asset_id: "280896465",
						asset_type: "HAT",
						name: "Horns of the Magmawrath",
						value: 9920,
						image: "",
						min_ticket: 10000,
						max_ticket: 34999,
					},
					{
						asset_id: "62152671",
						asset_type: "HAT",
						name: "Poison Horns",
						value: 2315,
						image: "",
						min_ticket: 35000,
						max_ticket: 44999,
					},
					{
						asset_id: "97926101",
						asset_type: "HAT",
						name: "Gigantohorns",
						value: 1579,
						image: "",
						min_ticket: 45000,
						max_ticket: 59999,
					},
					{
						asset_id: "1744233582",
						asset_type: "HAT",
						name: "Mid-Summer Horns",
						value: 532,
						image: "",
						min_ticket: 60000,
						max_ticket: 79999,
					},
					{
						asset_id: "1380773753",
						asset_type: "HAT",
						name: "Horns of Yesterday, Today",
						value: 100,
						image: "",
						min_ticket: 80000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "e-girl-heaven",
				name: "E-Girl Heaven",
				slug: "e-girl-heaven",
				image: "93588701621823",
				price: 12781,
				total_opened: 74979,
				created_at: "2024-06-30T19:30:14.434Z",
				items: [
					{
						asset_id: "1125510",
						asset_type: "HAT",
						name: "The Void Star",
						value: 1107343,
						image: "",
						min_ticket: 0,
						max_ticket: 249,
					},
					{
						asset_id: "74891470",
						asset_type: "HAT",
						name: "Frozen Horns of the Frigid Planes",
						value: 763534,
						image: "",
						min_ticket: 250,
						max_ticket: 499,
					},
					{
						asset_id: "439945661",
						asset_type: "HAT",
						name: "Silver King of the Night ",
						value: 296561,
						image: "",
						min_ticket: 500,
						max_ticket: 999,
					},
					{
						asset_id: "494291269",
						asset_type: "FACE",
						name: "Super Super Happy Face",
						value: 243220,
						image: "",
						min_ticket: 1000,
						max_ticket: 1499,
					},
					{
						asset_id: "387256603",
						asset_type: "FACE",
						name: "Silver Punk Face",
						value: 188980,
						image: "",
						min_ticket: 1500,
						max_ticket: 1999,
					},
					{
						asset_id: "628771505",
						asset_type: "HAT",
						name: "Black Iron Horns",
						value: 120832,
						image: "",
						min_ticket: 2000,
						max_ticket: 2999,
					},
					{
						asset_id: "6550129",
						asset_type: "HAT",
						name: "Scissors",
						value: 103133,
						image: "",
						min_ticket: 3000,
						max_ticket: 3999,
					},
					{
						asset_id: "292969932",
						asset_type: "GEAR",
						name: "From the Vault: Kawaii Cat ",
						value: 59133,
						image: "",
						min_ticket: 4000,
						max_ticket: 4999,
					},
					{
						asset_id: "12848902",
						asset_type: "GEAR",
						name: "Teddy Bloxpin",
						value: 100,
						image: "",
						min_ticket: 5000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "barbie-girl",
				name: "Barbie Girl",
				slug: "barbie-girl",
				image: "113022314542244",
				price: 26534,
				total_opened: 17309,
				created_at: "2025-03-18T23:21:30.703Z",
				items: [
					{
						asset_id: "334663683",
						asset_type: "HAT",
						name: "Pink Sparkle Time Fedora",
						value: 1042940,
						image: "",
						min_ticket: 0,
						max_ticket: 999,
					},
					{
						asset_id: "315549204",
						asset_type: "HAT",
						name: "WC Ultimates: Pink Diamond Distraction",
						value: 272835,
						image: "",
						min_ticket: 1000,
						max_ticket: 2999,
					},
					{
						asset_id: "553971558",
						asset_type: "HAT",
						name: "Pink Queen of the Night",
						value: 100932,
						image: "",
						min_ticket: 3000,
						max_ticket: 7999,
					},
					{
						asset_id: "376806474",
						asset_type: "HAT",
						name: "Neon Pink Top Hat",
						value: 22493,
						image: "",
						min_ticket: 8000,
						max_ticket: 12999,
					},
					{
						asset_id: "435115571",
						asset_type: "HAT",
						name: "Ultimate Pink Victory",
						value: 18348,
						image: "",
						min_ticket: 13000,
						max_ticket: 19999,
					},
					{
						asset_id: "24485058",
						asset_type: "HAT",
						name: "Brighteyes' Pink Egg of Anticipation",
						value: 10,
						image: "",
						min_ticket: 20000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "valkyries-ascension",
				name: "Valkyrie's Ascension",
				slug: "valkyries-ascension",
				image: "88069567363275",
				price: 31544,
				total_opened: 16116,
				created_at: "2023-07-15T04:12:37.734Z",
				items: [
					{
						asset_id: "124730194",
						asset_type: "HAT",
						name: "Blackvalk",
						value: 1400000,
						image: "",
						min_ticket: 0,
						max_ticket: 249,
					},
					{
						asset_id: "1180433861",
						asset_type: "HAT",
						name: "Sparkle Time Valkyrie",
						value: 992830,
						image: "",
						min_ticket: 250,
						max_ticket: 499,
					},
					{
						asset_id: "4390891467",
						asset_type: "HAT",
						name: "Ice Valkyrie",
						value: 355000,
						image: "",
						min_ticket: 500,
						max_ticket: 1999,
					},
					{
						asset_id: "1365767",
						asset_type: "HAT",
						name: "Valkyrie Helm",
						value: 200000,
						image: "",
						min_ticket: 2000,
						max_ticket: 9999,
					},
					{
						asset_id: "175134718",
						asset_type: "ACCESSORY",
						name: "Blackvalk Shades",
						value: 1983,
						image: "",
						min_ticket: 10000,
						max_ticket: 49999,
					},
					{
						asset_id: "74214775",
						asset_type: "HAT",
						name: "Valkyrie 3000",
						value: 578,
						image: "",
						min_ticket: 50000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "blue-addiction",
				name: "Blue Addiction",
				slug: "blue-addiction",
				image: "127364029001275",
				price: 30645,
				total_opened: 12661,
				created_at: "2025-01-08T02:45:53.917Z",
				items: [
					{
						asset_id: "98346834",
						asset_type: "HAT",
						name: "Bluesteel Fedora",
						value: 1130123,
						image: "",
						min_ticket: 0,
						max_ticket: 999,
					},
					{
						asset_id: "136802867",
						asset_type: "HAT",
						name: "Hooded Frostlord",
						value: 401232,
						image: "",
						min_ticket: 1000,
						max_ticket: 1999,
					},
					{
						asset_id: "4390891467",
						asset_type: "HAT",
						name: "Ice Valkyrie",
						value: 380974,
						image: "",
						min_ticket: 2000,
						max_ticket: 2999,
					},
					{
						asset_id: "188888052",
						asset_type: "HAT",
						name: "CW Ultimate: Sapphire Serenity",
						value: 340050,
						image: "",
						min_ticket: 3000,
						max_ticket: 3999,
					},
					{
						asset_id: "83704165",
						asset_type: "GEAR",
						name: "Icedagger ",
						value: 286000,
						image: "",
						min_ticket: 4000,
						max_ticket: 4999,
					},
					{
						asset_id: "553970606",
						asset_type: "HAT",
						name: "Blue Queen of the Night",
						value: 75000,
						image: "",
						min_ticket: 5000,
						max_ticket: 6999,
					},
					{
						asset_id: "4786869155",
						asset_type: "HAT",
						name: "Eggraging Shark of the Sea",
						value: 90,
						image: "",
						min_ticket: 7000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "purple-plasma",
				name: "Purple Plasma",
				slug: "purple-plasma",
				image: "122266939473189",
				price: 35187,
				total_opened: 7913,
				created_at: "2025-01-08T03:09:16.476Z",
				items: [
					{
						asset_id: "1744060292",
						asset_type: "HAT",
						name: "Poisoned Horns of the Toxic Wasteland",
						value: 750000,
						image: "",
						min_ticket: 0,
						max_ticket: 999,
					},
					{
						asset_id: "17999992",
						asset_type: "FACE",
						name: "Eyes of Azurewrath",
						value: 457122,
						image: "",
						min_ticket: 1000,
						max_ticket: 2999,
					},
					{
						asset_id: "188004500",
						asset_type: "HAT",
						name: "CW Ultimate: Amethyst Addiction",
						value: 320598,
						image: "",
						min_ticket: 3000,
						max_ticket: 4999,
					},
					{
						asset_id: "93136802",
						asset_type: "GEAR",
						name: "Amethyst Periastron Kappa",
						value: 183512,
						image: "",
						min_ticket: 5000,
						max_ticket: 6999,
					},
					{
						asset_id: "193696364",
						asset_type: "HAT",
						name: "Purple Ice Crown",
						value: 130000,
						image: "",
						min_ticket: 7000,
						max_ticket: 9999,
					},
					{
						asset_id: "243854130",
						asset_type: "ACCESSORY",
						name: "Purple Crazy Glasses",
						value: 378,
						image: "",
						min_ticket: 10000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "highlight-boom",
				name: "Highlight Boom",
				slug: "highlight-boom",
				image: "135550002753182",
				price: 66933,
				total_opened: 5063,
				created_at: "2025-03-18T23:04:21.710Z",
				items: [
					{
						asset_id: "1285307",
						asset_type: "HAT",
						name: "Sparkle Time Fedora",
						value: 1096042,
						image: "",
						min_ticket: 0,
						max_ticket: 1499,
					},
					{
						asset_id: "26019070",
						asset_type: "FACE",
						name: "Yum!",
						value: 620000,
						image: "",
						min_ticket: 1500,
						max_ticket: 5999,
					},
					{
						asset_id: "1073690",
						asset_type: "HAT",
						name: "JJ5x5's White Top Hat",
						value: 230000,
						image: "",
						min_ticket: 6000,
						max_ticket: 8999,
					},
					{
						asset_id: "209995252",
						asset_type: "FACE",
						name: "Blizzard Beast Mode",
						value: 145000,
						image: "",
						min_ticket: 9000,
						max_ticket: 13999,
					},
					{
						asset_id: "493482011",
						asset_type: "HAT",
						name: "DIY Rainbow Shaggy",
						value: 1000,
						image: "",
						min_ticket: 14000,
						max_ticket: 49999,
					},
					{
						asset_id: "102617886",
						asset_type: "HAT",
						name: "Eggo-trip",
						value: 100,
						image: "",
						min_ticket: 50000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "vampire",
				name: "Vampire",
				slug: "vampire",
				image: "112448944156006",
				price: 110425,
				total_opened: 5256,
				created_at: "2025-07-06T19:57:43.168Z",
				items: [
					{
						asset_id: "128158708",
						asset_type: "HAT",
						name: "Duke of the Federation",
						value: 2818678,
						image: "",
						min_ticket: 0,
						max_ticket: 499,
					},
					{
						asset_id: "22850569",
						asset_type: "ACCESSORY",
						name: "Red Bandana of SQL Injection",
						value: 2542588,
						image: "",
						min_ticket: 500,
						max_ticket: 1499,
					},
					{
						asset_id: "16652251",
						asset_type: "FACE",
						name: "Red Tango",
						value: 2105596,
						image: "",
						min_ticket: 1500,
						max_ticket: 2499,
					},
					{
						asset_id: "188003914",
						asset_type: "HAT",
						name: "Countess of the Federation",
						value: 1305868,
						image: "",
						min_ticket: 2500,
						max_ticket: 3499,
					},
					{
						asset_id: "49493376",
						asset_type: "FACE",
						name: "Eyes of Crimsonwrath",
						value: 401958,
						image: "",
						min_ticket: 3500,
						max_ticket: 6999,
					},
					{
						asset_id: "1272715",
						asset_type: "HAT",
						name: "Helm of the Secret Fire",
						value: 10184,
						image: "",
						min_ticket: 7000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "fedora-fiasco",
				name: "Fedora Fiasco",
				slug: "fedora-fiasco",
				image: "93216781920643",
				price: 122364,
				total_opened: 5578,
				created_at: "2024-08-08T20:07:38.384Z",
				items: [
					{
						asset_id: "493476042",
						asset_type: "HAT",
						name: "Sky Blue Sparkle Time Fedora",
						value: 1168423,
						image: "",
						min_ticket: 0,
						max_ticket: 249,
					},
					{
						asset_id: "215751161",
						asset_type: "HAT",
						name: "Orange Sparkle Time Fedora",
						value: 1122326,
						image: "",
						min_ticket: 250,
						max_ticket: 499,
					},
					{
						asset_id: "259423244",
						asset_type: "HAT",
						name: "Black Sparkle Time Fedora",
						value: 1038884,
						image: "",
						min_ticket: 500,
						max_ticket: 999,
					},
					{
						asset_id: "334663683",
						asset_type: "HAT",
						name: "Pink Sparkle Time Fedora",
						value: 780000,
						image: "",
						min_ticket: 1000,
						max_ticket: 3499,
					},
					{
						asset_id: "1016143686",
						asset_type: "HAT",
						name: "White Sparkle Time Fedora",
						value: 626144,
						image: "",
						min_ticket: 3500,
						max_ticket: 6499,
					},
					{
						asset_id: "98346834",
						asset_type: "HAT",
						name: "Bluesteel Fedora",
						value: 539929,
						image: "",
						min_ticket: 6500,
						max_ticket: 9999,
					},
					{
						asset_id: "1285307",
						asset_type: "HAT",
						name: "Sparkle Time Fedora",
						value: 479806,
						image: "",
						min_ticket: 10000,
						max_ticket: 14999,
					},
					{
						asset_id: "1029025",
						asset_type: "HAT",
						name: "The Classic ROBLOX Fedora",
						value: 100128,
						image: "",
						min_ticket: 15000,
						max_ticket: 24999,
					},
					{
						asset_id: "19027209",
						asset_type: "HAT",
						name: "Perfectly Legitimate Business Hat",
						value: 7432,
						image: "",
						min_ticket: 25000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "temple-of-wealth",
				name: "Temple of Wealth",
				slug: "temple-of-wealth",
				image: "127588791221485",
				price: 84328,
				total_opened: 3885,
				created_at: "2023-07-15T04:12:37.610Z",
				items: [
					{
						asset_id: "382881237",
						asset_type: "HAT",
						name: "Tixvalk",
						value: 1028998,
						image: "",
						min_ticket: 0,
						max_ticket: 499,
					},
					{
						asset_id: "2799053",
						asset_type: "HAT",
						name: "The Golden Robloxian",
						value: 812452,
						image: "",
						min_ticket: 500,
						max_ticket: 1999,
					},
					{
						asset_id: "22546563",
						asset_type: "HAT",
						name: "): Gold Ollie",
						value: 621037,
						image: "",
						min_ticket: 2000,
						max_ticket: 4999,
					},
					{
						asset_id: "16895215",
						asset_type: "GEAR",
						name: "Darkheart",
						value: 435382,
						image: "",
						min_ticket: 5000,
						max_ticket: 9999,
					},
					{
						asset_id: "362080535",
						asset_type: "ACCESSORY",
						name: "Tasteless Bluesteel Shades",
						value: 131351,
						image: "",
						min_ticket: 10000,
						max_ticket: 19999,
					},
					{
						asset_id: "185813692",
						asset_type: "ACCESSORY",
						name: "Ultimate Robling",
						value: 12121,
						image: "",
						min_ticket: 20000,
						max_ticket: 39999,
					},
					{
						asset_id: "134087261",
						asset_type: "ACCESSORY",
						name: "Gold Visor",
						value: 2971,
						image: "",
						min_ticket: 40000,
						max_ticket: 69999,
					},
					{
						asset_id: "3581868178",
						asset_type: "ACCESSORY",
						name: "Goldrow",
						value: 86,
						image: "",
						min_ticket: 70000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "opportunist",
				name: "Opportunist",
				slug: "opportunist",
				image: "116143930612797",
				price: 125919,
				total_opened: 3232,
				created_at: "2025-07-06T19:23:30.228Z",
				items: [
					{
						asset_id: "439946249",
						asset_type: "HAT",
						name: "Black Iron King of the Night",
						value: 1967480,
						image: "",
						min_ticket: 0,
						max_ticket: 1999,
					},
					{
						asset_id: "1125510",
						asset_type: "HAT",
						name: "The Void Star",
						value: 1396573,
						image: "",
						min_ticket: 2000,
						max_ticket: 3999,
					},
					{
						asset_id: "63692675",
						asset_type: "HAT",
						name: "Hooded Spacelord",
						value: 914876,
						image: "",
						min_ticket: 4000,
						max_ticket: 5999,
					},
					{
						asset_id: "11748356",
						asset_type: "ACCESSORY",
						name: "Clockwork's Shades",
						value: 814957,
						image: "",
						min_ticket: 6000,
						max_ticket: 7999,
					},
					{
						asset_id: "128208025",
						asset_type: "HAT",
						name: "Ultimate Victory Headband",
						value: 51205,
						image: "",
						min_ticket: 8000,
						max_ticket: 14999,
					},
					{
						asset_id: "19027209",
						asset_type: "HAT",
						name: "Perfectly Legitimate Business Hat",
						value: 6290,
						image: "",
						min_ticket: 15000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "traders-delight",
				name: "Trader's Delight",
				slug: "traders-delight",
				image: "102748387573558",
				price: 150135,
				total_opened: 3115,
				created_at: "2024-09-04T14:05:08.037Z",
				items: [
					{
						asset_id: "1125510",
						asset_type: "HAT",
						name: "The Void Star",
						value: 839486,
						image: "",
						min_ticket: 0,
						max_ticket: 499,
					},
					{
						asset_id: "215718515",
						asset_type: "HAT",
						name: "Fiery Horns of the Netherworld",
						value: 712958,
						image: "",
						min_ticket: 500,
						max_ticket: 1499,
					},
					{
						asset_id: "74891470",
						asset_type: "HAT",
						name: "Frozen Horns of the Frigid Planes",
						value: 651948,
						image: "",
						min_ticket: 1500,
						max_ticket: 2999,
					},
					{
						asset_id: "1744060292",
						asset_type: "HAT",
						name: "Poisoned Horns of the Toxic Wasteland",
						value: 560000,
						image: "",
						min_ticket: 3000,
						max_ticket: 5499,
					},
					{
						asset_id: "1235488",
						asset_type: "HAT",
						name: "Clockwork's Headphones",
						value: 530000,
						image: "",
						min_ticket: 5500,
						max_ticket: 8499,
					},
					{
						asset_id: "439945661",
						asset_type: "HAT",
						name: "Silver King of the Night ",
						value: 400000,
						image: "",
						min_ticket: 8500,
						max_ticket: 12499,
					},
					{
						asset_id: "1029025",
						asset_type: "HAT",
						name: "The Classic ROBLOX Fedora",
						value: 290000,
						image: "",
						min_ticket: 12500,
						max_ticket: 17499,
					},
					{
						asset_id: "1365767",
						asset_type: "HAT",
						name: "Valkyrie Helm",
						value: 250000,
						image: "",
						min_ticket: 17500,
						max_ticket: 24999,
					},
					{
						asset_id: "628771505",
						asset_type: "HAT",
						name: "Black Iron Horns",
						value: 160000,
						image: "",
						min_ticket: 25000,
						max_ticket: 34999,
					},
					{
						asset_id: "151784526",
						asset_type: "HAT",
						name: "Sparkle Time Traffic Cone",
						value: 95012,
						image: "",
						min_ticket: 35000,
						max_ticket: 49999,
					},
					{
						asset_id: "19027209",
						asset_type: "HAT",
						name: "Perfectly Legitimate Business Hat",
						value: 3221,
						image: "",
						min_ticket: 50000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "skateboard-days",
				name: "): Days",
				slug: "skateboard-days",
				image: "103766968977789",
				price: 131250,
				total_opened: 3566,
				created_at: "2024-08-14T06:15:37.173Z",
				items: [
					{
						asset_id: "23705521",
						asset_type: "HAT",
						name: "): Euro 180",
						value: 1232430,
						image: "",
						min_ticket: 0,
						max_ticket: 999,
					},
					{
						asset_id: "20573086",
						asset_type: "HAT",
						name: "): Red Grind",
						value: 1124132,
						image: "",
						min_ticket: 1000,
						max_ticket: 1999,
					},
					{
						asset_id: "47697285",
						asset_type: "HAT",
						name: "): Purple Indy",
						value: 985456,
						image: "",
						min_ticket: 2000,
						max_ticket: 2999,
					},
					{
						asset_id: "22546563",
						asset_type: "HAT",
						name: "): Gold Ollie",
						value: 901875,
						image: "",
						min_ticket: 3000,
						max_ticket: 3999,
					},
					{
						asset_id: "26011378",
						asset_type: "HAT",
						name: "): Star Tailslide",
						value: 758981,
						image: "",
						min_ticket: 4000,
						max_ticket: 5999,
					},
					{
						asset_id: "321346550",
						asset_type: "HAT",
						name: ":( Front Stand",
						value: 360000,
						image: "",
						min_ticket: 6000,
						max_ticket: 10999,
					},
					{
						asset_id: "250394771",
						asset_type: "HAT",
						name: "): Green Sidewinder",
						value: 282631,
						image: "",
						min_ticket: 11000,
						max_ticket: 15999,
					},
					{
						asset_id: "24123795",
						asset_type: "HAT",
						name: "Al Capwn",
						value: 171323,
						image: "",
						min_ticket: 16000,
						max_ticket: 30999,
					},
					{
						asset_id: "321570512",
						asset_type: "HAT",
						name: "Chill Cap",
						value: 75,
						image: "",
						min_ticket: 31000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "vineyard-vibes",
				name: "Vineyard Vibes",
				slug: "vineyard-vibes",
				image: "78423646231538",
				price: 628285,
				total_opened: 768,
				created_at: "2024-10-28T21:47:42.106Z",
				items: [
					{
						asset_id: "16652251",
						asset_type: "FACE",
						name: "Red Tango",
						value: 1823754,
						image: "",
						min_ticket: 0,
						max_ticket: 9999,
					},
					{
						asset_id: "97078419",
						asset_type: "ACCESSORY",
						name: "Living Art: Starry Night",
						value: 1236162,
						image: "",
						min_ticket: 10000,
						max_ticket: 19999,
					},
					{
						asset_id: "17449820",
						asset_type: "HAT",
						name: "The Crown of Roses",
						value: 1160631,
						image: "",
						min_ticket: 20000,
						max_ticket: 34999,
					},
					{
						asset_id: "63990268",
						asset_type: "HAT",
						name: "Crown of Autumn Laurels",
						value: 286849,
						image: "",
						min_ticket: 35000,
						max_ticket: 47999,
					},
					{
						asset_id: "98346415",
						asset_type: "GEAR",
						name: "Carnagecopia",
						value: 139785,
						image: "",
						min_ticket: 48000,
						max_ticket: 60999,
					},
					{
						asset_id: "158066632",
						asset_type: "HAT",
						name: "Tea Cup",
						value: 64958,
						image: "",
						min_ticket: 61000,
						max_ticket: 73999,
					},
					{
						asset_id: "181644522",
						asset_type: "HAT",
						name: "Scary Bloxxing Pumpkin",
						value: 40584,
						image: "",
						min_ticket: 74000,
						max_ticket: 86999,
					},
					{
						asset_id: "2705893733",
						asset_type: "HAT",
						name: "Wanwood Autumn King Crown",
						value: 27857,
						image: "",
						min_ticket: 87000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "crimson-wrath",
				name: "Crimson Wrath",
				slug: "crimson-wrath",
				image: "90101670784169",
				price: 544302,
				total_opened: 680,
				created_at: "2025-07-06T19:11:19.305Z",
				items: [
					{
						asset_id: "31101391",
						asset_type: "HAT",
						name: "Dominus Infernus",
						value: 3518576,
						image: "",
						min_ticket: 0,
						max_ticket: 4999,
					},
					{
						asset_id: "128158708",
						asset_type: "HAT",
						name: "Duke of the Federation",
						value: 3010657,
						image: "",
						min_ticket: 5000,
						max_ticket: 9999,
					},
					{
						asset_id: "42211680",
						asset_type: "HAT",
						name: "Red Domino Crown",
						value: 1270000,
						image: "",
						min_ticket: 10000,
						max_ticket: 14999,
					},
					{
						asset_id: "188003914",
						asset_type: "HAT",
						name: "Countess of the Federation",
						value: 780485,
						image: "",
						min_ticket: 15000,
						max_ticket: 19999,
					},
					{
						asset_id: "130213380",
						asset_type: "FACE",
						name: "ROBLOX Madness Face",
						value: 80000,
						image: "",
						min_ticket: 20000,
						max_ticket: 59999,
					},
					{
						asset_id: "568920079",
						asset_type: "ACCESSORY",
						name: "Ruby Starstone of the Federation",
						value: 45000,
						image: "",
						min_ticket: 60000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "high-demand",
				name: "High Demand",
				slug: "high-demand",
				image: "138942713402043",
				price: 736364,
				total_opened: 546,
				created_at: "2025-05-02T01:43:17.095Z",
				items: [
					{
						asset_id: "48545806",
						asset_type: "HAT",
						name: "Dominus Frigidus",
						value: 2000000,
						image: "",
						min_ticket: 0,
						max_ticket: 9999,
					},
					{
						asset_id: "493476042",
						asset_type: "HAT",
						name: "Sky Blue Sparkle Time Fedora",
						value: 1500000,
						image: "",
						min_ticket: 10000,
						max_ticket: 19999,
					},
					{
						asset_id: "489196035",
						asset_type: "ACCESSORY",
						name: "Bluesteel Bling $$ Necklace",
						value: 750000,
						image: "",
						min_ticket: 20000,
						max_ticket: 29999,
					},
					{
						asset_id: "68258723",
						asset_type: "HAT",
						name: "Bluesteel Domino Crown",
						value: 500000,
						image: "",
						min_ticket: 30000,
						max_ticket: 49999,
					},
					{
						asset_id: "4390891467",
						asset_type: "HAT",
						name: "Ice Valkyrie",
						value: 300000,
						image: "",
						min_ticket: 50000,
						max_ticket: 69999,
					},
					{
						asset_id: "83704165",
						asset_type: "GEAR",
						name: "Icedagger ",
						value: 210000,
						image: "",
						min_ticket: 70000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "wealth",
				name: "Wealth",
				slug: "wealth",
				image: "90646490382164",
				price: 2044910,
				total_opened: 289,
				created_at: "2025-07-06T18:59:35.554Z",
				items: [
					{
						asset_id: "21070012",
						asset_type: "HAT",
						name: "Dominus Empyreus",
						value: 7520590,
						image: "",
						min_ticket: 0,
						max_ticket: 1999,
					},
					{
						asset_id: "31101391",
						asset_type: "HAT",
						name: "Dominus Infernus",
						value: 5295830,
						image: "",
						min_ticket: 2000,
						max_ticket: 3999,
					},
					{
						asset_id: "48545806",
						asset_type: "HAT",
						name: "Dominus Frigidus",
						value: 5063005,
						image: "",
						min_ticket: 4000,
						max_ticket: 5999,
					},
					{
						asset_id: "72082328",
						asset_type: "HAT",
						name: "Red Sparkle Time Fedora",
						value: 2819684,
						image: "",
						min_ticket: 6000,
						max_ticket: 20999,
					},
					{
						asset_id: "493476042",
						asset_type: "HAT",
						name: "Sky Blue Sparkle Time Fedora",
						value: 2101689,
						image: "",
						min_ticket: 21000,
						max_ticket: 35999,
					},
					{
						asset_id: "1323384",
						asset_type: "HAT",
						name: "The Ice Crown",
						value: 1942498,
						image: "",
						min_ticket: 36000,
						max_ticket: 50999,
					},
					{
						asset_id: "1016143686",
						asset_type: "HAT",
						name: "White Sparkle Time Fedora",
						value: 1406837,
						image: "",
						min_ticket: 51000,
						max_ticket: 65999,
					},
					{
						asset_id: "878889105",
						asset_type: "HAT",
						name: "Archduchess of the Federation",
						value: 1024958,
						image: "",
						min_ticket: 66000,
						max_ticket: 80999,
					},
					{
						asset_id: "68258723",
						asset_type: "HAT",
						name: "Bluesteel Domino Crown",
						value: 250432,
						image: "",
						min_ticket: 81000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "billionaire",
				name: "Billionaire",
				slug: "billionaire",
				image: "120549937194731",
				price: 4316676,
				total_opened: 500,
				created_at: "2025-08-22T05:48:30.622Z",
				items: [
					{
						asset_id: "21070012",
						asset_type: "HAT",
						name: "Dominus Empyreus",
						value: 10428593,
						image: "",
						min_ticket: 0,
						max_ticket: 19999,
					},
					{
						asset_id: "33171947",
						asset_type: "ACCESSORY",
						name: "Bling $$ Necklace",
						value: 5149284,
						image: "",
						min_ticket: 20000,
						max_ticket: 29999,
					},
					{
						asset_id: "63043890",
						asset_type: "HAT",
						name: "Purple Sparkle Time Fedora",
						value: 4024387,
						image: "",
						min_ticket: 30000,
						max_ticket: 34999,
					},
					{
						asset_id: "334663683",
						asset_type: "HAT",
						name: "Pink Sparkle Time Fedora",
						value: 3028385,
						image: "",
						min_ticket: 35000,
						max_ticket: 39999,
					},
					{
						asset_id: "100929604",
						asset_type: "HAT",
						name: "Green Sparkle Time Fedora",
						value: 2689408,
						image: "",
						min_ticket: 40000,
						max_ticket: 44999,
					},
					{
						asset_id: "1016143686",
						asset_type: "HAT",
						name: "White Sparkle Time Fedora",
						value: 1292580,
						image: "",
						min_ticket: 45000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "good-dancer",
				name: "Good Dancer",
				slug: "good-dancer",
				image: "91286185031495",
				price: 736934,
				total_opened: 323,
				created_at: "2025-08-22T06:06:51.561Z",
				items: [
					{
						asset_id: "16652251",
						asset_type: "FACE",
						name: "Red Tango",
						value: 3520584,
						image: "",
						min_ticket: 0,
						max_ticket: 3999,
					},
					{
						asset_id: "180660043",
						asset_type: "FACE",
						name: "Red Glowing Eyes",
						value: 1789429,
						image: "",
						min_ticket: 4000,
						max_ticket: 7999,
					},
					{
						asset_id: "207207025",
						asset_type: "ACCESSORY",
						name: "Crimson Thug Shades",
						value: 1693580,
						image: "",
						min_ticket: 8000,
						max_ticket: 11999,
					},
					{
						asset_id: "1191135761",
						asset_type: "HAT",
						name: "Red Void Star",
						value: 1395869,
						image: "",
						min_ticket: 12000,
						max_ticket: 15999,
					},
					{
						asset_id: "215718515",
						asset_type: "HAT",
						name: "Fiery Horns of the Netherworld",
						value: 1053858,
						image: "",
						min_ticket: 16000,
						max_ticket: 19999,
					},
					{
						asset_id: "94794774",
						asset_type: "GEAR",
						name: "Crescendo, The Soul Stealer",
						value: 924170,
						image: "",
						min_ticket: 20000,
						max_ticket: 39999,
					},
					{
						asset_id: "22920501",
						asset_type: "FACE",
						name: "Troublemaker",
						value: 295840,
						image: "",
						min_ticket: 40000,
						max_ticket: 59999,
					},
					{
						asset_id: "66330295",
						asset_type: "FACE",
						name: "Red RAWR",
						value: 91589,
						image: "",
						min_ticket: 60000,
						max_ticket: 79999,
					},
					{
						asset_id: "568920079",
						asset_type: "ACCESSORY",
						name: "Ruby Starstone of the Federation",
						value: 40248,
						image: "",
						min_ticket: 80000,
						max_ticket: 99999,
					},
				],
			},
			{
				id: "lucky-drop",
				name: "Lucky Drop",
				slug: "lucky-drop",
				image: "104277004017723",
				price: 646717,
				total_opened: 147,
				created_at: "2025-07-06T19:09:43.972Z",
				items: [
					{
						asset_id: "98346834",
						asset_type: "HAT",
						name: "Bluesteel Fedora",
						value: 2532588,
						image: "",
						min_ticket: 0,
						max_ticket: 499,
					},
					{
						asset_id: "878889105",
						asset_type: "HAT",
						name: "Archduchess of the Federation",
						value: 2205868,
						image: "",
						min_ticket: 500,
						max_ticket: 999,
					},
					{
						asset_id: "74891470",
						asset_type: "HAT",
						name: "Frozen Horns of the Frigid Planes",
						value: 1850683,
						image: "",
						min_ticket: 1000,
						max_ticket: 1499,
					},
					{
						asset_id: "68258723",
						asset_type: "HAT",
						name: "Bluesteel Domino Crown",
						value: 951865,
						image: "",
						min_ticket: 1500,
						max_ticket: 41499,
					},
					{
						asset_id: "99254437",
						asset_type: "GEAR",
						name: "Scython's ROBLOX Tablet",
						value: 329584,
						image: "",
						min_ticket: 41500,
						max_ticket: 69999,
					},
					{
						asset_id: "83704165",
						asset_type: "GEAR",
						name: "Icedagger ",
						value: 204960,
						image: "",
						min_ticket: 70000,
						max_ticket: 99999,
					},
				],
			},
		];

		dicebloxCases.forEach((definition) => {
			const fallbackAssetId = this.pickCaseImageFallbackId(definition.items);
			const battleItems = new Array<CaseBattleCase["items"][number]>();
			definition.items.forEach((item) => {
				const numericId = itemNumericId++;
				const minTicket = math.max(1, item.min_ticket + 1);
				const maxTicket = math.max(minTicket, math.min(100000, item.max_ticket + 1));

				battleItems.push({
					id: numericId,
					case_id: definition.id,
					asset_id: item.asset_id,
					asset_type: item.asset_type,
					name: item.name,
					value: item.value,
					image: item.image,
					min_ticket: minTicket,
					max_ticket: maxTicket,
				});
			});

			const lastItem = battleItems[battleItems.size() - 1];
			if (lastItem) {
				lastItem.max_ticket = 100000;
			}

			this.caseBattleCases.push({
				id: definition.id,
				name: definition.name,
				slug: definition.slug,
				image: this.normalizeCaseBattleImage(definition.image, fallbackAssetId),
				price: definition.price,
				total_opened: definition.total_opened,
				created_at: definition.created_at,
				items: battleItems,
			});
		});
	}

	private pickCaseImageFallbackId(items: Array<{ asset_id: string; value: number }>) {
		let fallbackId: string | undefined;
		let bestValue = -1;

		for (const item of items) {
			const numericMatch = tostring(item.asset_id ?? "").match("^(%d+)$")[0];
			const numericId = numericMatch !== undefined ? tostring(numericMatch) : undefined;
			if (numericId === undefined) continue;
			if (item.value > bestValue) {
				bestValue = item.value;
				fallbackId = numericId;
			}
		}

		return fallbackId;
	}

	private normalizeCaseBattleImage(imageValue: string, fallbackAssetId?: string) {
		const normalized = tostring(imageValue ?? "");
		const trimmed = normalized.gsub("^%s*(.-)%s*$", "%1")[0];
		if (trimmed.size() === 0) {
			if (fallbackAssetId !== undefined) {
				return `rbxthumb://type=Asset&id=${fallbackAssetId}&w=420&h=420`;
			}
			return "";
		}

		const thumbMatch = trimmed.match("^thumb:(%d+)$")[0];
		if (thumbMatch !== undefined) {
			return `rbxthumb://type=Asset&id=${thumbMatch}&w=420&h=420`;
		}

		const robloxAssetMatch = trimmed.match("^https?://www%.roblox%.com/asset/%?id=(%d+)$")[0];
		if (robloxAssetMatch !== undefined) {
			return `rbxassetid://${robloxAssetMatch}`;
		}

		const assetDeliveryMatch = trimmed.match("^https?://assetdelivery%.roblox%.com/v1/asset/%?id=(%d+)$")[0];
		if (assetDeliveryMatch !== undefined) {
			return `rbxassetid://${assetDeliveryMatch}`;
		}

		if (trimmed.match("^rbxassetid://")[0] !== undefined) return trimmed;
		if (trimmed.match("^rbxthumb://")[0] !== undefined) return trimmed;

		const numericMatch = trimmed.match("^(%d+)$")[0];
		if (numericMatch !== undefined) {
			return `rbxthumb://type=Asset&id=${numericMatch}&w=420&h=420`;
		}

		if (trimmed.match("^https?://")[0] !== undefined) {
			return "";
		}

		return trimmed;
	}

	private getCaseBattleCaseById(caseId: string) {
		return this.caseBattleCases.find((entry) => entry.id === caseId);
	}

	private pickCaseBattleItem(battleCase: CaseBattleCase) {
		if (battleCase.items.size() === 0) return;
		const roll = math.random(1, 100000);
		const fallback = battleCase.items[battleCase.items.size() - 1];
		for (const item of battleCase.items) {
			if (roll >= item.min_ticket && roll <= item.max_ticket) {
				return item;
			}
		}
		return fallback;
	}

	private seedMinigameStats() {
		this.minigameStats.set("Coinflip", {
			current_ccu: 0,
			total_games_played: 0,
			total_spent: 0,
			total_wins: 0,
			total_losses: 0,
		});
		this.minigameStats.set("ItemCases", {
			current_ccu: 0,
			total_games_played: 0,
			total_spent: 0,
		});
		this.minigameStats.set("CaseBattles", {
			current_ccu: 0,
			total_games_played: 0,
			total_spent: 0,
		});
		this.minigameStats.set("Jackpot", {
			current_ccu: 0,
			total_games_played: 0,
			total_spent: 0,
		});
	}

	private getSettings(): SettingsResponse {
		return {
			status: "OK",
			result: {
				game_open: true,
				paycheck: 25000,
				polling_cooldown: 0.6,
				dailywheel: {
					rewards: [
						{ id: "cash_small", type: "cash", value: "5000", chance: 22 },
						{ id: "cash_mid", type: "cash", value: "25000", chance: 18 },
						{ id: "cash_big", type: "cash", value: "100000", chance: 10 },
						{ id: "gems_small", type: "gems", value: "40", chance: 17 },
						{ id: "gems_big", type: "gems", value: "120", chance: 12 },
						{ id: "item_royal", type: "item", value: "royal_crown", chance: 10 },
						{ id: "item_void", type: "item", value: "void_wings", chance: 7 },
						{ id: "mystery", type: "mystery", value: "", chance: 4 },
					],
				},
			},
		};
	}

	private openCase(userId: string, caseId: string, _lucky: boolean): RouteResponse {
		if (userId.size() === 0) return this.fail(400, { status: "error", error: "Missing user id" });
		const caseData = this.cases.get(caseId);
		if (!caseData) return this.fail(404, { status: "error", error: "Case not found" });

		const result = this.pickCaseItem(caseData);
		if (!result) return this.fail(500, { status: "error", error: "Case has no items" });
		const itemData = this.items.get(result.id);
		if (!itemData) return this.fail(500, { status: "error", error: "Item not found" });

		const added = this.addInventoryItem(userId, itemData.id);
		if (!added) {
			return this.fail(503, {
				status: "error",
				error: "Inventory mint is temporarily unavailable. Try again.",
			});
		}
		result.claimed += 1;
		caseData.opened_count += 1;
		this.pendingCaseOpenIncrements.set(caseId, (this.pendingCaseOpenIncrements.get(caseId) ?? 0) + 1);
		this.syncCaseBattleCaseOpenCount(caseId);

		const minigame = this.minigameStats.get("ItemCases");
		if (minigame) {
			minigame.total_games_played += 1;
			minigame.total_spent += caseData.price;
		}

		return this.ok({
			status: "OK",
			result: {
				id: result.id,
				chance: result.chance,
				claimed: result.claimed,
			},
			case: caseData,
		});
	}

	private createCoinflip(
		userId: string,
		uaids: string[],
		requestedItemCounts: Record<string, number>,
		serverId: string,
		coin: 1 | 2,
		flipType: "server" | "global" | "friends",
	): RouteResponse {
		if (userId === "0" || uaids.size() === 0) {
			return this.fail(400, { status: "error", error: "Invalid request" });
		}

		this.syncGlobalCoinflips(true);

		let taken = this.takeItemsByUaid(userId, uaids, true);
		if (!taken && this.hasRequestedItemCounts(requestedItemCounts)) {
			taken = this.takeItemsByItemCounts(userId, requestedItemCounts);
		}
		if (!taken) {
			const selectionFailureMessage = this.hasRequestedItemCounts(requestedItemCounts)
				? this.getInventorySelectionFailureMessageByItemCounts(userId, requestedItemCounts)
				: this.getInventorySelectionFailureMessage(userId, uaids);
			return this.fail(400, {
				status: "error",
				error: selectionFailureMessage,
			});
		}

		const identity = this.getUserIdentity(userId);
		const coinflipId = HttpService.GenerateGUID(false);

		let createdRecord: CoinflipRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_coinflips_create_update", () =>
			this.globalCoinflipsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCoinflipsState(existingState);
				const nextCoinflips = normalizedState.coinflips ?? {};

				for (const [, rawCoinflipRecord] of pairs(nextCoinflips)) {
					const coinflipRecord = this.deserializeCoinflipRecord(rawCoinflipRecord);
					if (!coinflipRecord) continue;

					const isActive =
						coinflipRecord.data.status === "waiting_for_player" ||
						coinflipRecord.data.status === "awaiting_confirmation";
					const userIsParticipant =
						coinflipRecord.data.player1.id === userId || coinflipRecord.data.player2?.id === userId;

					if (isActive && userIsParticipant) {
						operationCode = 400;
						operationError = "Already in a coinflip";
						return $tuple(existingState);
					}
				}

				const nextAutoId = math.max(
					1,
					math.floor(normalizedState.next_coinflip_auto_id ?? this.nextCoinflipAutoId),
				);
				const data: Coinflip = {
					id: coinflipId,
					auto_id: nextAutoId,
					player1: {
						id: userId,
						username: identity.name,
						display_name: identity.display_name,
					},
					player1_items: this.toItemStrings(taken),
					status: "waiting_for_player",
					type: flipType,
					server_id: serverId,
					player1_coin: coin,
				};

				createdRecord = {
					data,
					player1Items: taken,
					lockedItems: taken.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
				};

				nextCoinflips[coinflipId] = this.serializeCoinflipRecord(createdRecord);
				normalizedState.coinflips = nextCoinflips;
				normalizedState.next_coinflip_auto_id = nextAutoId + 1;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to create global coinflip:", err);
			this.addItemsToInventory(userId, taken);
			return this.fail(500, { status: "error", error: "Failed to create coinflip" });
		}

		if (operationCode !== undefined || !createdRecord) {
			this.recordDataStoreContention("global_coinflips_create_update");
			this.addItemsToInventory(userId, taken);
			this.syncGlobalCoinflips(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				error: operationError ?? "Failed to create coinflip",
			});
		}

		this.coinflips.set(coinflipId, createdRecord);
		this.nextCoinflipAutoId = math.max(this.nextCoinflipAutoId, (createdRecord.data.auto_id ?? 0) + 1);

		return this.ok({
			status: "OK",
			data: createdRecord.data,
		});
	}

	private cancelCoinflip(coinflipId: string): RouteResponse {
		let cancelledRecord: CoinflipRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_coinflips_cancel_update", () =>
			this.globalCoinflipsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCoinflipsState(existingState);
				const nextCoinflips = normalizedState.coinflips ?? {};
				const currentRecord = this.deserializeCoinflipRecord(nextCoinflips[coinflipId]);
				if (!currentRecord) {
					operationCode = 404;
					operationError = "Coinflip not found";
					return $tuple(existingState);
				}

				if (currentRecord.data.status !== "waiting_for_player") {
					operationCode = 400;
					operationError = "Coinflip cannot be cancelled";
					return $tuple(existingState);
				}

				cancelledRecord = currentRecord;
				delete nextCoinflips[coinflipId];
				normalizedState.coinflips = nextCoinflips;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to cancel global coinflip:", err);
			return this.fail(500, { status: "error", message: "Failed to cancel coinflip" });
		}

		if (operationCode !== undefined || !cancelledRecord) {
			this.recordDataStoreContention("global_coinflips_cancel_update");
			this.syncGlobalCoinflips(true);
			return this.fail(operationCode ?? 404, {
				status: "error",
				message: operationError ?? "Coinflip not found",
			});
		}

		this.addItemsToInventory(cancelledRecord.data.player1.id, cancelledRecord.lockedItems);
		this.coinflips.delete(coinflipId);
		return this.ok({ status: "OK", message: "Cancelled" });
	}

	private joinCoinflip(
		coinflipId: string,
		userId: string,
		uaids: string[],
		requestedItemCounts: Record<string, number>,
	): RouteResponse {
		this.syncGlobalCoinflips(true);
		let taken = this.takeItemsByUaid(userId, uaids, true);
		if (!taken && this.hasRequestedItemCounts(requestedItemCounts)) {
			taken = this.takeItemsByItemCounts(userId, requestedItemCounts);
		}
		if (!taken) {
			const selectionFailureMessage = this.hasRequestedItemCounts(requestedItemCounts)
				? this.getInventorySelectionFailureMessageByItemCounts(userId, requestedItemCounts)
				: this.getInventorySelectionFailureMessage(userId, uaids);
			return this.fail(400, {
				status: "error",
				message: selectionFailureMessage,
			});
		}

		let joinedRecord: CoinflipRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_coinflips_join_update", () =>
			this.globalCoinflipsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCoinflipsState(existingState);
				const nextCoinflips = normalizedState.coinflips ?? {};

				for (const [currentCoinflipId, rawCoinflipRecord] of pairs(nextCoinflips)) {
					if (tostring(currentCoinflipId) === coinflipId) continue;
					const coinflipRecord = this.deserializeCoinflipRecord(rawCoinflipRecord);
					if (!coinflipRecord) continue;

					const isActive =
						coinflipRecord.data.status === "waiting_for_player" ||
						coinflipRecord.data.status === "awaiting_confirmation";
					const userIsParticipant =
						coinflipRecord.data.player1.id === userId || coinflipRecord.data.player2?.id === userId;

					if (isActive && userIsParticipant) {
						operationCode = 400;
						operationError = "Already in a coinflip";
						return $tuple(existingState);
					}
				}

				const currentRecord = this.deserializeCoinflipRecord(nextCoinflips[coinflipId]);
				if (!currentRecord) {
					operationCode = 404;
					operationError = "Coinflip not found";
					return $tuple(existingState);
				}

				if (currentRecord.data.status !== "waiting_for_player") {
					operationCode = 400;
					operationError = "Coinflip is not joinable";
					return $tuple(existingState);
				}

				if (currentRecord.data.player1.id === userId) {
					operationCode = 400;
					operationError = "Cannot join your own coinflip";
					return $tuple(existingState);
				}

				const identity = this.getUserIdentity(userId);
				currentRecord.player2Items = taken;
				taken.forEach((tuple) => currentRecord.lockedItems.push(tuple));
				currentRecord.data.player2 = {
					id: userId,
					username: identity.name,
					display_name: identity.display_name,
				};
				currentRecord.data.player2_items = this.toItemStrings(taken);
				currentRecord.data.status = "awaiting_confirmation";
				currentRecord.joinedAt = os.time();

				joinedRecord = currentRecord;
				nextCoinflips[coinflipId] = this.serializeCoinflipRecord(currentRecord);
				normalizedState.coinflips = nextCoinflips;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to join global coinflip:", err);
			this.addItemsToInventory(userId, taken);
			return this.fail(500, { status: "error", message: "Failed to join coinflip" });
		}

		if (operationCode !== undefined || !joinedRecord) {
			this.recordDataStoreContention("global_coinflips_join_update");
			this.addItemsToInventory(userId, taken);
			this.syncGlobalCoinflips(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to join coinflip",
			});
		}

		this.coinflips.set(coinflipId, joinedRecord);

		return this.ok({
			status: "OK",
			data: joinedRecord.data,
		});
	}

	private buildBotCoinflipItems(coinflipId: string, player1ItemEntries: string[]) {
		const botItems = new Array<InventoryTuple>();
		let reservationFailed = false;

		player1ItemEntries.forEach((entry, index) => {
			const split = entry.split(":");
			const itemId = split[1] ?? split[0];
			if (!this.items.has(itemId)) return;

			const currentSerial = this.itemSerialByItemId.get(itemId) ?? 0;
			const serialNumber = this.reserveGlobalItemSerial(itemId, currentSerial);
			if (serialNumber === undefined) {
				reservationFailed = true;
				return;
			}
			this.itemSerialByItemId.set(itemId, math.max(currentSerial, serialNumber));

			const serial = tostring(serialNumber);
			botItems.push([itemId, `FF_BOT_${coinflipId}_${index + 1}`, serial, serial]);
		});

		if (reservationFailed) return undefined;
		return botItems;
	}

	private callBotCoinflip(coinflipId: string, ownerUserId: string): RouteResponse {
		if (!this.isRobloxUserId(ownerUserId)) {
			return this.fail(400, { status: "error", message: "Invalid user" });
		}

		this.syncGlobalCoinflips(true);
		const snapshotRecord = this.coinflips.get(coinflipId);
		if (!snapshotRecord) {
			return this.fail(404, { status: "error", message: "Coinflip not found" });
		}

		const botItems = this.buildBotCoinflipItems(coinflipId, snapshotRecord.data.player1_items);
		if (!botItems) {
			return this.fail(503, {
				status: "error",
				message: "Global copy serial reservation unavailable, try again.",
			});
		}
		if (botItems.size() === 0) {
			return this.fail(400, { status: "error", message: "Unable to create bot stake" });
		}

		let updatedRecord: CoinflipRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_coinflips_call_bot_update", () =>
			this.globalCoinflipsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCoinflipsState(existingState);
				const nextCoinflips = normalizedState.coinflips ?? {};
				const currentRecord = this.deserializeCoinflipRecord(nextCoinflips[coinflipId]);
				if (!currentRecord) {
					operationCode = 404;
					operationError = "Coinflip not found";
					return $tuple(existingState);
				}

				if (currentRecord.data.player1.id !== ownerUserId) {
					operationCode = 400;
					operationError = "Only the creator can call a bot";
					return $tuple(existingState);
				}

				if (currentRecord.data.status !== "waiting_for_player") {
					operationCode = 400;
					operationError = "Coinflip is not waiting for a bot";
					return $tuple(existingState);
				}

				if (currentRecord.data.player2) {
					operationCode = 400;
					operationError = "Coinflip already has a second player";
					return $tuple(existingState);
				}

				const expectedItemIds = new Array<string>();
				currentRecord.data.player1_items.forEach((entry) => {
					const split = entry.split(":");
					const itemId = split[1] ?? split[0];
					if (!this.items.has(itemId)) return;
					expectedItemIds.push(itemId);
				});

				if (expectedItemIds.size() !== botItems.size()) {
					operationCode = 409;
					operationError = "Coinflip stake changed, retry call bot";
					return $tuple(existingState);
				}

				for (let index = 0; index < expectedItemIds.size(); index++) {
					if (expectedItemIds[index] !== botItems[index][0]) {
						operationCode = 409;
						operationError = "Coinflip stake changed, retry call bot";
						return $tuple(existingState);
					}
				}

				const mintedBotItems = botItems.map(
					(tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]] as InventoryTuple,
				);
				mintedBotItems.forEach((tuple) => currentRecord.lockedItems.push(tuple));

				const botId = `BOT_${coinflipId}`;
				currentRecord.player2Items = mintedBotItems;
				currentRecord.data.player2 = {
					id: botId,
					username: "FortuneBot",
					display_name: "Fortune Bot",
				};
				currentRecord.data.player2_items = this.toItemStrings(mintedBotItems);
				currentRecord.data.status = "awaiting_confirmation";
				currentRecord.joinedAt = os.time();

				updatedRecord = currentRecord;
				nextCoinflips[coinflipId] = this.serializeCoinflipRecord(currentRecord);
				normalizedState.coinflips = nextCoinflips;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to call coinflip bot globally:", err);
			return this.fail(500, { status: "error", message: "Failed to call bot" });
		}

		if (operationCode !== undefined || !updatedRecord) {
			this.recordDataStoreContention("global_coinflips_call_bot_update");
			this.syncGlobalCoinflips(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to call bot",
			});
		}

		this.coinflips.set(coinflipId, updatedRecord);

		return this.ok({
			status: "OK",
			data: updatedRecord.data,
		});
	}

	private updateCoinflips(force = false) {
		if (!force && tick() - this.lastCoinflipUpdateAt < this.MINIGAME_SYNC_INTERVAL) {
			this.syncGlobalCoinflips();
			return;
		}

		if (!force) {
			let hasPendingResolution = false;
			let hasCompletedToCleanup = false;
			let passiveCcu = 0;

			for (const [, record] of this.coinflips) {
				const shouldManage = this.shouldManageServerScopedRecord(record.data.server_id);

				if (shouldManage && record.data.status === "awaiting_confirmation") {
					hasPendingResolution = true;
					break;
				}

				if (shouldManage && record.data.status === "completed" && record.completedAt !== undefined) {
					hasCompletedToCleanup = true;
				}

				if (record.data.status === "waiting_for_player") {
					passiveCcu += 1;
				}
			}

			if (!hasPendingResolution && !hasCompletedToCleanup) {
				const minigame = this.minigameStats.get("Coinflip");
				if (minigame) {
					minigame.current_ccu = passiveCcu;
				}

				this.syncGlobalCoinflips();
				this.lastCoinflipUpdateAt = tick();
				return;
			}
		}

		const now = os.time();
		let payoutEvents = new Array<{ winnerId: string; items: InventoryTuple[]; totalValue: number }>();
		let ccuAfterTick = 0;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_coinflips_tick_update", () =>
			this.globalCoinflipsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCoinflipsState(existingState);
				const nextCoinflips = normalizedState.coinflips ?? {};
				const tickPayouts = new Array<{ winnerId: string; items: InventoryTuple[]; totalValue: number }>();
				let changed = false;
				let ccu = 0;

				for (const [coinflipIdRaw, rawCoinflipRecord] of pairs(nextCoinflips)) {
					const coinflipId = tostring(coinflipIdRaw);
					const record = this.deserializeCoinflipRecord(rawCoinflipRecord);
					if (!record) {
						delete nextCoinflips[coinflipId];
						changed = true;
						continue;
					}

					const shouldManage = this.shouldManageServerScopedRecord(record.data.server_id);

					if (
						shouldManage &&
						record.data.status === "awaiting_confirmation" &&
						record.joinedAt !== undefined &&
						now - record.joinedAt >= 4
					) {
						const player1Value = record.player1Items.reduce((sum, tuple) => {
							const item = this.items.get(tuple[0]);
							return item ? sum + item.value : sum;
						}, 0);

						const player2Value = (record.player2Items ?? []).reduce((sum, tuple) => {
							const item = this.items.get(tuple[0]);
							return item ? sum + item.value : sum;
						}, 0);

						const totalValue = player1Value + player2Value;
						const player1Wins =
							totalValue > 0 ? math.random() * totalValue < player1Value : math.random() < 0.5;

						record.data.winning_coin = player1Wins
							? record.data.player1_coin
							: ((record.data.player1_coin === 1 ? 2 : 1) as 1 | 2);
						record.data.transfer_id = HttpService.GenerateGUID(false);
						record.data.status = "completed";
						record.completedAt = now;

						const winnerId = player1Wins
							? record.data.player1.id
							: (record.data.player2?.id ?? record.data.player1.id);

						tickPayouts.push({
							winnerId,
							items: record.lockedItems.map((tuple) => [tuple[0], tuple[1], tuple[2], tuple[3]]),
							totalValue,
						});
						changed = true;
					}

					if (
						shouldManage &&
						record.data.status === "completed" &&
						record.completedAt !== undefined &&
						now - record.completedAt > 15
					) {
						delete nextCoinflips[coinflipId];
						changed = true;
						continue;
					}

					if (record.data.status === "waiting_for_player") {
						ccu += 1;
					} else if (record.data.status === "awaiting_confirmation") {
						ccu += 2;
					}

					nextCoinflips[coinflipId] = this.serializeCoinflipRecord(record);
				}

				payoutEvents = tickPayouts;
				ccuAfterTick = ccu;

				if (!changed) {
					return $tuple(existingState);
				}

				normalizedState.coinflips = nextCoinflips;
				normalizedState.updated_at = now;
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to tick global coinflips:", err);
			this.syncGlobalCoinflips(true);
			return;
		}

		payoutEvents.forEach((event) => this.queueInventoryGrant(event.winnerId, event.items));

		const minigame = this.minigameStats.get("Coinflip");
		if (minigame) {
			minigame.current_ccu = ccuAfterTick;
			payoutEvents.forEach((event) => {
				minigame.total_games_played += 1;
				minigame.total_spent += event.totalValue;
			});
		}

		this.syncGlobalCoinflips();
		this.lastCoinflipUpdateAt = tick();
	}

	private getCoinflips(): Coinflip[] {
		this.syncGlobalCoinflips();
		const result = new Array<Coinflip>();
		for (const [, record] of this.coinflips) {
			result.push(record.data);
		}
		return result;
	}

	private createCaseBattle(payload: {
		user_id?: number;
		client_seed?: string;
		cases?: string[];
		mode?: CaseBattleData["mode"];
		team_mode?: CaseBattleData["team_mode"];
		fast_mode?: boolean;
		crazy?: boolean;
		server_id?: string;
	}): RouteResponse {
		this.syncGlobalCaseBattles(true);

		const userId = tostring(payload.user_id ?? 0);
		if (userId === "0") return this.fail(400, { status: "error", message: "Invalid user" });
		const selectedCases = payload.cases ?? [];
		if (selectedCases.size() === 0) return this.fail(400, { status: "error", message: "No cases selected" });

		for (const caseId of selectedCases) {
			if (!this.getCaseBattleCaseById(caseId)) {
				return this.fail(400, { status: "error", message: `Invalid case ${caseId}` });
			}
		}

		const identity = this.getUserIdentity(userId);
		const battleId = HttpService.GenerateGUID(false);

		let createdRecord: CaseBattleRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_case_battles_create_update", () =>
			this.globalCaseBattlesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCaseBattlesState(existingState);
				const nextBattles = normalizedState.case_battles ?? {};

				for (const [, rawBattleRecord] of pairs(nextBattles)) {
					const battleRecord = this.deserializeCaseBattleRecord(rawBattleRecord);
					if (!battleRecord) continue;

					if (battleRecord.data.status === "completed") continue;
					if (battleRecord.data.players.find((player) => player.id === userId)) {
						operationCode = 400;
						operationError = "Already in a case battle";
						return $tuple(existingState);
					}
				}

				const now = os.time();
				const battle: CaseBattleData = {
					id: battleId,
					server_id: payload.server_id ?? this.getCurrentServerId(),
					server_seed: HttpService.GenerateGUID(false),
					team_mode: payload.team_mode ?? "1v1",
					crazy: payload.crazy ?? false,
					mode: payload.mode ?? "Standard",
					fast_mode: payload.fast_mode ?? false,
					players: [
						{
							id: userId,
							username: identity.name,
							display_name: identity.display_name,
							position: 1,
							bot: false,
							client_seed: payload.client_seed ?? "",
						},
					],
					cases: selectedCases,
					player_pulls: {
						[userId]: {
							items: [],
							total_value: 0,
						},
					},
					current_spin_data: {
						current_case_index: 0,
						case_id: selectedCases[0],
						progress: "0",
					},
					status: "waiting_for_players",
					created_at: now,
					started_at: 0,
					completed_at: 0,
					updated_at: now,
				};

				createdRecord = { data: battle };
				nextBattles[battleId] = this.serializeCaseBattleRecord(createdRecord);
				normalizedState.case_battles = nextBattles;
				normalizedState.updated_at = now;
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to create global case battle:", err);
			return this.fail(500, { status: "error", message: "Failed to create case battle" });
		}

		if (operationCode !== undefined || !createdRecord) {
			this.recordDataStoreContention("global_case_battles_create_update");
			this.syncGlobalCaseBattles(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to create case battle",
			});
		}

		this.caseBattles.set(battleId, createdRecord);
		return this.ok({ status: "OK", data: createdRecord.data });
	}

	private joinCaseBattle(
		battleId: string,
		payload: { user_id?: number; position?: number; client_seed?: string },
	): RouteResponse {
		this.syncGlobalCaseBattles(true);
		const userId = tostring(payload.user_id ?? 0);
		if (userId === "0") return this.fail(400, { status: "error", message: "Invalid user" });

		let updatedRecord: CaseBattleRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_case_battles_join_update", () =>
			this.globalCaseBattlesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCaseBattlesState(existingState);
				const nextBattles = normalizedState.case_battles ?? {};

				for (const [currentBattleId, rawBattleRecord] of pairs(nextBattles)) {
					if (tostring(currentBattleId) === battleId) continue;
					const battleRecord = this.deserializeCaseBattleRecord(rawBattleRecord);
					if (!battleRecord || battleRecord.data.status === "completed") continue;

					if (battleRecord.data.players.find((player) => player.id === userId)) {
						operationCode = 400;
						operationError = "Already in a case battle";
						return $tuple(existingState);
					}
				}

				const record = this.deserializeCaseBattleRecord(nextBattles[battleId]);
				if (!record) {
					operationCode = 404;
					operationError = "Battle not found";
					return $tuple(existingState);
				}

				if (record.data.status !== "waiting_for_players") {
					operationCode = 400;
					operationError = "Battle is not joinable";
					return $tuple(existingState);
				}

				const requiredPlayers = this.getRequiredPlayers(record.data.team_mode);
				const requestedPosition = payload.position;
				const positionIsValid =
					requestedPosition !== undefined && requestedPosition >= 1 && requestedPosition <= requiredPlayers;

				const targetPosition = positionIsValid
					? requestedPosition
					: table
							.create(requiredPlayers, 0)
							.map((_, index) => index + 1)
							.find(
								(position) =>
									record.data.players.find((player) => player.position === position) === undefined,
							);

				if (!targetPosition) {
					operationCode = 400;
					operationError = "No open battle positions";
					return $tuple(existingState);
				}

				if (record.data.players.find((player) => player.position === targetPosition)) {
					operationCode = 400;
					operationError = "Position already occupied";
					return $tuple(existingState);
				}

				if (record.data.players.find((player) => player.id === userId)) {
					const creatorId = record.data.players[0]?.id;
					if (creatorId !== userId) {
						operationCode = 400;
						operationError = "Already in battle";
						return $tuple(existingState);
					}

					const botId = `BOT_${battleId}_${targetPosition}`;
					record.data.players.push({
						id: botId,
						username: `Bot ${targetPosition}`,
						display_name: "Bot",
						position: targetPosition,
						bot: true,
						client_seed: `${battleId}_BOT_${targetPosition}`,
					});
					record.data.player_pulls[botId] = {
						items: [],
						total_value: 0,
					};
					record.data.updated_at = os.time();

					if (record.data.players.size() >= requiredPlayers) {
						this.completeCaseBattle(record);
					}

					updatedRecord = record;
					nextBattles[battleId] = this.serializeCaseBattleRecord(record);
					normalizedState.case_battles = nextBattles;
					normalizedState.updated_at = os.time();
					return $tuple(normalizedState);
				}

				const identity = this.getUserIdentity(userId);
				record.data.players.push({
					id: userId,
					username: identity.name,
					display_name: identity.display_name,
					position: targetPosition,
					bot: false,
					client_seed: payload.client_seed ?? "",
				});
				record.data.player_pulls[userId] = {
					items: [],
					total_value: 0,
				};
				record.data.updated_at = os.time();

				if (record.data.players.size() >= requiredPlayers) {
					this.completeCaseBattle(record);
				}

				updatedRecord = record;
				nextBattles[battleId] = this.serializeCaseBattleRecord(record);
				normalizedState.case_battles = nextBattles;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to join global case battle:", err);
			return this.fail(500, { status: "error", message: "Failed to join battle" });
		}

		if (operationCode !== undefined || !updatedRecord) {
			this.recordDataStoreContention("global_case_battles_join_update");
			this.syncGlobalCaseBattles(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to join battle",
			});
		}

		this.caseBattles.set(battleId, updatedRecord);
		return this.ok({ status: "OK", data: updatedRecord.data });
	}

	private completeCaseBattle(record: CaseBattleRecord) {
		const battle = record.data;
		battle.status = "in_progress";
		battle.started_at = os.time();
		battle.completed_at = 0;
		record.completedAt = undefined;
		print(
			`[LocalBackend][CaseBattle] Started battle ${battle.id} with ${battle.players.size()} players and ${battle.cases.size()} rounds`,
		);

		const pullData: CaseBattleData["player_pulls"] = {};
		for (const player of battle.players) {
			let totalValue = 0;
			const pulls = new Array<{
				id: number;
				case_index: number;
				roll: string;
				hash: string;
				value: number;
			}>();

			battle.cases.forEach((caseId, caseIndex) => {
				const battleCase = this.getCaseBattleCaseById(caseId);
				if (!battleCase) return;
				const picked = this.pickCaseBattleItem(battleCase);
				if (!picked) return;

				totalValue += picked.value;
				pulls.push({
					id: picked.id,
					case_index: caseIndex,
					roll: tostring(math.random()),
					hash: HttpService.GenerateGUID(false),
					value: picked.value,
				});
			});

			pullData[player.id] = {
				items: pulls,
				total_value: totalValue,
			};
		}

		battle.player_pulls = pullData;

		const totalPotValue = battle.players.reduce((sum, player) => sum + (pullData[player.id]?.total_value ?? 0), 0);
		const teamScores = new Map<number, number>();

		if (battle.mode === "Randomized") {
			const activeTeams = new Set<number>();
			for (const player of battle.players) {
				activeTeams.add(this.getCaseBattleTeamFromPosition(battle.team_mode, player.position));
			}

			for (const team of activeTeams) {
				teamScores.set(team, math.random());
			}
		} else {
			for (const player of battle.players) {
				const team = this.getCaseBattleTeamFromPosition(battle.team_mode, player.position);
				const playerScore = this.getCaseBattlePlayerScoreForMode(battle, player.id, pullData);
				teamScores.set(team, (teamScores.get(team) ?? 0) + playerScore);
			}
		}

		let winners = battle.players;
		if (battle.mode !== "Group") {
			const useCrazy = battle.crazy;
			let winningTeam = this.getCaseBattleTeamFromPosition(battle.team_mode, battle.players[0]?.position ?? 1);
			let winningTeamScore = useCrazy ? math.huge : -math.huge;

			for (const [team, teamScore] of teamScores) {
				if ((!useCrazy && teamScore > winningTeamScore) || (useCrazy && teamScore < winningTeamScore)) {
					winningTeam = team;
					winningTeamScore = teamScore;
				}
			}

			winners = battle.players.filter(
				(player) => this.getCaseBattleTeamFromPosition(battle.team_mode, player.position) === winningTeam,
			);
		}

		const payoutByPlayer = new Map<string, number>();
		if (winners.size() > 0) {
			const splitAmount = math.floor(totalPotValue / winners.size());
			let remaining = totalPotValue;

			winners.forEach((winner, index) => {
				const payout = index === winners.size() - 1 ? remaining : splitAmount;
				payoutByPlayer.set(winner.id, payout);
				remaining -= payout;
			});
		}

		for (const player of battle.players) {
			const resolvedPlayer = pullData[player.id];
			if (!resolvedPlayer) continue;
			resolvedPlayer.total_value = payoutByPlayer.get(player.id) ?? 0;
		}

		record.resolvedPulls = pullData;
		record.resolvedWinners = winners.map((winner) => ({
			player_id: winner.id,
			amount_won: payoutByPlayer.get(winner.id) ?? 0,
		}));
		battle.winners_info = undefined;

		const firstCaseId = battle.cases[0] ?? "";
		if (firstCaseId.size() === 0) {
			battle.status = "completed";
			battle.completed_at = os.time();
			battle.updated_at = battle.completed_at;
			battle.next_step_at = undefined;
			battle.player_pulls = pullData;
			battle.winners_info = record.resolvedWinners;
			record.completedAt = battle.completed_at;
			print(`[LocalBackend][CaseBattle] Completed empty battle ${battle.id}`);
			return;
		}

		const visiblePulls: CaseBattleData["player_pulls"] = {};
		for (const player of battle.players) {
			const firstPull = pullData[player.id]?.items.find((pull) => pull.case_index === 0);
			visiblePulls[player.id] = {
				items: firstPull ? [firstPull] : [],
				total_value: firstPull?.value ?? 0,
			};
		}
		battle.player_pulls = visiblePulls;

		battle.current_spin_data = {
			current_case_index: 0,
			case_id: firstCaseId,
			progress: "1",
		};
		battle.next_step_at = DateTime.now().UnixTimestampMillis + this.getCaseBattleStepDurationMs(battle);
		battle.updated_at = os.time();
		print(
			`[LocalBackend][CaseBattle] Battle ${battle.id} round 1/${battle.cases.size()} opening ${firstCaseId}, next step at ${battle.next_step_at}`,
		);
	}

	private getCaseBattlePlayerScoreForMode(
		battle: CaseBattleData,
		playerId: string,
		pullData: CaseBattleData["player_pulls"],
	) {
		const playerPull = pullData[playerId];
		if (!playerPull) return 0;

		if (battle.mode === "Showdown") {
			const finalCaseIndex = math.max(0, battle.cases.size() - 1);
			return playerPull.items.find((pull) => pull.case_index === finalCaseIndex)?.value ?? 0;
		}

		return playerPull.total_value ?? 0;
	}

	private updateCaseBattles(force = false) {
		if (!force && tick() - this.lastCaseBattleUpdateAt < this.MINIGAME_SYNC_INTERVAL) {
			this.syncGlobalCaseBattles();
			return;
		}

		if (!force) {
			let hasInProgressBattle = false;
			let hasCompletedToCleanup = false;
			let passiveCcu = 0;

			for (const [, record] of this.caseBattles) {
				const shouldManage = this.shouldManageServerScopedRecord(record.data.server_id);

				if (record.data.status !== "completed") {
					passiveCcu += record.data.players.size();
				}

				if (shouldManage && record.data.status === "in_progress") {
					hasInProgressBattle = true;
					break;
				}

				if (shouldManage && record.data.status === "completed" && record.completedAt !== undefined) {
					hasCompletedToCleanup = true;
				}
			}

			if (!hasInProgressBattle && !hasCompletedToCleanup) {
				const minigame = this.minigameStats.get("CaseBattles");
				if (minigame) {
					minigame.current_ccu = passiveCcu;
				}

				this.syncGlobalCaseBattles();
				this.lastCaseBattleUpdateAt = tick();
				return;
			}
		}

		const now = os.time();
		const nowMs = DateTime.now().UnixTimestampMillis;
		let ccuAfterTick = 0;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_case_battles_tick_update", () =>
			this.globalCaseBattlesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCaseBattlesState(existingState);
				const nextBattles = normalizedState.case_battles ?? {};
				let changed = false;
				let ccu = 0;

				for (const [battleIdRaw, rawBattleRecord] of pairs(nextBattles)) {
					const battleId = tostring(battleIdRaw);
					const record = this.deserializeCaseBattleRecord(rawBattleRecord);
					if (!record) {
						delete nextBattles[battleId];
						changed = true;
						continue;
					}

					const shouldManage = this.shouldManageServerScopedRecord(record.data.server_id);

					let stepsRemaining = record.data.cases.size() + 1;
					while (
						stepsRemaining > 0 &&
						shouldManage &&
						record.data.status === "in_progress" &&
						record.data.next_step_at !== undefined &&
						nowMs >= record.data.next_step_at
					) {
						const nextCaseIndex = record.data.current_spin_data.current_case_index + 1;
						if (nextCaseIndex < record.data.cases.size()) {
							const resolvedPulls = record.resolvedPulls;
							if (resolvedPulls) {
								for (const player of record.data.players) {
									const resolvedPlayer = resolvedPulls[player.id];
									if (!resolvedPlayer) continue;

									const nextPull = resolvedPlayer.items.find(
										(pull) => pull.case_index === nextCaseIndex,
									);
									if (!nextPull) continue;

									const currentVisible =
										record.data.player_pulls[player.id] ??
										({
											items: [],
											total_value: 0,
										} as CaseBattleData["player_pulls"][string]);

									if (!currentVisible.items.find((pull) => pull.case_index === nextCaseIndex)) {
										currentVisible.items.push(nextPull);
									}

									currentVisible.total_value = currentVisible.items.reduce(
										(sum, pull) => sum + pull.value,
										0,
									);
									record.data.player_pulls[player.id] = currentVisible;
								}
							}

							record.data.current_spin_data = {
								current_case_index: nextCaseIndex,
								case_id: record.data.cases[nextCaseIndex],
								progress: tostring(nextCaseIndex + 1),
							};
							record.data.next_step_at = nowMs + this.getCaseBattleStepDurationMs(record.data);
							record.data.updated_at = now;
							changed = true;
							print(
								`[LocalBackend][CaseBattle] Battle ${record.data.id} advanced to round ${nextCaseIndex + 1}/${record.data.cases.size()} (${record.data.cases[nextCaseIndex]})`,
							);
						} else {
							record.data.player_pulls = record.resolvedPulls ?? record.data.player_pulls;
							record.data.winners_info = record.resolvedWinners;
							record.data.status = "completed";
							record.data.completed_at = now;
							record.data.updated_at = now;
							record.data.next_step_at = undefined;
							record.completedAt = now;
							changed = true;
							const winnerIds = (record.data.winners_info ?? [])
								.map((winner) => winner.player_id)
								.join(", ");
							print(
								`[LocalBackend][CaseBattle] Battle ${record.data.id} completed with winner(s): ${winnerIds.size() > 0 ? winnerIds : "unknown"}`,
							);
						}

						stepsRemaining -= 1;
					}

					if (
						shouldManage &&
						record.data.status === "completed" &&
						record.completedAt !== undefined &&
						now - record.completedAt > 20
					) {
						delete nextBattles[battleId];
						changed = true;
						continue;
					}

					if (record.data.status !== "completed") {
						ccu += record.data.players.filter((player) => !player.bot).size();
					}

					nextBattles[battleId] = this.serializeCaseBattleRecord(record);
				}

				ccuAfterTick = ccu;

				if (!changed) return $tuple(existingState);

				normalizedState.case_battles = nextBattles;
				normalizedState.updated_at = now;
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to tick global case battles:", err);
			this.syncGlobalCaseBattles(true);
			return;
		}

		const minigame = this.minigameStats.get("CaseBattles");
		if (minigame) {
			minigame.current_ccu = ccuAfterTick;
		}

		this.syncGlobalCaseBattles();
		this.lastCaseBattleUpdateAt = tick();
	}

	private getCaseBattles() {
		this.syncGlobalCaseBattles();
		const battles = new Array<CaseBattleData>();
		for (const [, record] of this.caseBattles) {
			battles.push(record.data);
		}
		return battles;
	}

	private createJackpot(payload: {
		creator?: number;
		server_id?: string;
		value_cap?: unknown;
		value_floor?: number;
		max_players?: number;
		starting_after?: number;
	}): RouteResponse {
		this.syncGlobalJackpots(true);

		const creatorId = tostring(payload.creator ?? 0);
		if (creatorId === "0") return this.fail(400, { status: "error", message: "Invalid creator" });

		const requestedServerId = tostring(payload.server_id ?? this.getCurrentServerId());
		if (requestedServerId === "global") {
			return this.fail(403, {
				status: "error",
				message: "Players cannot create global jackpots",
			});
		}

		const identity = this.getUserIdentity(creatorId);
		const potId = HttpService.GenerateGUID(false);
		let createdRecord: JackpotRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_jackpots_create_update", () =>
			this.globalJackpotsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalJackpotsState(existingState);
				const nextJackpots = normalizedState.jackpots ?? {};

				for (const [, rawJackpotRecord] of pairs(nextJackpots)) {
					const jackpotRecord = this.deserializeJackpotRecord(rawJackpotRecord);
					if (!jackpotRecord || jackpotRecord.data.status === "complete") continue;

					if (jackpotRecord.data.creator.id === creatorId) {
						operationCode = 400;
						operationError = "Already own an active jackpot";
						return $tuple(existingState);
					}
				}

				const now = os.time();
				const startDelay = math.max(5, math.floor(payload.starting_after ?? 15));
				const maxPlayers = math.max(2, math.floor(payload.max_players ?? 8));

				const jackpot: JackpotData = {
					id: potId,
					server_id: requestedServerId,
					server_seed: HttpService.GenerateGUID(false),
					creator: {
						id: creatorId,
						username: identity.name,
						display_name: identity.display_name,
					},
					value_cap: normalizeJackpotValueCap(payload.value_cap, 1000000),
					joinable: true,
					leaveable: false,
					status: "waiting_for_start",
					members: [],
					countdown_end_at: now + startDelay,
					created_at: now,
					updated_at: now,
					auto_start_at: now + startDelay,
					value_floor: math.max(0, math.floor(payload.value_floor ?? 0)),
					max_players: maxPlayers,
					is_system_pot: false,
				};

				createdRecord = {
					data: jackpot,
					lockedByUser: new Map(),
				};

				nextJackpots[potId] = this.serializeJackpotRecord(createdRecord);
				normalizedState.jackpots = nextJackpots;
				normalizedState.updated_at = now;
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to create global jackpot:", err);
			return this.fail(500, { status: "error", message: "Failed to create jackpot" });
		}

		if (operationCode !== undefined || !createdRecord) {
			this.recordDataStoreContention("global_jackpots_create_update");
			this.syncGlobalJackpots(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to create jackpot",
			});
		}

		this.jackpots.set(potId, createdRecord);

		return this.ok({
			status: "OK",
			jackpot_id: potId,
			pot: createdRecord.data,
		});
	}

	private joinJackpot(
		jackpotId: string,
		payload: { user_id?: number; items?: string[]; item_counts?: Record<string, number>; client_seed?: string },
	): RouteResponse {
		this.syncGlobalJackpots(true);

		const userId = tostring(payload.user_id ?? 0);
		if (userId === "0") return this.fail(400, { status: "error", message: "Invalid user" });

		const uaids = payload.items ?? [];
		if (uaids.size() === 0) return this.fail(400, { status: "error", message: "No items provided" });
		let taken = this.takeItemsByUaid(userId, uaids, true);
		const itemCounts = payload.item_counts ?? {};
		if (!taken && this.hasRequestedItemCounts(itemCounts)) {
			taken = this.takeItemsByItemCounts(userId, itemCounts);
		}
		if (!taken) {
			const selectionFailureMessage = this.hasRequestedItemCounts(itemCounts)
				? this.getInventorySelectionFailureMessageByItemCounts(userId, itemCounts)
				: this.getInventorySelectionFailureMessage(userId, uaids);
			return this.fail(400, {
				status: "error",
				message: selectionFailureMessage,
			});
		}

		let updatedRecord: JackpotRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_jackpots_join_update", () =>
			this.globalJackpotsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalJackpotsState(existingState);
				const nextJackpots = normalizedState.jackpots ?? {};

				let joinedActiveJackpots = 0;

				for (const [currentPotId, rawJackpotRecord] of pairs(nextJackpots)) {
					const currentId = tostring(currentPotId);
					const jackpotRecord = this.deserializeJackpotRecord(rawJackpotRecord);
					if (!jackpotRecord || jackpotRecord.data.status === "complete") continue;

					if (
						currentId !== jackpotId &&
						jackpotRecord.data.members.find((member) => member.player.id === userId)
					) {
						joinedActiveJackpots += 1;
					}
				}

				if (joinedActiveJackpots >= this.MAX_ACTIVE_JACKPOT_JOINS_PER_PLAYER) {
					operationCode = 400;
					operationError = "Already in 3 active jackpots";
					return $tuple(existingState);
				}

				const record = this.deserializeJackpotRecord(nextJackpots[jackpotId]);
				if (!record) {
					operationCode = 404;
					operationError = "Jackpot not found";
					return $tuple(existingState);
				}

				if (record.data.status !== "waiting_for_start") {
					operationCode = 400;
					operationError = "Jackpot is not joinable";
					return $tuple(existingState);
				}

				if (record.data.members.find((member) => member.player.id === userId)) {
					operationCode = 400;
					operationError = "Already joined";
					return $tuple(existingState);
				}

				const totalValue = taken.reduce((sum, tuple) => {
					const item = this.items.get(tuple[0]);
					return item ? sum + item.value : sum;
				}, 0);

				if ((record.data.value_floor ?? 0) > 0 && totalValue < (record.data.value_floor ?? 0)) {
					operationCode = 400;
					operationError = "Below minimum value floor";
					return $tuple(existingState);
				}

				if (totalValue > record.data.value_cap) {
					operationCode = 400;
					operationError = "Exceeds jackpot cap";
					return $tuple(existingState);
				}

				if (record.data.max_players !== undefined && record.data.members.size() >= record.data.max_players) {
					operationCode = 400;
					operationError = "Jackpot is full";
					return $tuple(existingState);
				}

				record.lockedByUser.set(userId, taken);
				const identity = this.getUserIdentity(userId);
				record.data.members.push({
					player: {
						id: userId,
						username: identity.name,
						display_name: identity.display_name,
					},
					total_value: totalValue,
					items: this.toItemStrings(taken),
					client_seed: payload.client_seed ?? "",
				});
				record.data.updated_at = os.time();

				if (record.data.auto_start_at === undefined) {
					record.data.auto_start_at = os.time() + this.getJackpotAutoStartDelaySeconds(record.data);
					record.data.countdown_end_at = record.data.auto_start_at;
					print(
						`[LocalBackend][Jackpot] Scheduled auto-start for pot ${record.data.id} at ${record.data.auto_start_at} after first join`,
					);
				}

				record.data.leaveable = this.canLeaveJackpot(record.data, os.time());

				updatedRecord = record;
				nextJackpots[jackpotId] = this.serializeJackpotRecord(record);
				normalizedState.jackpots = nextJackpots;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to join global jackpot:", err);
			this.addItemsToInventory(userId, taken);
			return this.fail(500, { status: "error", message: "Failed to join jackpot" });
		}

		if (operationCode !== undefined || !updatedRecord) {
			this.recordDataStoreContention("global_jackpots_join_update");
			this.addItemsToInventory(userId, taken);
			this.syncGlobalJackpots(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to join jackpot",
			});
		}

		this.jackpots.set(jackpotId, updatedRecord);
		return this.ok({ status: "OK", pot: updatedRecord.data });
	}

	private leaveJackpot(jackpotId: string, userId: string): RouteResponse {
		this.syncGlobalJackpots(true);

		if (userId === "0") return this.fail(400, { status: "error", message: "Invalid user" });

		let updatedRecord: JackpotRecord | undefined;
		let returnedItems: InventoryTuple[] = [];
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_jackpots_leave_update", () =>
			this.globalJackpotsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalJackpotsState(existingState);
				const nextJackpots = normalizedState.jackpots ?? {};
				const record = this.deserializeJackpotRecord(nextJackpots[jackpotId]);
				if (!record) {
					operationCode = 404;
					operationError = "Jackpot not found";
					return $tuple(existingState);
				}

				if (record.data.status !== "waiting_for_start" || !this.canLeaveJackpot(record.data, os.time())) {
					operationCode = 400;
					operationError = "Jackpot is no longer leaveable";
					return $tuple(existingState);
				}

				const memberIndex = record.data.members.findIndex((member) => member.player.id === userId);
				if (memberIndex === -1) {
					operationCode = 400;
					operationError = "Not in jackpot";
					return $tuple(existingState);
				}

				record.data.members.remove(memberIndex + 1);
				returnedItems = record.lockedByUser.get(userId) ?? [];
				record.lockedByUser.delete(userId);

				if (record.data.members.size() === 0) {
					record.data.auto_start_at = undefined;
					record.data.countdown_end_at = os.time() + 999999;
				}

				record.data.leaveable = this.canLeaveJackpot(record.data, os.time());
				record.data.joinable = record.data.status === "waiting_for_start";
				record.data.updated_at = os.time();

				updatedRecord = record;
				nextJackpots[jackpotId] = this.serializeJackpotRecord(record);
				normalizedState.jackpots = nextJackpots;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to leave global jackpot:", err);
			return this.fail(500, { status: "error", message: "Failed to leave jackpot" });
		}

		if (operationCode !== undefined || !updatedRecord) {
			this.recordDataStoreContention("global_jackpots_leave_update");
			this.syncGlobalJackpots(true);
			return this.fail(operationCode ?? 400, {
				status: "error",
				message: operationError ?? "Failed to leave jackpot",
			});
		}

		if (returnedItems.size() > 0) {
			this.addItemsToInventory(userId, returnedItems);
		}

		this.jackpots.set(jackpotId, updatedRecord);
		return this.ok({ status: "OK", pot: updatedRecord.data });
	}

	private updateJackpots(force = false) {
		if (!force && tick() - this.lastJackpotUpdateAt < this.MINIGAME_SYNC_INTERVAL) {
			this.syncGlobalJackpots();
			return;
		}

		if (!force) {
			let hasActivePot = false;
			let hasCompletedToCleanup = false;
			let passiveCcu = 0;
			const currentServerId = this.getCurrentServerId();

			for (const [, record] of this.jackpots) {
				const shouldManage = this.shouldManageJackpotRecord(record);
				if (record.data.status !== "complete") passiveCcu += record.data.members.size();
				if (
					shouldManage &&
					(
						record.data.status === "in_progress" ||
						(
							record.data.status === "waiting_for_start" && record.data.members.size() >=1
						)
					)
				) {
					hasActivePot = true;
					break;
				}

				if (shouldManage && record.data.status === "complete" && record.completedAt !== undefined) {
					hasCompletedToCleanup = true;
				}
			}

			// Check if any system/global pots are missing
			{
				const missingSystemPot = ([50000, 250000, 1000000, JACKPOT_INFINITY_VALUE_CAP] as const).some((cap) => {
					for (const [, r] of this.jackpots) {
						const matches =
							r.data.is_system_pot &&
							r.data.server_id === currentServerId &&
							r.data.value_cap === cap &&
							r.data.status !== "complete";

						if (matches) {
							return false;
						}
					}

					return true;
				});

				if (!hasActivePot && !missingSystemPot && !hasCompletedToCleanup) {
					const minigame = this.minigameStats.get("Jackpot");
					if (minigame) minigame.current_ccu = passiveCcu;
					this.syncGlobalJackpots();
					this.lastJackpotUpdateAt = tick();
					return;
				}
			}
		}

		const now = os.time();
		let payoutEvents = new Array<{ winnerId: string; items: InventoryTuple[] }>();
		let ccuAfterTick = 0;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_jackpots_tick_update", () =>
			this.globalJackpotsStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalJackpotsState(existingState);
				const nextJackpots = normalizedState.jackpots ?? {};
				let changed = this.ensureDesiredJackpots(nextJackpots);
				const tickPayouts = new Array<{ winnerId: string; items: InventoryTuple[] }>();
				const activeJackpotPlayers = new Set<string>();

				for (const [potIdRaw, rawJackpotRecord] of pairs(nextJackpots)) {
					const potId = tostring(potIdRaw);
					const record = this.deserializeJackpotRecord(rawJackpotRecord);
					if (!record) {
						delete nextJackpots[potId];
						changed = true;
						continue;
					}

					const shouldManage = this.shouldManageJackpotRecord(record);

					if (shouldManage && record.data.server_id === "global" && (record.data.value_floor ?? 0) > 0) {
						record.data.value_floor = 0;
						record.data.updated_at = now;
						changed = true;
					}

					if (
						shouldManage &&
						record.data.status === "waiting_for_start" &&
						record.data.members.size() >= 1 &&
						record.data.auto_start_at === undefined
					) {
						record.data.auto_start_at = now + this.getJackpotAutoStartDelaySeconds(record.data);
						record.data.countdown_end_at = record.data.auto_start_at;
						record.data.updated_at = now;
						changed = true;
						print(
							`[LocalBackend][Jackpot] Backfilled auto-start for pot ${record.data.id} at ${record.data.auto_start_at}`,
						);
					}

					const startAt = record.data.auto_start_at ?? record.data.countdown_end_at;
					if (
						shouldManage &&
						record.data.status === "waiting_for_start" &&
						startAt !== undefined &&
						now >= startAt &&
						record.data.members.size() >= 1
					) {
						record.data.status = "in_progress";
						record.inProgressAt = now;
						record.data.updated_at = now;
						changed = true;
						print(
							`[LocalBackend][Jackpot] Pot ${record.data.id} moved to in_progress with ${record.data.members.size()} members`,
						);
					}

					if (
						shouldManage &&
						record.data.status === "in_progress" &&
						record.inProgressAt !== undefined &&
						now - record.inProgressAt >= 4
					) {
						const winnerId = this.chooseWeightedWinner(record.data.members);
						if (winnerId) {
							const winnerIdentity = this.getUserIdentity(winnerId);
							record.data.winning_data = {
								player: {
									id: winnerId,
									username: winnerIdentity.name,
									display_name: winnerIdentity.display_name,
								},
							};

							const allLocked = new Array<InventoryTuple>();
							record.lockedByUser.forEach((tuples) => {
								tuples.forEach((tuple) => allLocked.push([tuple[0], tuple[1], tuple[2], tuple[3]]));
							});

							if (allLocked.size() > 0) {
								tickPayouts.push({ winnerId, items: allLocked });
							}
						}

						record.data.status = "complete";
						record.completedAt = now;
						record.data.updated_at = now;
						changed = true;
						print(
							`[LocalBackend][Jackpot] Pot ${record.data.id} completed with winner ${record.data.winning_data?.player.id ?? "unknown"}`,
						);
					}

					record.data.joinable = record.data.status === "waiting_for_start";
					record.data.leaveable = this.canLeaveJackpot(record.data, now);

					if (
						shouldManage &&
						record.data.status === "complete" &&
						record.completedAt !== undefined &&
						now - record.completedAt > 20
					) {
						delete nextJackpots[potId];
						changed = true;
						continue;
					}

					if (record.data.status !== "complete") {
						for (const member of record.data.members) {
							activeJackpotPlayers.add(member.player.id);
						}
					}

					nextJackpots[potId] = this.serializeJackpotRecord(record);
				}

				payoutEvents = tickPayouts;
				ccuAfterTick = activeJackpotPlayers.size();

				if (!changed) return $tuple(existingState);

				normalizedState.jackpots = nextJackpots;
				normalizedState.updated_at = now;
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to tick global jackpots:", err);
			this.syncGlobalJackpots(true);
			return;
		}

		payoutEvents.forEach((event) => this.queueInventoryGrant(event.winnerId, event.items));

		const minigame = this.minigameStats.get("Jackpot");
		if (minigame) {
			minigame.current_ccu = ccuAfterTick;
		}

		this.syncGlobalJackpots();
		this.lastJackpotUpdateAt = tick();
	}

	private getJackpots() {
		this.syncGlobalJackpots();
		const currentServerId = this.getCurrentServerId();
		const pots = new Array<JackpotData>();
		for (const [, record] of this.jackpots) {
			const isGlobalSystemPot = record.data.is_system_pot === true && record.data.server_id === "global";
			const isLocalSystemPot = record.data.is_system_pot === true && record.data.server_id === currentServerId;
			if (record.data.is_system_pot === true && !isGlobalSystemPot && !isLocalSystemPot) {
				continue;
			}

			const normalizedCap = normalizeJackpotValueCap(
				record.data.value_cap,
				record.data.creator.id === "0" ? 1000000 : JACKPOT_INFINITY_VALUE_CAP,
			);
			if (record.data.value_cap !== normalizedCap) {
				record.data.value_cap = normalizedCap;
				record.data.updated_at = os.time();
			}
			pots.push(record.data);
		}
		return pots;
	}

	private createSystemJackpotRecord(
		valueCap: number,
		valueFloor = 0,
		scope: "system" | "global" = "system",
		serverId?: string,
	) {
		const now = os.time();
		const resolvedServerId = scope === "global" ? "global" : (serverId ?? this.getCurrentServerId());
		const id = `${scope}_${resolvedServerId}_${valueCap}_${HttpService.GenerateGUID(false)}`;
		const jackpot: JackpotData = {
			id,
			server_id: resolvedServerId,
			server_seed: HttpService.GenerateGUID(false),
			creator: {
				id: "0",
				username: "System",
				display_name: "System",
			},
			value_cap: valueCap,
			joinable: true,
			leaveable: false,
			status: "waiting_for_start",
			members: [],
			countdown_end_at: now + 999999,
			created_at: now,
			updated_at: now,
			value_floor: valueFloor,
			max_players: scope === "global" ? 64 : 32,
			is_system_pot: true,
		};

		return {
			data: jackpot,
			lockedByUser: new Map<string, InventoryTuple[]>(),
		} as JackpotRecord;
	}

	private ensureDesiredJackpots(nextJackpots: Record<string, PersistedJackpotRecord>) {
		let changed = false;
		const currentServerId = this.getCurrentServerId();
		const ensurePot = (scope: "system" | "global", valueCap: number, valueFloor: number) => {
			let hasPot = false;
			for (const [, rawJackpotRecord] of pairs(nextJackpots)) {
				const jackpotRecord = this.deserializeJackpotRecord(rawJackpotRecord);
				if (!jackpotRecord) continue;

				let matchesScope = false;
				if (scope === "global") {
					matchesScope = jackpotRecord.data.server_id === "global";
				} else {
					matchesScope =
						jackpotRecord.data.is_system_pot === true && jackpotRecord.data.server_id === currentServerId;
				}

				if (
					matchesScope &&
					jackpotRecord.data.value_cap === valueCap &&
					jackpotRecord.data.status !== "complete"
				) {
					hasPot = true;
					break;
				}
			}

			if (hasPot) return;

			const created = this.createSystemJackpotRecord(valueCap, valueFloor, scope, currentServerId);
			nextJackpots[created.data.id] = this.serializeJackpotRecord(created);
			changed = true;
		};

		const systemPots = [
			[50000, 0],
			[250000, 0],
			[1000000, 10000],
			[JACKPOT_INFINITY_VALUE_CAP, 0],
		] as const;

		const globalPots = [
			[500000, 0],
			[2000000, 0],
			[10000000, 0],
			[JACKPOT_INFINITY_VALUE_CAP, 0],
		] as const;

		systemPots.forEach(([valueCap, valueFloor]) => ensurePot("system", valueCap, valueFloor));
		globalPots.forEach(([valueCap, valueFloor]) => ensurePot("global", valueCap, valueFloor));

		return changed;
	}

	private createTrade(payload: {
		initiator_id?: string;
		receiver_id?: string;
		initiator_items?: string[];
		receiver_items?: string[];
		initiator_item_counts?: Record<string, number>;
		receiver_item_counts?: Record<string, number>;
	}): RouteResponse {
		this.syncGlobalTrades(true);

		const initiatorId = payload.initiator_id ?? "";
		const receiverId = payload.receiver_id ?? "";
		if (initiatorId.size() === 0 || receiverId.size() === 0) {
			return this.fail(400, { status: "error", error: "Missing participants" });
		}

		const initiatorItems = payload.initiator_items ?? [];
		const receiverItems = payload.receiver_items ?? [];
		const initiatorItemCounts = this.normalizeRequestedItemCounts(payload.initiator_item_counts);
		const receiverItemCounts = this.normalizeRequestedItemCounts(payload.receiver_item_counts);
		if (initiatorItems.size() === 0 || receiverItems.size() === 0) {
			return this.fail(400, { status: "error", error: "Invalid trade payload" });
		}

		let initiatorTaken = this.takeItemsByUaid(initiatorId, initiatorItems);
		if (!initiatorTaken && this.hasRequestedItemCounts(initiatorItemCounts)) {
			initiatorTaken = this.takeItemsByItemCounts(initiatorId, initiatorItemCounts);
		}
		if (!initiatorTaken) {
			return this.fail(400, {
				status: "error",
				error: this.hasRequestedItemCounts(initiatorItemCounts)
					? this.getInventorySelectionFailureMessageByItemCounts(initiatorId, initiatorItemCounts)
					: "Initiator items unavailable",
			});
		}

		let receiverTaken = this.takeItemsByUaid(receiverId, receiverItems);
		if (!receiverTaken && this.hasRequestedItemCounts(receiverItemCounts)) {
			receiverTaken = this.takeItemsByItemCounts(receiverId, receiverItemCounts);
		}
		if (!receiverTaken) {
			this.addItemsToInventory(initiatorId, initiatorTaken);
			return this.fail(400, {
				status: "error",
				error: this.hasRequestedItemCounts(receiverItemCounts)
					? this.getInventorySelectionFailureMessageByItemCounts(receiverId, receiverItemCounts)
					: "Receiver items unavailable",
			});
		}

		const initiatorIdentity = this.getUserIdentity(initiatorId);
		const receiverIdentity = this.getUserIdentity(receiverId);

		let createdTradeRecord: TradeRecord | undefined;
		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_trades_create_update", () =>
			this.globalTradesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalTradesState(existingState);
				const tradeId = math.max(1, math.floor(normalizedState.next_trade_id ?? this.nextTradeId));

				const now = this.nowIso();
				const trade: Trade = {
					trade_id: tradeId,
					initiator: {
						user_id: initiatorId,
						username: initiatorIdentity.name,
						display_name: initiatorIdentity.display_name,
						items: this.toItemStrings(initiatorTaken),
					},
					receiver: {
						user_id: receiverId,
						username: receiverIdentity.name,
						display_name: receiverIdentity.display_name,
						items: this.toItemStrings(receiverTaken),
					},
					status: "pending",
					created_at: now,
					updated_at: now,
					transfer_id: undefined,
				};

				createdTradeRecord = {
					data: trade,
					initiatorItems: initiatorTaken,
					receiverItems: receiverTaken,
				};

				normalizedState.trades![tostring(tradeId)] = this.serializeTradeRecord(createdTradeRecord);
				normalizedState.next_trade_id = tradeId + 1;
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success || !createdTradeRecord) {
			if (!success) warn("[LocalBackend] Failed to create global trade:", err);
			this.addItemsToInventory(initiatorId, initiatorTaken);
			this.addItemsToInventory(receiverId, receiverTaken);
			return this.fail(500, { status: "error", error: "Failed to create trade" });
		}

		const tradeId = createdTradeRecord.data.trade_id;
		this.nextTradeId = math.max(this.nextTradeId, tradeId + 1);
		this.trades.set(tradeId, createdTradeRecord);

		return this.ok({
			status: "OK",
			data: createdTradeRecord.data,
		});
	}

	private acceptTrade(tradeId: number): RouteResponse {
		let acceptedTradeRecord: TradeRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_trades_accept_update", () =>
			this.globalTradesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalTradesState(existingState);
				const tradeRecord = this.deserializeTradeRecord(normalizedState.trades?.[tostring(tradeId)]);
				if (!tradeRecord) {
					operationCode = 404;
					operationError = "Trade not found";
					return $tuple(existingState);
				}

				if (tradeRecord.data.status !== "pending") {
					operationCode = 400;
					operationError = "Trade is not pending";
					return $tuple(existingState);
				}

				tradeRecord.data.status = "accepted";
				tradeRecord.data.updated_at = this.nowIso();
				tradeRecord.data.transfer_id = HttpService.GenerateGUID(false);

				acceptedTradeRecord = tradeRecord;
				normalizedState.trades![tostring(tradeId)] = this.serializeTradeRecord(tradeRecord);
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to accept global trade:", err);
			return this.fail(500, { status: "error", error: "Failed to accept trade" });
		}

		if (operationCode !== undefined || !acceptedTradeRecord) {
			this.recordDataStoreContention("global_trades_accept_update");
			this.syncGlobalTrades(true);
			return this.fail(operationCode ?? 404, {
				status: "error",
				error: operationError ?? "Trade not found",
			});
		}

		this.addItemsToInventory(acceptedTradeRecord.data.initiator.user_id, acceptedTradeRecord.receiverItems);
		this.addItemsToInventory(acceptedTradeRecord.data.receiver.user_id, acceptedTradeRecord.initiatorItems);
		this.trades.set(tradeId, acceptedTradeRecord);

		return this.ok({
			status: "OK",
			tradeStatus: "accepted",
		});
	}

	private cancelTrade(tradeId: number): RouteResponse {
		let cancelledTradeRecord: TradeRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_trades_cancel_update", () =>
			this.globalTradesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalTradesState(existingState);
				const tradeRecord = this.deserializeTradeRecord(normalizedState.trades?.[tostring(tradeId)]);
				if (!tradeRecord) {
					operationCode = 404;
					operationError = "Trade not found";
					return $tuple(existingState);
				}

				if (tradeRecord.data.status !== "pending") {
					operationCode = 400;
					operationError = "Trade is not pending";
					return $tuple(existingState);
				}

				tradeRecord.data.status = "cancelled";
				tradeRecord.data.updated_at = this.nowIso();

				cancelledTradeRecord = tradeRecord;
				normalizedState.trades![tostring(tradeId)] = this.serializeTradeRecord(tradeRecord);
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to cancel global trade:", err);
			return this.fail(500, { status: "error", error: "Failed to cancel trade" });
		}

		if (operationCode !== undefined || !cancelledTradeRecord) {
			this.recordDataStoreContention("global_trades_cancel_update");
			this.syncGlobalTrades(true);
			return this.fail(operationCode ?? 404, {
				status: "error",
				error: operationError ?? "Trade not found",
			});
		}

		this.addItemsToInventory(cancelledTradeRecord.data.initiator.user_id, cancelledTradeRecord.initiatorItems);
		this.addItemsToInventory(cancelledTradeRecord.data.receiver.user_id, cancelledTradeRecord.receiverItems);
		this.trades.set(tradeId, cancelledTradeRecord);

		return this.ok({
			status: "OK",
			tradeStatus: "cancelled",
		});
	}

	private getTradesForUsers(playerIdsCsv: string): Trade[] {
		this.syncGlobalTrades();
		const ids = new Set(playerIdsCsv.split(",").filter((id) => id.size() > 0));
		const trades = new Array<Trade>();
		for (const [, record] of this.trades) {
			if (
				ids.has(record.data.initiator.user_id) ||
				ids.has(record.data.receiver.user_id) ||
				record.data.status === "pending"
			) {
				trades.push(record.data);
			}
		}
		return trades;
	}

	private registerUser(
		userId: string,
		payload: { name?: string; display_name?: string; country?: string },
	): RouteResponse {
		if (!this.isRobloxUserId(userId)) return this.fail(400, { status: "error", error: "Missing user id" });
		this.loadUserState(userId);
		const user = this.ensureUser(userId, payload.name, payload.display_name, payload.country);
		const nowIso = this.nowIso();
		user.updated_at = nowIso;
		user.last_seen_at = nowIso;
		this.markDirty(userId);

		return this.ok({ status: "OK" });
	}

	private updateUserSnapshot(entry: Record<string, unknown>) {
		const userId = tostring(entry.user_id ?? "");
		if (!this.isRobloxUserId(userId)) return;
		this.loadUserState(userId);
		const name = tostring(entry.name ?? `Player${userId}`);
		const displayName = tostring(entry.display_name ?? name);
		const user = this.ensureUser(userId, name, displayName);
		const nowIso = this.nowIso();
		user.updated_at = nowIso;
		user.last_seen_at = nowIso;

		if (typeIs(entry.current_cash, "number")) user.current_cash = entry.current_cash;
		if (typeIs(entry.current_cash, "string")) {
			user.current_cash = this.toNumber(entry.current_cash, user.current_cash);
		}
		if (typeIs(entry.current_value, "number")) user.current_value = entry.current_value;
		if (typeIs(entry.current_value, "string"))
			user.current_value = this.toNumber(entry.current_value, user.current_value);

		if (typeIs(entry.recent_activity, "table")) {
			user.recent_activity = (entry.recent_activity as { image: string; text: string }[]).map((activity) => ({
				image: tostring(activity.image),
				text: tostring(activity.text),
			}));
		}

		if (typeIs(entry.total_cash_earned, "number")) user.statistics.total_cash_earned = entry.total_cash_earned;
		if (typeIs(entry.total_cash_spent, "number")) user.statistics.total_cash_spent = entry.total_cash_spent;
		if (typeIs(entry.win_rate, "number")) user.statistics.win_rate = entry.win_rate;
		if (typeIs(entry.biggest_win, "number")) user.statistics.biggest_win = entry.biggest_win;
		if (typeIs(entry.total_plays, "number")) user.statistics.total_plays = entry.total_plays;
		if (typeIs(entry.favourite_mode, "string")) user.statistics.favourite_mode = entry.favourite_mode;
		if (typeIs(entry.time_played, "number")) user.statistics.time_played = entry.time_played;
		if (typeIs(entry.xp, "number")) user.statistics.xp = entry.xp;

		this.markDirty(userId);
	}

	private getUserInformation(userId: string): RouteResponse {
		this.loadUserState(userId);
		const user = this.users.get(userId);
		if (!user) return this.fail(404, { status: "error", error: "User not found" });

		return this.ok({
			status: "OK",
			data: {
				data: {
					user_id: user.user_id,
					created_at: user.created_at,
					updated_at: user.updated_at,
					name: user.name,
					display_name: user.display_name,
					statistics: user.statistics,
					current_cash: tostring(user.current_cash),
				},
				recent_activity: user.recent_activity,
			},
		});
	}

	private parseIsoDateToUnixTimestamp(isoDate: string): number | undefined {
		if (isoDate.size() === 0 || isoDate === "nil") return undefined;

		const [success, parsedDate] = pcall(() => DateTime.fromIsoDate(isoDate)) as LuaTuple<
			[boolean, DateTime | undefined]
		>;
		if (!success || !parsedDate) return undefined;
		return parsedDate.UnixTimestamp;
	}

	private isUserActiveInGame(userId: string): boolean {
		if (!this.isRobloxUserId(userId)) return false;

		const userIdNumber = this.toNumber(userId, 0);
		if (userIdNumber > 0 && Players.GetPlayerByUserId(userIdNumber)) return true;

		if (tick() - this.lastUserActivitySyncAt >= this.USER_ACTIVITY_SYNC_INTERVAL) {
			this.syncGlobalUsers();
			this.lastUserActivitySyncAt = tick();
		}

		const globalUser = this.globalUsers.get(userId);
		if (!globalUser) return false;

		const lastSeenAt = tostring(globalUser.last_seen_at ?? "");
		const lastSeenUnix = this.parseIsoDateToUnixTimestamp(lastSeenAt);
		if (lastSeenUnix === undefined) return false;

		const now = DateTime.now().UnixTimestamp;
		if (now - lastSeenUnix <= this.ACTIVE_USER_WINDOW_SECONDS) return true;

		return false;
	}

	private searchUsers(query: Record<string, string>): RouteResponse {
		this.ensureActivePlayersLoaded();
		this.syncGlobalUsers();

		const rawKeywords = query.keywords ?? "";
		const keywords = rawKeywords.lower();
		const sort = query.sort ?? "value_high";
		const limit = math.max(1, math.floor(this.toNumber(query.limit, 25)));

		const usersById = new Map<string, LocalUser>();
		for (const [userId, user] of this.globalUsers) {
			if (!this.isRobloxUserId(userId)) continue;
			usersById.set(userId, this.normalizeLocalUserSnapshot(userId, user));
		}
		for (const [userId, user] of this.users) {
			if (!this.isRobloxUserId(userId)) continue;
			usersById.set(userId, this.normalizeLocalUserSnapshot(userId, user));
		}

		const allUsers = new Array<{
			id: string;
			name: string;
			display_name: string;
			current_cash: number;
			current_value: number;
		}>();

		for (const [, user] of usersById) {
			const nameMatch = user.name.lower().find(keywords);
			const displayMatch = user.display_name.lower().find(keywords);
			if (keywords.size() > 0 && nameMatch === undefined && displayMatch === undefined) {
				continue;
			}

			allUsers.push({
				id: user.user_id,
				name: user.name,
				display_name: user.display_name,
				current_cash: user.current_cash,
				current_value: user.current_value,
			});
		}

		const globalUser = this.tryResolveRobloxUserByName(rawKeywords);
		if (globalUser && !allUsers.find((user) => user.id === globalUser.id)) {
			allUsers.push(globalUser);
		}

		switch (sort) {
			case "value_low":
				allUsers.sort((a, b) => a.current_value < b.current_value);
				break;
			case "name_a-z":
				allUsers.sort((a, b) => a.name.lower() < b.name.lower());
				break;
			case "name_z-a":
				allUsers.sort((a, b) => a.name.lower() > b.name.lower());
				break;
			case "value_high":
			default:
				allUsers.sort((a, b) => a.current_value > b.current_value);
				break;
		}

		return this.ok({
			status: "OK",
			results: allUsers.filter((_, index) => index < limit),
		});
	}

	private tryResolveRobloxUserByName(nameQuery: string) {
		const trimmed = nameQuery.gsub("^%s*(.-)%s*$", "%1")[0];
		if (trimmed.size() < 3) return undefined;

		const [userIdSuccess, resolvedUserId] = pcall(() => Players.GetUserIdFromNameAsync(trimmed)) as LuaTuple<
			[boolean, unknown]
		>;
		if (!userIdSuccess || !typeIs(resolvedUserId, "number")) return undefined;

		const [nameSuccess, resolvedName] = pcall(() => Players.GetNameFromUserIdAsync(resolvedUserId)) as LuaTuple<
			[boolean, unknown]
		>;
		const canonicalName =
			nameSuccess && typeIs(resolvedName, "string") && resolvedName.size() > 0 ? resolvedName : trimmed;

		const userId = tostring(resolvedUserId);
		const existingUser = this.users.get(userId);
		if (existingUser) {
			return {
				id: existingUser.user_id,
				name: existingUser.name,
				display_name: existingUser.display_name,
				current_cash: existingUser.current_cash,
				current_value: existingUser.current_value,
			};
		}

		return {
			id: userId,
			name: canonicalName,
			display_name: canonicalName,
			current_cash: 0,
			current_value: 0,
		};
	}

	private addItem(userId: string, itemId: string): RouteResponse {
		if (userId.size() === 0) return this.fail(400, { status: "error", error: "Missing user id" });
		if (!this.items.has(itemId)) return this.fail(404, { status: "error", error: "Invalid item id" });
		const added = this.addInventoryItem(userId, itemId);
		if (!added) {
			return this.fail(503, {
				status: "error",
				error: "Inventory mint is temporarily unavailable. Try again.",
			});
		}
		return this.ok({
			status: "OK",
			user_asset_id: added[1],
		});
	}

	private wipeUserProfile(userId: string): RouteResponse {
		if (!this.isRobloxUserId(userId)) return this.fail(400, { status: "error", error: "Missing user id" });
		this.loadUserState(userId);
		const existing = this.users.get(userId);
		const reset = this.createDefaultUser(userId);
		if (existing) {
			reset.name = existing.name;
			reset.display_name = existing.display_name;
			reset.country = existing.country;
		}
		reset.updated_at = this.nowIso();
		this.users.set(userId, reset);
		this.inventories.set(userId, []);
		this.pendingInventoryGrants.delete(userId);
		this.pendingCashChanges.delete(userId);
		this.recalculateUserValue(userId);
		this.markDirty(userId);
		return this.ok({ status: "OK" });
	}

	private listItem(uaid: string, price?: number): RouteResponse {
		this.syncGlobalMarketplace(true);

		if (price === undefined) {
			let removedRecord: ListingRecord | undefined;
			let operationError: string | undefined;

			const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_marketplace_unlist_update", () =>
				this.globalMarketplaceStore.UpdateAsync("global", (existingState) => {
					const normalizedState = this.normalizeGlobalMarketplaceState(existingState);
					const currentRecord = this.deserializeListingRecord(normalizedState.listings?.[uaid]);
					if (!currentRecord) {
						operationError = "No listing found";
						return $tuple(existingState);
					}

					removedRecord = currentRecord;
					delete normalizedState.listings?.[uaid];
					normalizedState.updated_at = os.time();
					return $tuple(normalizedState);
				}),
			);

			if (!success) {
				warn("[LocalBackend] Failed to unlist item globally:", err);
				return this.fail(500, { status: "error", error: "Failed to unlist item" });
			}

			if (operationError || !removedRecord) {
				this.recordDataStoreContention("global_marketplace_unlist_update");
				this.syncGlobalMarketplace(true);
				return this.fail(404, { status: "error", error: "No listing found" });
			}

			this.listings.delete(uaid);
			this.addItemsToInventory(removedRecord.listing.seller_id, [removedRecord.itemTuple]);
			return this.ok({ status: "OK" });
		}

		if (price <= 0) {
			return this.fail(400, { status: "error", error: "Invalid price" });
		}

		const listingPrice = math.floor(price);
		const existing = this.listings.get(uaid);
		if (existing) {
			let wasUpdated = false;

			const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_marketplace_reprice_update", () =>
				this.globalMarketplaceStore.UpdateAsync("global", (existingState) => {
					const normalizedState = this.normalizeGlobalMarketplaceState(existingState);
					const target = this.deserializeListingRecord(normalizedState.listings?.[uaid]);
					if (!target) {
						return $tuple(existingState);
					}

					target.listing.price = tostring(listingPrice);
					target.listing.expires_at = undefined;
					normalizedState.listings![uaid] = this.serializeListingRecord(target);
					normalizedState.updated_at = os.time();
					wasUpdated = true;
					return $tuple(normalizedState);
				}),
			);

			if (!success) {
				warn("[LocalBackend] Failed to update listing globally:", err);
				return this.fail(500, { status: "error", error: "Failed to update listing" });
			}

			if (!wasUpdated) {
				this.recordDataStoreContention("global_marketplace_reprice_update");
				this.syncGlobalMarketplace(true);
				return this.fail(404, { status: "error", error: "No listing found" });
			}

			existing.listing.price = tostring(listingPrice);
			existing.listing.expires_at = undefined;
			this.listings.set(uaid, existing);
			return this.ok({ status: "OK" });
		}

		const lookup = this.findOwnerByUaid(uaid);
		if (!lookup) return this.fail(404, { status: "error", error: "Item not found" });

		const ownerId = lookup[0];
		const tuple = lookup[1];
		const item = this.items.get(tuple[0]);
		if (!item) return this.fail(404, { status: "error", error: "Item not found" });

		const listingUaid = tostring(tuple[1]);
		const takenTuple = this.takeExactInventoryTupleForListing(ownerId, tuple, uaid);
		if (!takenTuple) return this.fail(404, { status: "error", error: "Item unavailable" });
		const taken = [takenTuple];

		const seller = this.getUserIdentity(ownerId);
		const listing: ItemListing = {
			user_asset_id: listingUaid,
			seller_id: ownerId,
			currency: "Cash",
			created_at: this.nowIso(),
			expires_at: undefined,
			price: tostring(listingPrice),
			item_id: item.id,
			username: seller.name,
			display_name: seller.display_name,
		};

		const listingRecord: ListingRecord = {
			listing,
			itemTuple: taken[0],
		};

		let wasCreated = false;
		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_marketplace_create_update", () =>
			this.globalMarketplaceStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalMarketplaceState(existingState);
				if (this.deserializeListingRecord(normalizedState.listings?.[listingUaid])) {
					return $tuple(existingState);
				}

				normalizedState.listings![listingUaid] = this.serializeListingRecord(listingRecord);
				normalizedState.updated_at = os.time();
				wasCreated = true;
				return $tuple(normalizedState);
			}),
		);

		if (!success || !wasCreated) {
			if (!success) warn("[LocalBackend] Failed to create listing globally:", err);
			if (success && !wasCreated) this.recordDataStoreContention("global_marketplace_create_update");
			this.addItemsToInventory(ownerId, taken);
			this.syncGlobalMarketplace(true);
			return this.fail(400, { status: "error", error: "Item unavailable" });
		}

		this.listings.set(listingUaid, listingRecord);
		return this.ok({ status: "OK" });
	}

	private buyItem(uaid: string, buyerId: string): RouteResponse {
		if (buyerId.size() === 0) return this.fail(400, { status: "error", error: "Invalid buyer" });

		let purchasedRecord: ListingRecord | undefined;
		let operationCode: number | undefined;
		let operationError: string | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_marketplace_buy_update", () =>
			this.globalMarketplaceStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalMarketplaceState(existingState);
				const listingRecord = this.deserializeListingRecord(normalizedState.listings?.[uaid]);
				if (!listingRecord) {
					operationCode = 404;
					operationError = "Listing not found";
					return $tuple(existingState);
				}

				if (listingRecord.listing.seller_id === buyerId) {
					operationCode = 400;
					operationError = "Cannot buy your own listing";
					return $tuple(existingState);
				}

				purchasedRecord = listingRecord;
				delete normalizedState.listings?.[uaid];
				normalizedState.updated_at = os.time();
				return $tuple(normalizedState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to purchase listing globally:", err);
			return this.fail(500, { status: "error", error: "Failed to purchase listing" });
		}

		if (operationCode !== undefined || !purchasedRecord) {
			this.recordDataStoreContention("global_marketplace_buy_update");
			this.syncGlobalMarketplace(true);
			return this.fail(operationCode ?? 404, {
				status: "error",
				error: operationError ?? "Listing not found",
			});
		}

		this.listings.delete(uaid);
		this.addItemsToInventory(buyerId, [purchasedRecord.itemTuple]);
		this.queueCashChange(purchasedRecord.listing.seller_id, this.toNumber(purchasedRecord.listing.price, 0) * 0.7);

		return this.ok({
			success: true,
		});
	}

	private getAllListings() {
		this.syncGlobalMarketplace();
		const listings = new Array<ItemListing>();
		for (const [, record] of this.listings) listings.push(record.listing);
		return listings;
	}

	private getAllItems(): Item[] {
		this.syncGlobalMarketplace();
		const all = new Array<Item>();
		for (const [itemId] of this.items) {
			const item = this.getItemSnapshot(itemId);
			if (item) all.push(item);
		}
		return all;
	}

	private getItemMonitoringSignature(item: Item) {
		return `${item.total_unboxed}|${item.maximum_copies}|${item.average_price}|${item.value}|${item.updated_at}`;
	}

	private primeMonitoredItemSignatures(items: Item[]) {
		items.forEach((item) => {
			this.monitoredMarketplaceSignatures.set(item.id, this.getItemMonitoringSignature(item));
		});
	}

	private getMonitoredItemUpdates(): Item[] {
		const snapshots = this.getAllItems();
		const changed = new Array<Item>();
		const currentIds = new Set<string>();

		snapshots.forEach((item) => {
			currentIds.add(item.id);
			const nextSignature = this.getItemMonitoringSignature(item);
			const previousSignature = this.monitoredMarketplaceSignatures.get(item.id);
			if (previousSignature === undefined || previousSignature !== nextSignature) {
				changed.push(item);
			}
			this.monitoredMarketplaceSignatures.set(item.id, nextSignature);
		});

		for (const [itemId] of this.monitoredMarketplaceSignatures) {
			if (!currentIds.has(itemId)) {
				this.monitoredMarketplaceSignatures.delete(itemId);
			}
		}

		return changed;
	}

	private getItemSnapshot(itemId: string): Item | undefined {
		const item = this.items.get(itemId);
		if (!item) return undefined;

		const liveCopies = this.getLiveItemCopies(itemId);
		const totalUnboxed = liveCopies;
		const maximumCopies = liveCopies;
		const resellerAveragePrice = this.getResellerAveragePrice(itemId);

		return {
			...item,
			total_unboxed: totalUnboxed,
			maximum_copies: maximumCopies,
			average_price: resellerAveragePrice ?? item.average_price,
		};
	}

	private getResellerAveragePrice(itemId: string) {
		let totalPrice = 0;
		let listingCount = 0;

		for (const [, record] of this.listings) {
			if (record.listing.item_id !== itemId) continue;
			const listingPrice = this.toNumber(record.listing.price, 0);
			if (listingPrice <= 0) continue;

			totalPrice += listingPrice;
			listingCount += 1;
		}

		if (listingCount <= 0) return undefined;
		return math.floor(totalPrice / listingCount);
	}

	private getLiveItemCopies(itemId: string): number {
		let copies = 0;

		for (const [, inventory] of this.inventories) {
			inventory.forEach((tuple) => {
				if (tuple[0] === itemId) copies += 1;
			});
		}

		for (const [, record] of this.listings) {
			if (record.listing.item_id === itemId) copies += 1;
		}

		return copies;
	}

	private getAllCases(): Case[] {
		const all = new Array<Case>();
		for (const [, caseData] of this.cases) all.push(caseData);
		return all;
	}

	private getUserInventory(userId: string): InventoryTuple[] {
		this.loadUserState(userId);
		const pendingGrants = this.consumeGlobalInventoryGrants(userId);
		if (pendingGrants.size() > 0) {
			this.addItemsToInventory(userId, pendingGrants);
		}
		this.repairDuplicateCopyIdsInInventory(userId);
		const inventory = this.inventories.get(userId) ?? [];
		return inventory.map((entry) => [entry[0], entry[1], entry[2], entry[3]]);
	}

	private repairDuplicateCopyIdsInInventory(userId: string) {
		const inventory = this.inventories.get(userId);
		if (!inventory || inventory.size() === 0) return;

		const seenCopyIdsByItem = new Map<string, Set<number>>();
		const seenUaids = new Set<string>();
		let changed = false;

		for (let index = 0; index < inventory.size(); index++) {
			const tuple = inventory[index];
			const itemId = tuple[0];
			let uaid = tuple[1];
			const normalizedSerialNumber = math.max(1, math.floor(tonumber(tuple[2]) ?? 1));
			const normalizedCopyNumber = math.max(1, math.floor(tonumber(tuple[3]) ?? normalizedSerialNumber));
			const normalizedSerial = tostring(normalizedSerialNumber);
			const normalizedCopyId = tostring(normalizedCopyNumber);

			let seenCopyIds = seenCopyIdsByItem.get(itemId);
			if (!seenCopyIds) {
				seenCopyIds = new Set<number>();
				seenCopyIdsByItem.set(itemId, seenCopyIds);
			}

			const knownSerial = math.max(normalizedSerialNumber, normalizedCopyNumber);
			const currentItemSerial = this.itemSerialByItemId.get(itemId) ?? 0;
			if (knownSerial > currentItemSerial) {
				this.itemSerialByItemId.set(itemId, knownSerial);
			}

			if (seenCopyIds.has(normalizedCopyNumber) || seenUaids.has(uaid)) {
				const repairedSerial = this.reserveGlobalItemSerial(itemId, knownSerial);
				if (repairedSerial === undefined) continue;
				const repairedValue = tostring(repairedSerial);
				uaid = `FF${HttpService.GenerateGUID(false)}`;
				inventory[index] = [itemId, uaid, repairedValue, repairedValue];
				seenCopyIds.add(repairedSerial);
				seenUaids.add(uaid);
				this.itemSerialByItemId.set(itemId, math.max(this.itemSerialByItemId.get(itemId) ?? 0, repairedSerial));
				changed = true;
				continue;
			}

			seenUaids.add(uaid);
			seenCopyIds.add(normalizedCopyNumber);
			if (tuple[2] !== normalizedSerial || tuple[3] !== normalizedCopyId) {
				inventory[index] = [itemId, uaid, normalizedSerial, normalizedCopyId];
				changed = true;
			}
		}

		if (!changed) return;
		this.recalculateUserValue(userId);
		this.markDirty(userId);
	}

	private auditGlobalInventoryCopyIds() {
		const seenCopyIdsByItem = new Map<string, Set<number>>();
		const touchedUsers = new Set<string>();
		let normalizedCount = 0;
		let repairedCount = 0;

		for (const [userId, inventory] of this.inventories) {
			if (inventory.size() === 0) continue;

			for (let index = 0; index < inventory.size(); index++) {
				const tuple = inventory[index];
				const itemId = tostring(tuple[0] ?? "");
				const uaid = tostring(tuple[1] ?? "");
				if (itemId.size() === 0 || uaid.size() === 0) continue;

				const normalizedSerialNumber = math.max(1, math.floor(tonumber(tuple[2]) ?? 1));
				const normalizedCopyNumber = math.max(1, math.floor(tonumber(tuple[3]) ?? normalizedSerialNumber));
				const normalizedSerial = tostring(normalizedSerialNumber);
				const normalizedCopyId = tostring(normalizedCopyNumber);

				const knownSerial = math.max(normalizedSerialNumber, normalizedCopyNumber);
				const currentItemSerial = this.itemSerialByItemId.get(itemId) ?? 0;
				if (knownSerial > currentItemSerial) {
					this.itemSerialByItemId.set(itemId, knownSerial);
				}

				let seenCopyIds = seenCopyIdsByItem.get(itemId);
				if (!seenCopyIds) {
					seenCopyIds = new Set<number>();
					seenCopyIdsByItem.set(itemId, seenCopyIds);
				}

				if (seenCopyIds.has(normalizedCopyNumber)) {
					const repairedSerial = this.reserveGlobalItemSerial(itemId, knownSerial);
					if (repairedSerial === undefined) continue;
					const repairedValue = tostring(repairedSerial);
					inventory[index] = [itemId, uaid, repairedValue, repairedValue];
					seenCopyIds.add(repairedSerial);
					this.itemSerialByItemId.set(
						itemId,
						math.max(this.itemSerialByItemId.get(itemId) ?? 0, repairedSerial),
					);
					repairedCount += 1;
					touchedUsers.add(userId);
					continue;
				}

				seenCopyIds.add(normalizedCopyNumber);
				if (tuple[2] !== normalizedSerial || tuple[3] !== normalizedCopyId) {
					inventory[index] = [itemId, uaid, normalizedSerial, normalizedCopyId];
					normalizedCount += 1;
					touchedUsers.add(userId);
				}
			}
		}

		if (touchedUsers.size() === 0) return;

		for (const userId of touchedUsers) {
			this.markDirty(userId);
		}

		print(
			`[LocalBackend] Global copy-id audit normalized ${normalizedCount} and repaired ${repairedCount} entries across ${touchedUsers.size()} users.`,
		);
	}

	private addInventoryItem(userId: string, itemId: string): InventoryTuple | undefined {
		this.loadUserState(userId);
		const item = this.items.get(itemId);
		const mapSerial = this.itemSerialByItemId.get(itemId) ?? 0;
		const knownTotalUnboxed = item ? math.max(0, math.floor(item.total_unboxed)) : 0;
		const knownMaximumCopies = item ? math.max(0, math.floor(item.maximum_copies)) : 0;
		const minimumSerial = math.max(mapSerial, knownTotalUnboxed, knownMaximumCopies);
		const serial = this.reserveGlobalItemSerial(itemId, minimumSerial);
		if (serial === undefined) return undefined;
		this.itemSerialByItemId.set(itemId, math.max(mapSerial, serial));
		const inventory = this.ensureInventory(userId);

		const tuple: InventoryTuple = [
			itemId,
			`FF${HttpService.GenerateGUID(false)}`,
			tostring(serial),
			tostring(serial),
		];

		if (item) {
			item.total_unboxed = serial;
			item.maximum_copies = math.max(item.maximum_copies, serial);
			item.updated_at = this.nowIso();
		}

		inventory.push(tuple);
		this.recalculateUserValue(userId);
		this.markDirty(userId);
		return tuple;
	}

	private reserveGlobalItemSerial(itemId: string, minimumSerial: number) {
		const normalizedMinimum = math.max(0, math.floor(minimumSerial));
		let reservedSerial: number | undefined;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_item_serials_reserve_update", () =>
			this.globalItemSerialsStore.UpdateAsync(itemId, (existingSerial) => {
				const currentSerial = math.max(0, math.floor(this.toNumber(existingSerial, 0)));
				const nextSerial = math.max(currentSerial, normalizedMinimum) + 1;
				reservedSerial = nextSerial;
				return $tuple(nextSerial);
			}),
		);

		if (success && reservedSerial !== undefined) {
			return reservedSerial;
		}

		warn("[LocalBackend] Failed to reserve global item serial:", itemId, err);
		return undefined;
	}

	private normalizeCopyId(copyId: string, serial: string): string {
		const parsedCopy = tonumber(copyId);
		if (parsedCopy !== undefined && parsedCopy > 0) {
			return tostring(math.floor(parsedCopy));
		}

		const parsedSerial = tonumber(serial);
		if (parsedSerial !== undefined && parsedSerial > 0) {
			return tostring(math.floor(parsedSerial));
		}

		return "1";
	}

	private toItemStrings(items: InventoryTuple[]): string[] {
		return items.map((tuple) => `${tuple[1]}:${tuple[0]}`);
	}

	private addItemsToInventory(userId: string, tuples: InventoryTuple[]) {
		this.loadUserState(userId);
		const inventory = this.ensureInventory(userId);
		tuples.forEach((tuple) => {
			const normalizedSerial = tostring(math.max(1, math.floor(tonumber(tuple[2]) ?? 1)));
			const normalizedCopyId = this.normalizeCopyId(tostring(tuple[3]), normalizedSerial);
			inventory.push([tuple[0], tuple[1], normalizedSerial, normalizedCopyId]);
		});
		this.recalculateUserValue(userId);
		this.markDirty(userId);
	}

	private normalizeUaidToken(rawUaid: string): string {
		const [beforePipe] = tostring(rawUaid ?? "").split("|");
		const [beforeColon] = tostring(beforePipe ?? "").split(":");
		return tostring(beforeColon ?? "");
	}

	private parseRequestedUaid(raw: string): [string, string | undefined] {
		const [uaidRaw, itemIdRaw] = raw.split(":");
		const uaid = this.normalizeUaidToken(tostring(uaidRaw ?? ""));
		const itemIdHint = itemIdRaw && itemIdRaw.size() > 0 ? tostring(itemIdRaw) : undefined;
		return [uaid, itemIdHint];
	}

	private findKnownItemIdByUaid(uaid: string): string | undefined {
		for (const [, inventory] of this.inventories) {
			const tuple = inventory.find((entry) => entry[1] === uaid);
			if (tuple) return tuple[0];
		}

		for (const [, record] of this.listings) {
			if (record.itemTuple[1] === uaid) return record.itemTuple[0];
		}

		for (const [, record] of this.coinflips) {
			for (const tuple of record.player1Items) if (tuple[1] === uaid) return tuple[0];
			for (const tuple of record.player2Items ?? []) if (tuple[1] === uaid) return tuple[0];
			for (const tuple of record.lockedItems) if (tuple[1] === uaid) return tuple[0];
		}

		for (const [, record] of this.trades) {
			for (const tuple of record.initiatorItems) if (tuple[1] === uaid) return tuple[0];
			for (const tuple of record.receiverItems) if (tuple[1] === uaid) return tuple[0];
		}

		for (const [, record] of this.jackpots) {
			for (const [, tuples] of record.lockedByUser) {
				for (const tuple of tuples) if (tuple[1] === uaid) return tuple[0];
			}
		}

		for (const [, tuples] of this.pendingInventoryGrants) {
			for (const tuple of tuples) if (tuple[1] === uaid) return tuple[0];
		}

		const cachedChanges = this.cachedGlobalInventoryChangesState.changes ?? {};
		for (const [, tuples] of pairs(cachedChanges)) {
			for (const tuple of tuples) if (tuple[1] === uaid) return tuple[0];
		}

		return undefined;
	}

	private getInventorySelectionFailureMessage(userId: string, requested: string[]): string {
		const requestedByItem = new Map<string, number>();
		requested.forEach((raw) => {
			const [uaid, itemIdHint] = this.parseRequestedUaid(raw);
			const resolvedItemId = itemIdHint ?? this.findKnownItemIdByUaid(uaid);
			if (!resolvedItemId) return;
			requestedByItem.set(resolvedItemId, (requestedByItem.get(resolvedItemId) ?? 0) + 1);
		});

		if (requestedByItem.size() === 0) {
			return "Selected item copies are no longer available. Reopen inventory and try again.";
		}

		const availableByItem = new Map<string, number>();
		const inventory = this.inventories.get(userId) ?? [];
		for (const tuple of inventory) {
			availableByItem.set(tuple[0], (availableByItem.get(tuple[0]) ?? 0) + 1);
		}

		const missingLabels = new Array<string>();
		for (const [itemId, requestedCount] of requestedByItem) {
			const availableCount = availableByItem.get(itemId) ?? 0;
			if (requestedCount <= availableCount) continue;
			const missingCount = requestedCount - availableCount;
			const itemName = this.items.get(itemId)?.name ?? itemId;
			missingLabels.push(`${itemName} x${missingCount}`);
		}

		if (missingLabels.size() > 0) {
			return `Some selected copies are already in use. Missing: ${missingLabels.join(", ")}.`;
		}

		return "Selected item copies are no longer available. Reopen inventory and try again.";
	}

	private normalizeRequestedItemCounts(rawCounts: unknown) {
		const normalizedCounts = {} as Record<string, number>;
		if (!typeIs(rawCounts, "table")) return normalizedCounts;

		for (const [rawItemId, rawQuantity] of pairs(rawCounts as Record<string, unknown>)) {
			const itemId = tostring(rawItemId ?? "");
			if (itemId.size() === 0) continue;
			const quantity = math.max(0, math.floor(this.toNumber(rawQuantity, 0)));
			if (quantity <= 0) continue;
			normalizedCounts[itemId] = quantity;
		}

		return normalizedCounts;
	}

	private hasRequestedItemCounts(itemCounts: Record<string, number>) {
		for (const [, quantity] of pairs(itemCounts)) {
			if (this.toNumber(quantity, 0) > 0) return true;
		}

		return false;
	}

	private getInventorySelectionFailureMessageByItemCounts(
		userId: string,
		requestedItemCounts: Record<string, number>,
	) {
		const inventory = this.inventories.get(userId) ?? [];
		const availableByItem = new Map<string, number>();
		for (const tuple of inventory) {
			availableByItem.set(tuple[0], (availableByItem.get(tuple[0]) ?? 0) + 1);
		}

		const missingLabels = new Array<string>();
		for (const [itemIdRaw, quantityRaw] of pairs(requestedItemCounts)) {
			const itemId = tostring(itemIdRaw ?? "");
			if (itemId.size() === 0) continue;
			const requestedCount = math.max(0, math.floor(this.toNumber(quantityRaw, 0)));
			if (requestedCount <= 0) continue;
			const availableCount = availableByItem.get(itemId) ?? 0;
			if (requestedCount <= availableCount) continue;
			const missingCount = requestedCount - availableCount;
			const itemName = this.items.get(itemId)?.name ?? itemId;
			missingLabels.push(`${itemName} x${missingCount}`);
		}

		if (missingLabels.size() > 0) {
			return `Some selected copies are already in use. Missing: ${missingLabels.join(", ")}.`;
		}

		return "Selected item copies are no longer available. Reopen inventory and try again.";
	}

	private takeItemsByItemCounts(
		userId: string,
		requestedItemCounts: Record<string, number>,
	): InventoryTuple[] | undefined {
		this.loadUserState(userId);
		const inventory = this.ensureInventory(userId);

		const neededByItem = new Map<string, number>();
		for (const [itemId, quantity] of pairs(requestedItemCounts)) {
			const normalizedItemId = tostring(itemId ?? "");
			const normalizedQuantity = math.max(0, math.floor(this.toNumber(quantity, 0)));
			if (normalizedItemId.size() === 0 || normalizedQuantity <= 0) continue;
			if (!this.items.has(normalizedItemId)) return undefined;
			neededByItem.set(normalizedItemId, normalizedQuantity);
		}

		if (neededByItem.size() === 0) return undefined;

		const taken = new Array<InventoryTuple>();
		const kept = new Array<InventoryTuple>();
		for (const tuple of inventory) {
			const needed = neededByItem.get(tuple[0]) ?? 0;
			if (needed > 0) {
				taken.push(tuple);
				if (needed === 1) {
					neededByItem.delete(tuple[0]);
				} else {
					neededByItem.set(tuple[0], needed - 1);
				}
			} else {
				kept.push(tuple);
			}
		}

		if (neededByItem.size() > 0) return undefined;

		this.inventories.set(userId, kept);
		this.recalculateUserValue(userId);
		this.markDirty(userId);
		return taken;
	}

	private takeItemsByUaid(
		userId: string,
		requestedUaids: string[],
		allowEquivalentItemFallback = false,
	): InventoryTuple[] | undefined {
		this.loadUserState(userId);
		const inventory = this.ensureInventory(userId);
		if (requestedUaids.size() === 0) return [];

		const requestedByUaid = new Map<string, string | undefined>();
		for (const rawUaid of requestedUaids) {
			const [uaid, itemIdHint] = this.parseRequestedUaid(rawUaid);
			if (uaid.size() === 0 || requestedByUaid.has(uaid)) return undefined;
			requestedByUaid.set(uaid, itemIdHint);
		}

		if (requestedByUaid.size() !== requestedUaids.size()) return undefined;

		const missingByUaid = new Map<string, string | undefined>();
		for (const [uaid, itemIdHint] of requestedByUaid) {
			missingByUaid.set(uaid, itemIdHint);
		}
		const exactTaken = new Array<InventoryTuple>();
		const keptAfterExact = new Array<InventoryTuple>();

		for (const tuple of inventory) {
			const tupleUaid = tostring(tuple[1]);
			if (missingByUaid.has(tupleUaid)) {
				exactTaken.push(tuple);
				missingByUaid.delete(tupleUaid);
			} else {
				const normalizedTupleUaid = this.normalizeUaidToken(tupleUaid);
				if (missingByUaid.has(normalizedTupleUaid)) {
					exactTaken.push(tuple);
					missingByUaid.delete(normalizedTupleUaid);
				} else {
					keptAfterExact.push(tuple);
				}
			}
		}

		if (missingByUaid.size() > 0 && !allowEquivalentItemFallback) return undefined;

		let finalTaken = exactTaken;
		let finalKept = keptAfterExact;

		if (missingByUaid.size() > 0) {
			const neededByItemId = new Map<string, number>();
			for (const [missingUaid, itemIdHint] of missingByUaid) {
				const resolvedItemId = itemIdHint ?? this.findKnownItemIdByUaid(missingUaid);
				if (!resolvedItemId) return undefined;
				neededByItemId.set(resolvedItemId, (neededByItemId.get(resolvedItemId) ?? 0) + 1);
			}

			const fallbackTaken = new Array<InventoryTuple>();
			const fallbackKept = new Array<InventoryTuple>();
			for (const tuple of keptAfterExact) {
				const needed = neededByItemId.get(tuple[0]) ?? 0;
				if (needed > 0) {
					fallbackTaken.push(tuple);
					if (needed === 1) {
						neededByItemId.delete(tuple[0]);
					} else {
						neededByItemId.set(tuple[0], needed - 1);
					}
				} else {
					fallbackKept.push(tuple);
				}
			}

			if (neededByItemId.size() > 0) return undefined;
			finalTaken = [...exactTaken, ...fallbackTaken];
			finalKept = fallbackKept;
		}

		this.inventories.set(userId, finalKept);
		this.recalculateUserValue(userId);
		this.markDirty(userId);
		return finalTaken;
	}

	private findOwnerByUaid(uaid: string): [string, InventoryTuple] | undefined {
		const normalizedRequestedUaid = this.normalizeUaidToken(uaid);
		for (const [userId, inventory] of this.inventories) {
			const tuple = inventory.find((entry) => {
				const entryUaid = tostring(entry[1]);
				if (entryUaid === uaid || entryUaid === normalizedRequestedUaid) return true;
				return this.normalizeUaidToken(entryUaid) === normalizedRequestedUaid;
			});
			if (tuple) return [userId, tuple];
		}
		return undefined;
	}

	private takeExactInventoryTupleForListing(
		userId: string,
		targetTuple: InventoryTuple,
		requestedUaid: string,
	): InventoryTuple | undefined {
		this.loadUserState(userId);
		const inventory = this.ensureInventory(userId);

		const targetItemId = tostring(targetTuple[0]);
		const targetUaid = tostring(targetTuple[1]);
		const normalizedRequestedUaid = this.normalizeUaidToken(requestedUaid);

		const kept = new Array<InventoryTuple>();
		let taken: InventoryTuple | undefined;

		for (const tuple of inventory) {
			if (!taken) {
				const tupleItemId = tostring(tuple[0]);
				const tupleUaid = tostring(tuple[1]);
				const exactTargetMatch = tupleItemId === targetItemId && tupleUaid === targetUaid;
				const normalizedRequestedMatch =
					tupleItemId === targetItemId &&
					(tupleUaid === normalizedRequestedUaid ||
						this.normalizeUaidToken(tupleUaid) === normalizedRequestedUaid);

				if (exactTargetMatch || normalizedRequestedMatch) {
					taken = tuple;
					continue;
				}
			}

			kept.push(tuple);
		}

		if (!taken) return undefined;

		this.inventories.set(userId, kept);
		this.recalculateUserValue(userId);
		this.markDirty(userId);

		return taken;
	}

	private recalculateUserValue(userId: string) {
		const inventory = this.inventories.get(userId) ?? [];
		const value = inventory.reduce((sum, tuple) => {
			const item = this.items.get(tuple[0]);
			return item ? sum + item.value : sum;
		}, 0);

		const user = this.ensureUser(userId);
		user.current_value = value;
		user.updated_at = this.nowIso();
		this.markDirty(userId);
	}

	private seedStarterInventory(userId: string) {
		const starterPool = ["starter_cap", "lucky_shades", "arcane_band", "neon_chain", "rogue_mask"];
		starterPool.forEach((itemId) => {
			const added = this.addInventoryItem(userId, itemId);
			if (!added) {
				warn(`[LocalBackend] Failed to seed starter item '${itemId}' for user ${userId}`);
			}
		});
	}

	private queueCashChange(userId: string, amount: number) {
		if (amount === 0) return;

		const [success, _, err] = this.runDataStoreWithRetry<unknown>("global_cash_changes_queue_update", () =>
			this.globalCashChangesStore.UpdateAsync("global", (existingState) => {
				const normalizedState = this.normalizeGlobalCashChangesState(existingState);
				const nextChanges = normalizedState.changes ?? {};
				nextChanges[userId] = (nextChanges[userId] ?? 0) + amount;

				const nextState: GlobalCashChangesState = {
					changes: nextChanges,
					updated_at: os.time(),
				};

				this.cachedGlobalCashChangesState = nextState;
				this.lastGlobalCashChangesSync = tick();

				return $tuple(nextState);
			}),
		);

		if (!success) {
			warn("[LocalBackend] Failed to queue global cash change:", err);
			const current = this.pendingCashChanges.get(userId) ?? 0;
			this.pendingCashChanges.set(userId, current + amount);
		}

		const user = this.users.get(userId);
		if (!user) return;
		user.current_cash += amount;
		if (user.current_cash < 0) user.current_cash = 0;
		user.updated_at = this.nowIso();
		this.markDirty(userId);
	}

	private pickCaseItem(caseData: Case) {
		if (caseData.items.size() === 0) return undefined;
		const totalChance = caseData.items.reduce((sum, item) => sum + item.chance, 0);
		if (totalChance <= 0) return caseData.items[0];

		let roll = math.random() * totalChance;
		for (const item of caseData.items) {
			roll -= item.chance;
			if (roll <= 0) return item;
		}

		return caseData.items[caseData.items.size() - 1];
	}

	private getRequiredPlayers(teamMode: CaseBattleData["team_mode"]) {
		switch (teamMode) {
			case "1v1":
				return 2;
			case "1v1v1":
				return 3;
			case "1v1v1v1":
				return 4;
			case "2v2":
				return 4;
			default:
				return 2;
		}
	}

	private getCaseBattleTeamFromPosition(teamMode: CaseBattleData["team_mode"], position: number) {
		const teamSizes = teamMode.split("v").map((value) => math.max(1, math.floor(tonumber(value) ?? 1)));
		let total = 0;

		for (let index = 0; index < teamSizes.size(); index++) {
			total += teamSizes[index];
			if (position <= total) return index + 1;
		}

		return math.max(1, teamSizes.size());
	}

	private getCaseBattleStepDurationMs(battle: CaseBattleData) {
		return battle.fast_mode ? 2200 : 3800;
	}

	private formatCaseName(caseId: string) {
		const spaced = caseId.gsub("_", " ")[0];
		return spaced.gsub("(%a)(%w*)", (first, rest) => `${first.upper()}${rest.lower()}`)[0];
	}

	private chooseWeightedWinner(members: JackpotData["members"]) {
		if (members.size() === 0) return undefined;
		const total = members.reduce((sum, member) => sum + member.total_value, 0);
		if (total <= 0) return members[math.random(1, members.size()) - 1].player.id;

		let roll = math.random() * total;
		for (const member of members) {
			roll -= member.total_value;
			if (roll <= 0) return member.player.id;
		}

		return members[members.size() - 1].player.id;
	}

	private getJackpotAutoStartDelaySeconds(jackpot: JackpotData) {
		if (jackpot.server_id === "global") return 60;
		return jackpot.is_system_pot === true ? 30 : 10;
	}

	private canLeaveJackpot(jackpot: JackpotData, now = os.time()) {
		if (jackpot.status !== "waiting_for_start") return false;
		if (jackpot.members.size() === 0) return false;
		const startAt = jackpot.auto_start_at ?? jackpot.countdown_end_at;
		if (!startAt || startAt <= 0) return false;
		return startAt - now > 5;
	}

	private getLeaderboardPayload() {
		this.ensureActivePlayersLoaded();
		this.syncGlobalUsers();

		const usersById = new Map<string, LocalUser>();
		for (const [userId, user] of this.globalUsers) {
			if (!this.isRobloxUserId(userId)) continue;
			usersById.set(userId, this.normalizeLocalUserSnapshot(userId, user));
		}

		for (const [userId, user] of this.users) {
			if (!this.isRobloxUserId(userId)) continue;
			usersById.set(userId, this.normalizeLocalUserSnapshot(userId, user));
		}

		const users = new Array<LocalUser>();
		for (const [, user] of usersById) users.push(user);

		const cash = [...users]
			.sort((a, b) => a.current_cash > b.current_cash)
			.map((user) => [user.user_id, user.name, user.display_name, tostring(user.current_cash), user.country]);
		const value = [...users]
			.sort((a, b) => a.current_value > b.current_value)
			.map((user) => [user.user_id, user.name, user.display_name, tostring(user.current_value), user.country]);

		return {
			status: "OK",
			leaderboards: {
				cash,
				value,
			},
		};
	}

	private getMinigameStatsPayload() {
		const stats: Record<string, MinigameStats> = {};
		for (const [key, value] of this.minigameStats) {
			stats[key] = {
				current_ccu: value.current_ccu,
				total_spent: value.total_spent,
				total_games_played: value.total_games_played,
				total_wins: value.total_wins,
				total_losses: value.total_losses,
			};
		}

		return {
			status: "OK",
			error: undefined,
			stats,
		};
	}

	private findItemsInRange(userId: string, minValue: number, maxValue: number, minItems: number, maxItems: number) {
		const inventory = this.inventories.get(userId) ?? [];
		const candidates = inventory.filter((tuple) => {
			const item = this.items.get(tuple[0]);
			if (!item) return false;
			return item.value >= minValue && item.value <= maxValue;
		});

		if (candidates.size() < minItems) {
			return { success: false, picks: {} as Record<string, number> };
		}

		const targetCount = math.clamp(math.random(minItems, maxItems), minItems, candidates.size());
		const shuffled = [...candidates];
		for (let i = shuffled.size() - 1; i > 0; i--) {
			const j = math.random(1, i + 1) - 1;
			const temp = shuffled[i];
			shuffled[i] = shuffled[j];
			shuffled[j] = temp;
		}

		const picks: Record<string, number> = {};
		for (let i = 0; i < targetCount; i++) {
			const itemId = shuffled[i][0];
			picks[itemId] = (picks[itemId] ?? 0) + 1;
		}

		return { success: true, picks };
	}

	private ensureInventory(userId: string) {
		if (!this.inventories.has(userId)) this.inventories.set(userId, []);
		return this.inventories.get(userId)!;
	}

	private ensureActivePlayersLoaded() {
		for (const player of Players.GetPlayers()) {
			this.loadUserState(tostring(player.UserId));
		}
	}

	private ensureUser(userId: string, name?: string, displayName?: string, country?: string): LocalUser {
		const existing = this.users.get(userId);
		if (existing) {
			if (name && name.size() > 0) existing.name = name;
			if (displayName && displayName.size() > 0) existing.display_name = displayName;
			if (country && country.size() > 0) existing.country = country;
			return existing;
		}

		const created = this.createDefaultUser(userId);
		if (name && name.size() > 0) created.name = name;
		if (displayName && displayName.size() > 0) created.display_name = displayName;
		if (country && country.size() > 0) created.country = country;
		this.users.set(userId, created);
		return created;
	}

	private isRobloxUserId(userId: string) {
		const parsed = tonumber(userId);
		return parsed !== undefined && parsed > 0;
	}

	private createDefaultUser(userId: string): LocalUser {
		const identity = this.getUserIdentity(userId);
		const now = this.nowIso();
		return {
			user_id: userId,
			created_at: now,
			updated_at: now,
			name: identity.name,
			display_name: identity.display_name,
			country: "UN",
			statistics: {
				total_cash_earned: 0,
				total_cash_spent: 0,
				win_rate: 0,
				biggest_win: 0,
				total_plays: 0,
				favourite_mode: "",
				time_played: 0,
				xp: 0,
			},
			current_cash: 150000,
			current_value: 0,
			recent_activity: [],
		};
	}

	private normalizeLocalUserSnapshot(userId: string, rawUser?: LocalUser): LocalUser {
		const fallback = this.createDefaultUser(userId);
		if (!rawUser) return fallback;

		const rawStatistics = typeIs(rawUser.statistics, "table") ? rawUser.statistics : fallback.statistics;
		const statistics: LocalUser["statistics"] = {
			total_cash_earned: this.toNumber(rawStatistics.total_cash_earned, fallback.statistics.total_cash_earned),
			total_cash_spent: this.toNumber(rawStatistics.total_cash_spent, fallback.statistics.total_cash_spent),
			win_rate: this.toNumber(rawStatistics.win_rate, fallback.statistics.win_rate),
			biggest_win: this.toNumber(rawStatistics.biggest_win, fallback.statistics.biggest_win),
			total_plays: this.toNumber(rawStatistics.total_plays, fallback.statistics.total_plays),
			favourite_mode: tostring(rawStatistics.favourite_mode ?? fallback.statistics.favourite_mode),
			time_played: this.toNumber(rawStatistics.time_played, fallback.statistics.time_played),
			xp: this.toNumber(rawStatistics.xp, fallback.statistics.xp),
		};

		const recentActivity = new Array<{ image: string; text: string }>();
		if (typeIs(rawUser.recent_activity, "table")) {
			for (const rawActivity of rawUser.recent_activity as unknown[]) {
				if (!typeIs(rawActivity, "table")) continue;
				recentActivity.push({
					image: tostring((rawActivity as { image?: unknown }).image ?? ""),
					text: tostring((rawActivity as { text?: unknown }).text ?? ""),
				});
			}
		}

		return {
			...fallback,
			...rawUser,
			user_id: userId,
			name: tostring(rawUser.name ?? fallback.name),
			display_name: tostring(rawUser.display_name ?? rawUser.name ?? fallback.display_name),
			country: tostring(rawUser.country ?? fallback.country),
			created_at: tostring(rawUser.created_at ?? fallback.created_at),
			updated_at: tostring(rawUser.updated_at ?? fallback.updated_at),
			last_seen_at: typeIs(rawUser.last_seen_at, "string") ? rawUser.last_seen_at : fallback.last_seen_at,
			current_cash: this.toNumber(rawUser.current_cash, fallback.current_cash),
			current_value: this.toNumber(rawUser.current_value, fallback.current_value),
			statistics,
			recent_activity: recentActivity,
		};
	}

	private getUserIdentity(userId: string) {
		const online = Players.GetPlayerByUserId(this.toNumber(userId, 0));
		if (online) {
			return {
				name: online.Name,
				display_name: online.DisplayName,
			};
		}

		const cached = this.users.get(userId);
		if (cached) {
			return {
				name: cached.name,
				display_name: cached.display_name,
			};
		}

		return {
			name: `Player${userId}`,
			display_name: `Player${userId}`,
		};
	}

	private parseQuery(rawQuery?: string) {
		const query: Record<string, string> = {};
		if (!rawQuery) return query;
		rawQuery.split("&").forEach((part) => {
			if (part.size() === 0) return;
			const [key, value] = part.split("=");
			if (key.size() > 0) query[key] = value ?? "";
		});
		return query;
	}

	private getCurrentServerId() {
		const attributedServerId = ServerScriptService.GetAttribute("server_id");
		if (typeIs(attributedServerId, "string") && attributedServerId.size() > 0) {
			return attributedServerId;
		}

		return game.JobId.size() > 0 ? game.JobId : "LOCAL_SERVER";
	}

	private toNumber(value: unknown, fallback: number) {
		if (typeIs(value, "number")) return value;
		if (typeIs(value, "string")) return tonumber(value) ?? fallback;
		return fallback;
	}

	private nowIso() {
		return DateTime.now().ToIsoDate();
	}

	private ok(response: unknown): RouteResponse {
		return { code: 200, response };
	}

	private fail(code: number, response: unknown): RouteResponse {
		return { code, response };
	}
}


const localBackend = new LocalBackend();
export default localBackend;
