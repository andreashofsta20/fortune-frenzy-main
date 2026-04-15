import { Controller, OnStart } from "@flamework/core";
import { ContentProvider, MarketplaceService, Players, ReplicatedStorage } from "@rbxts/services";
import Signal from "@rbxts/signal";
import { peek, subscribe } from "@rbxts/charm";
import { Functions, Events } from "client/network";
import { activeMenuAtom, globalMinigameStatsRevisionAtom, isNavigationVisibleAtom } from "client/utils/global-state";
import { palette } from "client/utils/palette";
import { requestServer } from "client/utils/send-function";
import { addCommasToNumber, setDecimalPlaces } from "shared/util/number-utils";
import {
	Item,
	ItemListing,
	Case,
	Coinflip,
	Trade,
	PlayerData,
	SubscriptionData,
	CaseBattleCase,
	CaseBattleData,
	CaseBattleItem,
	JackpotData,
} from "typings/APIResponses";
import {
	applyTutorialServerState,
	finishTutorialFlow,
	tutorialCompletionRequestAtom,
} from "client/tutorial/tutorial-state";
import { COINFLIP_HOUSE_USER_ID } from "shared/util/coinflip-house";

type PendingUpdateValue =
	| number
	| Map<string, Case>
	| Coinflip[]
	| Map<string, string[]>
	| Array<{ id: string; item: Item }>
	| CaseBattleData[]
	| Record<string, Trade | undefined>
	| JackpotData[];

@Controller()
export class ClientStateController implements OnStart {
	// ----------------------------------------------------------------
	// FIELDS
	// ----------------------------------------------------------------

	public Inventory = new Map<string, string[]>();
	public EquippedItems = new Array<string>();
	public ItemInfo = new Map<string, Item>();
	public ItemListings = new Map<string, ItemListing[]>();
	public Cases = new Map<string, Case>();
	public CaseBattleCases = new Array<CaseBattleCase>();
	public Coinflips = new Array<Coinflip>();
	public CaseBattles = new Array<CaseBattleData>();
	public Jackpots = new Array<JackpotData>();
	public Trades: Record<string, Trade | undefined> = {};
	public PlayerInformationCache = new Map<
		string,
		{
			data: {
				pData: PlayerData;
				recentActivity: Array<{
					image: string;
					text: string;
				}>;
			};
			expiry: number;
		}
	>();
	public PlayerSearchCache = new Map<
		string,
		{
			expiry: number;
			data: {
				id: string;
				name: string;
				display_name: string;
				current_cash: number;
				current_value: number;
			}[];
		}
	>();
	public SubscriptionData = new Map<string, SubscriptionData>();
	public GamepassStatuses = new Map<string, boolean>();
	public RobuxProducts = {
		DeveloperProducts: new Map<string, string>(),
		Gamepasses: new Map<string, string>(),
		Subscriptions: new Map<string, string>(),
	};
	public ProductInfo = new Map<string, ProductInfo | SubscriptionInfo>();
	private preloadedCaseImages = new Set<string>();
	public GlobalMinigameData = new Map<
		string,
		{
			last_updated: number;
			current_ccu: number;
			total_spent: number;
			total_games_played: number;
			total_wins?: number;
			total_losses?: number;
		}
	>();
	public LocalMinigameData: Record<
		string,
		{
			total_spent: number;
			total_games_played: number;
			total_wins?: number;
			total_losses?: number;
		}
	> = {};
	public Cash = 0;
	public ItemValue = 0;
	public Gems = 0;
	public AllPlayers = "";

	private pendingUpdates = new Map<string, PendingUpdateValue>();
	private isUpdateScheduled = false;
	private batchUpdateInterval = 0.1;
	private readonly completedCoinflipRemovalGrace = 12;
	private readonly completedCaseBattleRemovalGrace = 12;
	private completedCoinflipSeenAt = new Map<string, number>();
	private completedCaseBattleSeenAt = new Map<string, number>();
	public DailyRewardInfo = {
		available: false,
		rewards: {} as Record<
			string,
			{
				claimed_at: number;
				reward: string;
				reward_data: string;
			}
		>,
		nextAvailableAt: 0,
	};
	public RewardWheelSpins = {
		spins: 0,
		nextFreeAt: 0,
	};

	private selfCancelledTrades = new Set<string>();
	private pendingServerNotifications = new Array<{ text: string; sound?: string }>();
	private isProcessingServerNotifications = false;
	private serverNotificationGateInitialized = false;
	private readonly SERVER_NOTIFICATION_DISPLAY_DURATION = 3.25;

	// ----------------------------------------------------------------
	// SIGNALS
	// ----------------------------------------------------------------

	public ListingsEvent = new Signal<(itemId: string) => void>();
	public InventoryChangedEvent = new Signal<(inventory: Map<string, string[]>) => void>();
	public ItemInfoChangedEvent = new Signal<(itemId: string, item: Item) => void>();
	public CashChangedEvent = new Signal<(cash: number) => void>();
	public ItemValueChangedEvent = new Signal<(value: number) => void>();
	public GemsChangedEvent = new Signal<(Gems: number) => void>();
	public CaseChangedEvent = new Signal<(cases: Map<string, Case>) => void>();
	public CoinflipChangedEvent = new Signal<(coinflips: Coinflip[]) => void>();
	public CaseBattleChangedEvent = new Signal<(caseBattles: CaseBattleData[]) => void>();
	public DailyRewardChangedEvent = new Signal<
		(dailyReward: {
			available: boolean;
			rewards: {
				[key: string]: {
					claimed_at: number;
					reward: string;
					reward_data: string;
				};
			};
		}) => void
	>();
	public TradesChangedEvent = new Signal<(trades: Record<string, Trade | undefined>) => void>();
	public JackpotChangedEvent = new Signal<(jackpots: JackpotData[]) => void>();
	public SpinRewardWheelEvent = new Signal<(rewardId: string) => void>();

	// ----------------------------------------------------------------
	// NOTIFICATIONS
	// ----------------------------------------------------------------
	public NotificationEvent = new Signal<(text: string, sound?: string) => void>();

	// ----------------------------------------------------------------
	// GAMEMODE SIGNALS
	// ----------------------------------------------------------------
	public CaseBattleCaseChangedEvent = new Signal<(method: "add" | "sub", caseId: string, quantity: number) => void>();
	public CaseBattleSelectedEvent = new Signal<(battleId: string) => void>();
	public JackpotSelectedEvent = new Signal<(jackpotId: string) => void>();
	// ----------------------------------------------------------------
	// ENTRY POINT
	// ----------------------------------------------------------------

	public async onStart() {
		this.listenForServerNotifications();
		this.listenForCurrencyUpdates();
		this.listenForLocalAttributeChanges();

		await this.loadInitialData();
		this.fireInitialEvents();
		this.updateAllPlayers();
		this.markClientAsReady();
		this.listenForTutorialCompletionRequests();

		this.listenForInventoryUpdates();
		this.listenForItemUpdates();
		this.listenForItemResellersUpdates();
		this.listenForCaseUpdates();
		this.listenForCoinflipUpdates();
		this.listenForCaseBattleUpdates();
		this.listenForTradeUpdates();
		this.listenForPlayerListChanges();
		this.listenForSubscriptionUpdates();
		this.listenForGamepassUpdates();
		this.listenForMinigameUpdates();
		this.listenForJackpotUpdates();
		this.listenForRewardWheelSpinsUpdates();
	}

	// ----------------------------------------------------------------
	// PUBLIC METHODS
	// ----------------------------------------------------------------

	/**
	 * Gets (or fetches) listings for a given item and stores them in memory.
	 */
	public async GetCachedListingsForItem(itemId: string, forceRefresh = false) {
		const cache = this.ItemListings.get(itemId);
		if (!forceRefresh && cache) return cache;

		const response = await requestServer(
			Functions.Marketplace.GetListingsForItem,
			"Failed to fetch listings for item",
			itemId,
		);
		if (response === -1) return [];

		this.ItemListings.set(itemId, response);
		return response;
	}

	public async GetPlayerInformation(userId: number) {
		const cache = this.PlayerInformationCache.get(tostring(userId));
		if (cache && cache.expiry > tick()) return cache.data;

		const response = await requestServer(
			Functions.Users.GetPlayerInformation,
			"Failed to fetch player information",
			userId,
		);
		if (response === -1 || response.status !== "OK" || !response.data) return;

		this.PlayerInformationCache.set(tostring(userId), {
			data: response.data,
			expiry: tick() + 10,
		});

		return response.data;
	}

	public async SearchPlayers(
		query: string,
		sortOrder: "value_high" | "value_low" | "name_a-z" | "name_z-a" = "value_high",
	) {
		const cacheKey = `${query}::${sortOrder}`;
		const cache = this.PlayerSearchCache.get(cacheKey);
		if (cache && cache.expiry > tick()) return cache.data;

		const response = await requestServer(
			Functions.Users.SearchPlayers,
			"Failed to search players",
			query,
			sortOrder,
		);

		if (response === -1 || response === undefined) return [];

		const normalizedQuery = query.gsub("^%s*(.-)%s*$", "%1")[0];
		let orderedResults = [...response];

		if (normalizedQuery.size() > 0) {
			const [idSuccess, idResult] = pcall(() => Players.GetUserIdFromNameAsync(normalizedQuery));
			if (idSuccess && typeIs(idResult, "number")) {
				const resolvedUserId = tostring(idResult);
				const [nameSuccess, nameResult] = pcall(() => Players.GetNameFromUserIdAsync(idResult));
				const resolvedName = nameSuccess && typeIs(nameResult, "string") ? nameResult : normalizedQuery;

				let matched = orderedResults.find((entry) => entry.id === resolvedUserId);
				orderedResults = orderedResults.filter((entry) => entry.id !== resolvedUserId);

				if (!matched) {
					matched = {
						id: resolvedUserId,
						name: resolvedName,
						display_name: resolvedName,
						current_cash: 0,
						current_value: 0,
					};
				}

				orderedResults = [matched, ...orderedResults];
			}
		}

		const filteredForDisplay = orderedResults.filter(
			(e) => e.id !== COINFLIP_HOUSE_USER_ID && string.find(e.display_name, "Coinflip House")[0] === undefined,
		);

		this.PlayerSearchCache.set(cacheKey, {
			data: filteredForDisplay,
			expiry: tick() + 20,
		});

		task.delay(20, () => this.PlayerSearchCache.delete(cacheKey));
		return filteredForDisplay;
	}

	// ----------------------------------------------------------------
	// PRIVATE METHODS - LOADING & INITIAL SETUP
	// ----------------------------------------------------------------

	private waitForServerNetworkingReady(maxSeconds: number) {
		const deadline = tick() + maxSeconds;
		while (tick() < deadline) {
			if (ReplicatedStorage.GetAttribute("__FF_NETWORK_READY") === true) {
				return;
			}
			task.wait(0.05);
		}
	}

	/** Avoid SetClientData before profile exists — prevents flaky Modding/PMS races during parallel OnStart. */
	private waitForLocalPlayerServerLoaded(maxSeconds: number) {
		const lp = Players.LocalPlayer;
		if (!lp) return;
		const deadline = tick() + maxSeconds;
		while (tick() < deadline) {
			if (lp.GetAttribute("__SERVER_LOADED") === true) {
				return;
			}
			task.wait(0.1);
		}
	}

	private async loadInitialData() {
		this.waitForServerNetworkingReady(45);
		this.waitForLocalPlayerServerLoaded(90);

		await requestServer(Functions.Loading.SetClientData, "Failed to set client time data", {
			current_time: os.time(),
		});

		const [
			currencies,
			tutorialState,
			dailyReward,
			inventory,
			marketplace,
			marketplaceListings,
			equipped,
			cases,
			coinflips,
			trades,
			subscriptions,
			gamepasses,
			robuxProducts,
			caseBattleCases,
			caseBattles,
			jackpots,
			rewardWheelSpins,
		] = await Promise.all([
			requestServer(Functions.Loading.GetCurrencies, "Failed to load currencies"),
			requestServer(Functions.Loading.GetTutorialState, "Failed to load tutorial state"),
			requestServer(Functions.Loading.GetDailyReward, "Failed to load daily reward"),
			requestServer(Functions.Marketplace.GetInventory, "Failed to load inventory"),
			requestServer(Functions.Marketplace.GetEntireMarketplace, "Failed to load marketplace"),
			requestServer(Functions.Marketplace.GetAllListings, "Failed to load marketplace listings"),
			requestServer(Functions.Marketplace.GetEquippedItems, "Failed to load equipped items"),
			requestServer(Functions.ItemCases.GetCases, "Failed to load cases"),
			requestServer(Functions.Coinflip.GetCoinflips, "Failed to load coinflips"),
			requestServer(Functions.Trading.GetTrades, "Failed to load trades"),
			requestServer(Functions.Commerce.GetSubscriptionStatuses, "Failed to load subscription statuses"),
			requestServer(Functions.Commerce.GetGamepassStatuses, "Failed to load gamepass statuses"),
			requestServer(Functions.Commerce.GetRobuxProducts, "Failed to load robux products"),
			requestServer(Functions.CaseBattles.GetCases, "Failed to load case battle cases"),
			requestServer(Functions.CaseBattles.GetBattles, "Failed to load case battles"),
			requestServer(Functions.Jackpot.GetPots, "Failed to load jackpots"),
			requestServer(Functions.Commerce.GetRewardWheelSpins, "Failed to load reward wheel spins"),
		]);

		if (currencies !== -1) {
			this.Cash = currencies.Cash;
			this.Gems = currencies.Gems;
			this.ItemValue = currencies.ItemValue;
		}

		this.syncCurrencyStateWithLocalAttributes();

		if (dailyReward !== -1) this.DailyRewardInfo = dailyReward;
		if (inventory !== -1) this.Inventory = inventory;
		if (marketplace !== -1) this.ItemInfo = marketplace;
		if (marketplaceListings !== -1) this.ItemListings = marketplaceListings;
		if (equipped !== -1) this.EquippedItems = equipped;
		if (cases !== -1) this.Cases = cases;
		if (coinflips !== -1) this.Coinflips = coinflips;
		if (trades !== -1) this.Trades = trades;
		if (subscriptions !== -1) this.SubscriptionData = subscriptions;
		if (gamepasses !== -1) this.GamepassStatuses = gamepasses;
		if (robuxProducts !== -1) {
			this.RobuxProducts = robuxProducts;
			await this.loadRobuxProductInfo();
		}
		if (caseBattleCases !== -1) this.CaseBattleCases = caseBattleCases;
		if (this.CaseBattleCases.size() === 0) {
			await this.retryLoadCaseBattleCases();
		}
		this.preloadCaseImages();
		if (caseBattles !== -1) this.CaseBattles = caseBattles;
		if (jackpots !== -1) this.Jackpots = jackpots;
		if (rewardWheelSpins !== -1 && rewardWheelSpins.status === "success") {
			this.RewardWheelSpins = {
				spins: rewardWheelSpins.spins,
				nextFreeAt: rewardWheelSpins.nextFreeAt,
			};
		}

		const shouldShowTutorial = tutorialState !== -1 ? tutorialState.should_show : false;
		const tutorialCompleted = tutorialState !== -1 ? tutorialState.completed : false;
		const tutorialRewardPreview = tutorialState !== -1 ? tutorialState.reward_preview : undefined;

		// Apply tutorial state but do NOT auto-start the flow yet
		applyTutorialServerState(
			{
				completed: tutorialCompleted,
				shouldShow: shouldShowTutorial,
				rewardPreview: tutorialRewardPreview,
			},
			false,
		);

		// Always open the daily reward popup when joining
		activeMenuAtom("DailyReward");
		isNavigationVisibleAtom(false);

		if (shouldShowTutorial && !tutorialCompleted) {
			const connection = subscribe(activeMenuAtom, (menuName) => {
				if (menuName !== "DailyReward") {
					import("client/tutorial/tutorial-state").then(({ openTutorialOffer }) => {
						openTutorialOffer();
					});
					connection(); // Unsubscribe
				}
			});
		}

		import("client/utils/global-state").then(({ isLoadingAtom }) => isLoadingAtom(false));
	}

	private listenForTutorialCompletionRequests() {
		subscribe(tutorialCompletionRequestAtom, (newValue, oldValue) => {
			if (newValue <= oldValue) return;

			task.spawn(async () => {
				const completionResponse = await requestServer(
					Functions.Loading.CompleteTutorial,
					"Failed to complete tutorial",
				);

				if (completionResponse === -1 || completionResponse.status !== "success") {
					finishTutorialFlow(false);
					this.NotificationEvent.Fire(
						`<font color="#${palette.lossRed.ToHex()}">Tutorial completion failed. Please try again.</font>`,
					);
					return;
				}

				const reward = completionResponse.reward;
				finishTutorialFlow(true, {
					cash: reward?.cash ?? 0,
					gems: reward?.gems ?? 0,
					itemId: reward?.item_id,
				});

				const rewardLines = new Array<string>();
				if ((reward?.cash ?? 0) > 0) {
					rewardLines.push(
						`<font color="#${palette.profitGreen.ToHex()}">$${addCommasToNumber(reward!.cash)}</font> Cash`,
					);
				}
				if ((reward?.gems ?? 0) > 0) {
					rewardLines.push(
						`<font color="#${palette.blue.ToHex()}">${addCommasToNumber(reward!.gems)}</font> Gems`,
					);
				}
				if (reward?.item_id && reward.item_id.size() > 0) {
					const rewardItemName = this.ItemInfo.get(reward.item_id)?.name ?? reward.item_id;
					rewardLines.push(`<font color="#${palette.equalOrange.ToHex()}">${rewardItemName}</font> Item`);
				}

				const rewardText =
					rewardLines.size() > 0
						? rewardLines.join(", ")
						: `<font color="#${palette.profitGreen.ToHex()}">Rewards claimed</font>`;

				this.NotificationEvent.Fire(`Tutorial complete! Bonus unlocked: ${rewardText}`);
				isNavigationVisibleAtom(true);
			});
		});
	}

	private async retryLoadCaseBattleCases() {
		for (let attempt = 1; attempt <= 4; attempt++) {
			const caseBattleCases = await requestServer(
				Functions.CaseBattles.GetCases,
				"Failed to load case battle cases",
			);

			if (caseBattleCases !== -1 && caseBattleCases.size() > 0) {
				this.CaseBattleCases = caseBattleCases;
				this.preloadCaseImages();
				return;
			}

			if (attempt < 4) task.wait(0.35 * attempt);
		}
	}

	private preloadCaseImages() {
		const imageSet = new Set<string>();
		const addImage = (imageValue?: string) => {
			const normalized = this.normalizeCaseImageForPreload(imageValue);
			if (normalized.size() > 0) imageSet.add(normalized);
		};

		this.Cases.forEach((caseData) => addImage(caseData.ui_data?.primary));
		this.CaseBattleCases.forEach((caseData) => addImage(caseData.image));

		if (imageSet.size() === 0) return;

		const imageIds = new Array<string>();
		imageSet.forEach((id) => {
			if (this.preloadedCaseImages.has(id)) return;
			this.preloadedCaseImages.add(id);
			imageIds.push(id);
		});

		if (imageIds.size() === 0) return;

		// Preload in the background to avoid blocking initial UI.
		task.spawn(() => {
			const chunkSize = 25;
			const total = imageIds.size();
			for (let i = 0; i < total; i += chunkSize) {
				const batch = new Array<string>();
				const endIndex = math.min(i + chunkSize, total);
				for (let j = i; j < endIndex; j++) {
					batch.push(imageIds[j]);
				}

				const [success, err] = pcall(() => ContentProvider.PreloadAsync(batch)) as LuaTuple<[boolean, unknown]>;
				if (!success) {
					warn("[ClientStateController] Failed to preload case images:", err);
				}

				task.wait();
			}
		});
	}

	private normalizeCaseImageForPreload(imageValue?: string) {
		const trimmed = tostring(imageValue ?? "").gsub("^%s*(.-)%s*$", "%1")[0];
		if (trimmed.size() === 0) return "";
		if (trimmed.match("^https?://")[0] !== undefined) return "";
		if (trimmed.match("^rbxassetid://")[0] !== undefined) return trimmed;
		if (trimmed.match("^rbxthumb://")[0] !== undefined) return trimmed;

		const numericMatch = trimmed.match("^(%d+)$")[0];
		if (numericMatch !== undefined) {
			return `rbxthumb://type=Asset&id=${numericMatch}&w=420&h=420`;
		}

		return trimmed;
	}

	private async loadRobuxProductInfo() {
		const loadProductInfo = (id: number, infoType: Enum.InfoType, key: string) => {
			if (this.ProductInfo.has(key)) return;

			const [success, info] = pcall(() => MarketplaceService.GetProductInfo(id, infoType)) as LuaTuple<
				[boolean, ProductInfo]
			>;
			if (success && typeIs(info, "table")) {
				this.ProductInfo.set(key, info);
			}
		};

		this.RobuxProducts.DeveloperProducts.forEach((_category, productId) => {
			const numericId = tonumber(productId);
			if (numericId !== undefined) {
				loadProductInfo(numericId, Enum.InfoType.Product, tostring(numericId));
			}
		});

		this.RobuxProducts.Gamepasses.forEach((gamepassId) => {
			const numericId = tonumber(gamepassId);
			if (numericId !== undefined) {
				loadProductInfo(numericId, Enum.InfoType.GamePass, tostring(numericId));
			}
		});

		const marketplaceWithSubscriptions = MarketplaceService as unknown as {
			GetSubscriptionProductInfoAsync?: (subscriptionId: string) => SubscriptionInfo;
		};

		const loadSubscriptionInfo = (subscriptionId: string) => {
			if (this.ProductInfo.has(subscriptionId)) return;

			const loader = marketplaceWithSubscriptions.GetSubscriptionProductInfoAsync;
			if (loader !== undefined) {
				const [success, info] = pcall(() => loader(subscriptionId)) as LuaTuple<[boolean, SubscriptionInfo]>;
				if (success && typeIs(info, "table")) {
					this.ProductInfo.set(subscriptionId, info);
					return;
				}
			}

			// Live game should always resolve; Studio / older engines may not — still show VIP so purchase works.
			this.ProductInfo.set(
				subscriptionId,
				{
					Name: "VIP",
					Description: "",
					PriceInRobux: 1000,
					PriceTier: 0,
					DisplayPrice: "\u{E002}1,000",
					DisplaySubscriptionPeriod: " / month",
					IconImageAssetId: 0,
				} as unknown as SubscriptionInfo,
			);
		};

		this.RobuxProducts.Subscriptions.forEach((subscriptionProductId) => {
			loadSubscriptionInfo(subscriptionProductId);
		});
	}

	private fireInitialEvents() {
		this.CashChangedEvent.Fire(this.Cash);
		this.CaseChangedEvent.Fire(this.Cases);
		this.DailyRewardChangedEvent.Fire(this.DailyRewardInfo);
	}

	private syncCurrencyStateWithLocalAttributes() {
		// During startup, server-side cash credits (like offline sales) can land before
		// the initial currency request resolves. Prefer live attributes when present.
		const cashAttribute = Players.LocalPlayer.GetAttribute("Cash");
		if (typeIs(cashAttribute, "number")) {
			this.Cash = cashAttribute;
		}

		const gemsAttribute = Players.LocalPlayer.GetAttribute("Gems");
		if (typeIs(gemsAttribute, "number")) {
			this.Gems = gemsAttribute;
		}
	}

	private updateAllPlayers() {
		this.AllPlayers = `${Players.GetPlayers()
			.map((player) => player.UserId)
			.join(",")},`;
	}

	private markClientAsReady() {
		const readyValue = new Instance("BoolValue");
		readyValue.Name = "ClientReady";
		readyValue.Value = true;
		readyValue.Parent = Players.LocalPlayer.WaitForChild("PlayerGui");
	}

	// ----------------------------------------------------------------
	// PRIVATE METHODS - BATCH UPDATES
	// ----------------------------------------------------------------

	/**
	 * Schedules a batch update to reduce the frequency of updates and prevent cascading re-renders.
	 */
	private scheduleUpdate() {
		if (this.isUpdateScheduled) return;

		this.isUpdateScheduled = true;
		task.delay(this.batchUpdateInterval, () => {
			this.processPendingUpdates();
			this.isUpdateScheduled = false;
		});
	}

	/**
	 * Processes all pending updates in a single batch.
	 */
	private processPendingUpdates() {
		if (this.pendingUpdates.has("Cash")) {
			const cash = this.pendingUpdates.get("Cash") as number;
			this.Cash = cash;
			this.CashChangedEvent.Fire(cash);
		}

		if (this.pendingUpdates.has("ItemValue")) {
			const value = this.pendingUpdates.get("ItemValue") as number;
			this.ItemValue = value;
			this.ItemValueChangedEvent.Fire(value);
		}

		if (this.pendingUpdates.has("Gems")) {
			const gems = this.pendingUpdates.get("Gems") as number;
			this.Gems = gems;
			this.GemsChangedEvent.Fire(gems);
		}

		if (this.pendingUpdates.has("Inventory")) {
			const inventory = this.pendingUpdates.get("Inventory") as Map<string, string[]>;
			this.Inventory = inventory;
			this.InventoryChangedEvent.Fire(inventory);
		}

		if (this.pendingUpdates.has("ItemUpdates")) {
			const itemUpdates = this.pendingUpdates.get("ItemUpdates") as Array<{ id: string; item: Item }>;
			itemUpdates.forEach(({ id, item }) => {
				this.ItemInfo.set(id, item);
				this.ItemInfoChangedEvent.Fire(id, item);
			});
		}

		if (this.pendingUpdates.has("Cases")) {
			const cases = this.pendingUpdates.get("Cases") as Map<string, Case>;
			this.Cases = cases;
			this.CaseChangedEvent.Fire(cases);
		}

		if (this.pendingUpdates.has("Coinflips")) {
			const coinflips = this.pendingUpdates.get("Coinflips") as Coinflip[];
			this.Coinflips = coinflips;
			this.CoinflipChangedEvent.Fire(coinflips);
		}

		if (this.pendingUpdates.has("CaseBattles")) {
			const caseBattles = this.pendingUpdates.get("CaseBattles") as CaseBattleData[];
			this.CaseBattles = caseBattles;
			this.CaseBattleChangedEvent.Fire(caseBattles);
		}

		if (this.pendingUpdates.has("Trades")) {
			const trades = this.pendingUpdates.get("Trades") as Record<string, Trade | undefined>;
			this.Trades = trades;
			this.TradesChangedEvent.Fire(trades);
		}

		if (this.pendingUpdates.has("Jackpots")) {
			const jackpots = this.pendingUpdates.get("Jackpots") as JackpotData[];
			this.Jackpots = jackpots;
			this.JackpotChangedEvent.Fire(jackpots);
		}

		// Clear pending updates after processing all keys, including jackpots.
		this.pendingUpdates.clear();
	}

	// ----------------------------------------------------------------
	// PRIVATE METHODS - REMOTE/EVENT LISTENERS
	// ----------------------------------------------------------------

	private listenForInventoryUpdates() {
		const onInventory = (inventory: Map<string, string[]>) => {
			this.pendingUpdates.set("Inventory", inventory);
			this.scheduleUpdate();
		};

		Events.InventoryUpdate.connect(onInventory);
		Events.InventoryUpdae.connect(onInventory);
	}

	private listenForItemUpdates() {
		Events.ItemUpdate.connect((items) => {
			const pending = (this.pendingUpdates.get("ItemUpdates") as Array<{ id: string; item: Item }>) || [];
			items.forEach((itemInfo) => pending.push({ id: itemInfo.id, item: itemInfo }));
			this.pendingUpdates.set("ItemUpdates", pending);
			this.scheduleUpdate();
		});
	}

	private listenForItemResellersUpdates() {
		Events.ItemResellersUpdate.connect((deltas) => {
			deltas.forEach((delta) => {
				const currentListings = this.ItemListings.get(delta.itemId) ?? [];
				const currentMap = new Map<string, ItemListing>();
				currentListings.forEach((l) => currentMap.set(l.user_asset_id, l));

				delta.removed.forEach((uaid) => currentMap.delete(uaid));
				delta.updated.forEach((listing) => {
					currentMap.set(listing.user_asset_id, listing);
				});

				delta.added.forEach((listing) => {
					currentMap.set(listing.user_asset_id, listing);
				});

				const newListings: ItemListing[] = [];
				currentMap.forEach((l) => newListings.push(l));

				this.ItemListings.set(delta.itemId, newListings);
				this.ListingsEvent.Fire(delta.itemId);
			});
		});
	}

	private listenForCaseUpdates() {
		Events.CaseUpdate.connect((cases) => {
			const mergedCases = new Map<string, Case>();
			this.Cases.forEach((caseData, caseId) => mergedCases.set(caseId, caseData));
			cases.forEach((c) => mergedCases.set(c.id, c));
			this.pendingUpdates.set("Cases", mergedCases);
			this.scheduleUpdate();
		});
	}

	private listenForCoinflipUpdates() {
		Events.CoinflipsUpdated.connect((data) => {
			const updatedCoinflips = this.updateCoinflipsData(data.removed, data.updated);
			this.pendingUpdates.set("Coinflips", updatedCoinflips);
			this.scheduleUpdate();
		});
	}

	private pendingCoinflipRemovals = new Set<string>();

	private updateCoinflipsData(removedIds: string[], updatedCoinflips: Coinflip[]): Coinflip[] {
		let newCoinflips = [...this.Coinflips];
		removedIds.forEach((id) => {
			const existing = newCoinflips.find((cf) => cf.id === id);
			if (!existing) return;

			if (existing.status === "completed" || existing.status === "failed") {
				const seenAt = this.completedCoinflipSeenAt.get(id) ?? tick();
				this.completedCoinflipSeenAt.set(id, seenAt);
				if (tick() - seenAt < this.completedCoinflipRemovalGrace) {
					if (!this.pendingCoinflipRemovals.has(id)) {
						this.pendingCoinflipRemovals.add(id);
						const remaining = this.completedCoinflipRemovalGrace - (tick() - seenAt) + 0.5;
						task.delay(remaining, () => {
							this.pendingCoinflipRemovals.delete(id);
							this.completedCoinflipSeenAt.delete(id);
							this.Coinflips = this.Coinflips.filter((cf) => cf.id !== id);
							this.CoinflipChangedEvent.Fire(this.Coinflips);
						});
					}
					return;
				}
			}

			newCoinflips = newCoinflips.filter((cf) => cf.id !== id);
			this.completedCoinflipSeenAt.delete(id);
		});

		updatedCoinflips.forEach((cf) => {
			if (cf.status === "completed" || cf.status === "failed") {
				if (!this.completedCoinflipSeenAt.has(cf.id)) {
					this.completedCoinflipSeenAt.set(cf.id, tick());
				}
			} else {
				this.completedCoinflipSeenAt.delete(cf.id);
			}

			const index = newCoinflips.findIndex((existing) => existing.id === cf.id);
			if (index !== -1) {
				newCoinflips[index] = cf;
			} else {
				newCoinflips.push(cf);
			}
		});

		return newCoinflips;
	}

	private listenForCaseBattleUpdates() {
		Events.CaseBattlesUpdated.connect((data) => {
			const updatedCaseBattles = this.updateCaseBattlesData(data.removed, data.updated);
			this.pendingUpdates.set("CaseBattles", updatedCaseBattles);
			this.scheduleUpdate();
		});
	}

	private pendingCaseBattleRemovals = new Set<string>();

	private updateCaseBattlesData(removedIds: string[], updatedCaseBattles: CaseBattleData[]): CaseBattleData[] {
		let newCaseBattles = [...this.CaseBattles];
		removedIds.forEach((id) => {
			const existing = newCaseBattles.find((cb) => cb.id === id);
			if (!existing) return;

			if (existing.status === "completed") {
				const seenAt = this.completedCaseBattleSeenAt.get(id) ?? tick();
				this.completedCaseBattleSeenAt.set(id, seenAt);
				if (tick() - seenAt < this.completedCaseBattleRemovalGrace) {
					if (!this.pendingCaseBattleRemovals.has(id)) {
						this.pendingCaseBattleRemovals.add(id);
						const remaining = this.completedCaseBattleRemovalGrace - (tick() - seenAt) + 0.5;
						task.delay(remaining, () => {
							this.pendingCaseBattleRemovals.delete(id);
							this.completedCaseBattleSeenAt.delete(id);
							this.CaseBattles = this.CaseBattles.filter((cb) => cb.id !== id);
							this.CaseBattleChangedEvent.Fire(this.CaseBattles);
						});
					}
					return;
				}
			}

			newCaseBattles = newCaseBattles.filter((cb) => cb.id !== id);
			this.completedCaseBattleSeenAt.delete(id);
		});

		updatedCaseBattles.forEach((cb) => {
			if (cb.status === "completed") {
				if (!this.completedCaseBattleSeenAt.has(cb.id)) {
					this.completedCaseBattleSeenAt.set(cb.id, tick());
				}
			} else {
				this.completedCaseBattleSeenAt.delete(cb.id);
			}

			const index = newCaseBattles.findIndex((existing) => existing.id === cb.id);
			if (index !== -1) {
				newCaseBattles[index] = cb;
			} else {
				newCaseBattles.push(cb);
			}
		});

		return newCaseBattles;
	}

	private listenForJackpotUpdates() {
		Events.JackpotsUpdated.connect((data) => {
			const updatedJackpots = this.updateJackpotsData(data.removed, data.updated);
			this.pendingUpdates.set("Jackpots", updatedJackpots);
			this.scheduleUpdate();
		});
	}

	private listenForRewardWheelSpinsUpdates() {
		Events.RewardWheelSpinsUpdated.connect((spins) => {
			const currentSpins = this.RewardWheelSpins.spins;
			this.RewardWheelSpins = spins;

			const difference = spins.spins - currentSpins;
			if (difference > 0) {
				this.NotificationEvent.Fire(
					`You've unlocked <font color="#${palette.profitGreen.ToHex()}">${difference} Spins</font>!`,
				);
			}
		});
	}

	private updateJackpotsData(removedIds: string[], updatedJackpots: JackpotData[]): JackpotData[] {
		let newJackpots = [...this.Jackpots];
		removedIds.forEach((id) => {
			newJackpots = newJackpots.filter((jp) => jp.id !== id);
		});

		updatedJackpots.forEach((jp) => {
			const index = newJackpots.findIndex((existing) => existing.id === jp.id);
			if (index !== -1) {
				newJackpots[index] = jp;
			} else {
				newJackpots.push(jp);
			}
		});

		return newJackpots;
	}

	private listenForSubscriptionUpdates() {
		Events.SubscriptionStatusUpdate.connect((subscription, data) => {
			this.SubscriptionData.set(subscription, data);
		});
	}

	private listenForGamepassUpdates() {
		Events.GamepassStatusUpdate.connect((gamepass, owns) => {
			this.GamepassStatuses.set(gamepass, owns);
		});
	}

	private listenForMinigameUpdates() {
		Events.MinigamesUpdated.connect((globalData, localData) => {
			this.GlobalMinigameData = globalData;
			this.LocalMinigameData = localData;
			globalMinigameStatsRevisionAtom((n: number) => n + 1);
		});
	}

	private listenForCurrencyUpdates() {
		Events.CurrencyUpdate.connect((currency, amount) => {
			this.pendingUpdates.set(currency, amount);
			this.scheduleUpdate();
		});
	}

	private listenForServerNotifications() {
		this.initializeServerNotificationGate();

		Events.Notification.connect((text, sound) => {
			this.pendingServerNotifications.push({ text, sound });
			this.flushServerNotificationQueue();
		});
	}

	private initializeServerNotificationGate() {
		if (this.serverNotificationGateInitialized) return;
		this.serverNotificationGateInitialized = true;

		const attachLoadingCompleteListener = () => {
			const playerGui = Players.LocalPlayer.FindFirstChild("PlayerGui");
			if (!playerGui || !playerGui.IsA("PlayerGui")) return false;

			playerGui.GetAttributeChangedSignal("LOADING_COMPLETE").Connect(() => {
				this.flushServerNotificationQueue();
			});
			return true;
		};

		if (!attachLoadingCompleteListener()) {
			const playerGuiConnection = Players.LocalPlayer.ChildAdded.Connect((child) => {
				if (!child.IsA("PlayerGui")) return;
				playerGuiConnection.Disconnect();

				child.GetAttributeChangedSignal("LOADING_COMPLETE").Connect(() => {
					this.flushServerNotificationQueue();
				});

				this.flushServerNotificationQueue();
			});
		}

		subscribe(activeMenuAtom, () => {
			this.flushServerNotificationQueue();
		});
	}

	private canDisplayServerNotifications() {
		const playerGui = Players.LocalPlayer.FindFirstChild("PlayerGui");
		if (!playerGui || !playerGui.IsA("PlayerGui")) return false;

		const loadingComplete = playerGui.GetAttribute("LOADING_COMPLETE") === true;
		const dailyRewardClosed = peek(activeMenuAtom) !== "DailyReward";

		return loadingComplete && dailyRewardClosed;
	}

	private flushServerNotificationQueue() {
		if (this.isProcessingServerNotifications) return;
		if (!this.canDisplayServerNotifications()) return;
		if (this.pendingServerNotifications.size() === 0) return;

		this.isProcessingServerNotifications = true;

		const showNext = () => {
			if (!this.canDisplayServerNotifications()) {
				this.isProcessingServerNotifications = false;
				return;
			}

			const nextNotification = this.pendingServerNotifications.shift();
			if (!nextNotification) {
				this.isProcessingServerNotifications = false;
				return;
			}

			this.NotificationEvent.Fire(nextNotification.text, nextNotification.sound);
			task.delay(this.SERVER_NOTIFICATION_DISPLAY_DURATION, showNext);
		};

		showNext();
	}

	private listenForTradeUpdates() {
		Events.NewTrade.connect((tradeId, trades) => {
			this.pendingUpdates.set("Trades", trades);
			this.scheduleUpdate();

			const trade = trades[tradeId];
			if (!trade) return;
			if (trade.initiator.user_id !== tostring(Players.LocalPlayer.UserId)) {
				this.NotificationEvent.Fire(
					`<font color="#80a9ea">@${trade.initiator.username}</font> just sent you a trade!`,
				);
			} else {
				this.NotificationEvent.Fire(
					`Your trade to <font color="#80a9ea">@${trade.receiver.username}</font> has been sent!`,
				);
			}
		});

		Events.TradeStatusUpdate.connect((tradeId, status) => {
			const newTrades = { ...this.Trades };
			if (newTrades[tradeId]) {
				newTrades[tradeId]!.status = status;
			}
			this.pendingUpdates.set("Trades", newTrades);
			this.scheduleUpdate();

			// ----------------------------------------------------------------
			// NOTIFICATIONS FOR TRADE STATUS CHANGES
			// ----------------------------------------------------------------
			const tradeInfo = newTrades[tradeId];
			if (!tradeInfo) return;

			const localUserId = tostring(Players.LocalPlayer.UserId);
			const isInitiator = tradeInfo.initiator.user_id === localUserId;
			const isReceiver = tradeInfo.receiver.user_id === localUserId;

			// If the local player SENT the trade, notify on accepted/declined
			if (isInitiator && (status === "accepted" || status === "declined")) {
				const targetUsername = tradeInfo.receiver.username;
				this.NotificationEvent.Fire(
					`<font color="#80a9ea">@${targetUsername}</font> <font color="#${
						{
							accepted: palette.profitGreen.ToHex(),
							declined: palette.lossRed.ToHex(),
						}[status]
					}">${status}</font> your trade request!`,
				);
			}

			if (isReceiver && status === "cancelled") {
				if (this.selfCancelledTrades.has(tradeId)) {
					this.selfCancelledTrades.delete(tradeId);
				} else {
					const initiatorUsername = tradeInfo.initiator.username;
					this.NotificationEvent.Fire(
						`<font color="#80a9ea">@${initiatorUsername}</font> just cancelled one of your inbound trades`,
					);
				}
			}
		});
	}

	private listenForLocalAttributeChanges() {
		Players.LocalPlayer.GetAttributeChangedSignal("Cash").Connect(() => {
			const cash = Players.LocalPlayer.GetAttribute("Cash");
			if (!typeIs(cash, "number")) return;
			this.pendingUpdates.set("Cash", cash);
			this.scheduleUpdate();
		});
	}

	private listenForPlayerListChanges() {
		Players.PlayerAdded.Connect(() => {
			this.updateAllPlayers();
		});
		Players.PlayerRemoving.Connect(() => {
			this.updateAllPlayers();
		});
	}

	/**
	 * Marks a trade as cancelled by the local player so we can suppress related notifications.
	 */
	public markTradeSelfCancelled(tradeId: string) {
		this.selfCancelledTrades.add(tradeId);
	}
}
