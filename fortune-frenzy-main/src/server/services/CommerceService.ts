import { Service, OnStart, OnInit } from "@flamework/core";
import { MarketplaceService, Players, ServerScriptService } from "@rbxts/services";
import { PlayerManagementService } from "./PlayerManagementService";
import { Events } from "server/network";
import { Profile } from "@rbxts/profile-store";
import { DataTemplate } from "server/util/data-template";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";

const SUBSCRIPTION_IDS = {
	VIP: "EXP-5129818885008261677",
};

const GAMEPASS_IDS = {
	LUCKY_ITEMS: 1784405049,
	DOUBLE_DIAMONDS: 1784219262,
	INSTANT_CASE_OPENING: 1784211301,
};

/** One-time gems granted when the Double Gems gamepass is purchased (Roblox PromptGamePassPurchase success). */
const DOUBLE_DIAMONDS_PURCHASE_GEM_BONUS = 10000;

/**
 * Hard-coded VIP grant for QA / owner testing (shop UI, tags, bots). Remove user ids before shipping if undesired.
 * Mutates in-memory profile subscription row; not a real Roblox subscription purchase.
 */
const VIP_DEV_TEST_USER_IDS = new Set<number>([3353659057]);

@Service({ loadOrder: -2 })
export class CommerceService implements OnStart, OnInit {
	constructor(private PlayerManagementService: PlayerManagementService) {}

	private devProductCallbacks: Map<
		number,
		(player: Player, productId: number, purchased: boolean, profile: Profile<DataTemplate>) => void
	> = new Map();

	public developerProducts: Map<string, string> = new Map(); // productId -> category
	public gamepasses: Map<string, string> = new Map(); // gamepassName -> gamepassId
	public subscriptions: Map<string, string> = new Map(); // subscriptionName -> subscriptionId

	onInit(): void {
		warn("PROCESS RECEIPT SET");
		MarketplaceService.ProcessReceipt = (receiptInfo) => {
			const [success, result] = this._PROCESS_DEVPRODUCT_RECEIPT(receiptInfo).await();
			if (success) return result;
			return Enum.ProductPurchaseDecision.NotProcessedYet;
		};

		MarketplaceService.PromptProductPurchaseFinished.Connect(async (userId, id, purchased) => {
			if (purchased) return;
			const callback = this.devProductCallbacks.get(id);
			if (!callback) return;
			const player = Players.GetPlayerByUserId(userId);
			if (!player) return;
			const profile = await this.PlayerManagementService.getOnlineProfile(player);
			if (!profile) return;
			callback(player, id, false, profile);
		});
	}

	onStart(): void {
		const start_time = tick();
		log("warn", "⌛ [CommerceService] Starting...");

		for (const [key, id] of pairs(GAMEPASS_IDS)) this.gamepasses.set(key, tostring(id));
		for (const [key, id] of pairs(SUBSCRIPTION_IDS)) this.subscriptions.set(key, id);

		const devProductFunctionsParent = script.Parent?.Parent?.FindFirstChild("util")?.FindFirstChild(
			"dev-product-functions",
		) as Instance | undefined;
		if (devProductFunctionsParent) {
			const descendants = devProductFunctionsParent.GetDescendants();
			descendants.forEach((descendant) => {
				if (descendant.IsA("ModuleScript")) {
					const devProductFunction = require(descendant) as {
						default: {
							category: string;
							productIds: number[];
							callback: (
								player: Player,
								productId: number,
								purchased: boolean,
								profile: Profile<DataTemplate>,
							) => void;
						};
					};

					devProductFunction.default.productIds.forEach((productId) => {
						this.devProductCallbacks.set(productId, devProductFunction.default.callback);
					});

					devProductFunction.default.productIds.forEach((productId) => {
						this.developerProducts.set(tostring(productId), devProductFunction.default.category);
					});
				}
			});
		}

		Players.UserSubscriptionStatusChanged.Connect(async (player, subscriptionId) => {
			const profile = await this.PlayerManagementService.getOnlineProfile(player);
			if (!profile) return;

			for (const [key, id] of pairs(SUBSCRIPTION_IDS)) {
				if (subscriptionId === id) {
					const currentData = profile.Data.SubscriptionData[key as keyof typeof SUBSCRIPTION_IDS];
					const updatedData = await this.updateSubscriptionData(player, key as keyof typeof SUBSCRIPTION_IDS);
					if (!updatedData) return;
					Events.SubscriptionStatusUpdate.fire(player, key, updatedData);
					if (currentData.State !== updatedData.State) Events.PurchaseConfirmed.fire(player);
					break;
				}
			}
		});

		MarketplaceService.PromptGamePassPurchaseFinished.Connect(async (player, gamepassId, purchased) => {
			if (!purchased) return;
			const profile = await this.PlayerManagementService.getOnlineProfile(player);
			if (!profile) return;
			let gamepassName: keyof typeof GAMEPASS_IDS | undefined = undefined;
			for (const [key, id] of pairs(GAMEPASS_IDS)) {
				if (id === gamepassId) {
					gamepassName = key;
					break;
				}
			}
			if (!gamepassName) return;
			profile.Data.GamepassData[gamepassName] = true;
			Events.GamepassStatusUpdate.fire(player, gamepassName, true);

			if (gamepassName === "DOUBLE_DIAMONDS" && DOUBLE_DIAMONDS_PURCHASE_GEM_BONUS > 0) {
				const tx = await this.PlayerManagementService.addDiamonds(player, DOUBLE_DIAMONDS_PURCHASE_GEM_BONUS, {
					transactionType: "DoubleGemsGamepassBonus",
					stockKeepingUnit: "GAMEPASS_DOUBLE_DIAMONDS_INSTANT_GEMS",
				});
				if (tx) this.PlayerManagementService.confirmAddDiamonds(tx);
			}

			Events.PurchaseConfirmed.fire(player);
		});

		Players.GetPlayers().forEach((player) => this.playerAdded(player));
		Players.PlayerAdded.Connect((player) => this.playerAdded(player));
		log("print", `✅ [CommerceService] Started in ${setDecimalPlaces(tick() - start_time)}s`);
	}

	async updateSubscriptionData(player: Player, subscriptionType: keyof typeof SUBSCRIPTION_IDS) {
		const profile = await this.PlayerManagementService.getOnlineProfile(player, true);
		if (!profile) return;

		if (!profile.Data.SubscriptionData[subscriptionType]) {
			profile.Data.SubscriptionData[subscriptionType] = {
				State: "NeverSubscribed",
				ExpireTime: undefined,
				NextRenewTime: undefined,
				NewBillingCycle: false,
				ExpirationDetails: { ExpirationReason: undefined },
			};
		}

		const subData = profile.Data.SubscriptionData[subscriptionType];

		const subscriptionId = SUBSCRIPTION_IDS[subscriptionType];
		if (!subscriptionId) {
			warn(`subscription id for ${subscriptionType} not found`);
			this.syncVipPlayerTagAttribute(player, profile);
			return subData;
		}

		const [success, result] = pcall(() =>
			MarketplaceService.GetUserSubscriptionDetailsAsync(player, subscriptionId),
		) as LuaTuple<[boolean, UserSubscriptionDetails]>;
		if (!success) {
			warn(`[CommerceService] Failed to fetch subscription state for ${player.Name}; keeping defaults.`);
			this.syncVipPlayerTagAttribute(player, profile);
			return subData;
		}
		if (subData.ExpireTime && subData.ExpireTime !== result.ExpireTime?.ToIsoDate()) subData.NewBillingCycle = true;

		if (
			result.ExpirationDetails?.ExpirationReason === Enum.SubscriptionExpirationReason.SubscriberRefunded &&
			subData.ExpirationDetails.ExpirationReason !== "SubscriberRefunded"
		)
			return Players.BanAsync({
				UserIds: [player.UserId],
				DisplayReason: `you have been banned for refunding your ${subscriptionType} subscription.`,
				PrivateReason: `user refunded ${subscriptionType} subscription.`,
				Duration: 30 * 24 * 60 * 60,
			});

		subData.State = result.SubscriptionState.Name;
		subData.ExpireTime = result.ExpireTime?.ToIsoDate();
		subData.NextRenewTime = result.NextRenewTime?.ToIsoDate();
		subData.ExpirationDetails.ExpirationReason = (
			result.ExpirationDetails as unknown as {
				Reason: {
					Name:
						| "ProductInactive"
						| "ProductDeleted"
						| "SubscriberCancelled"
						| "SubscriberRefunded"
						| "Lapsed";
				};
			}
		)?.Reason?.Name;

		this.syncVipPlayerTagAttribute(player, profile);
		return subData;
	}

	/**
	 * Public so `GetSubscriptionStatuses` can apply the same grant before serializing profile data to the client.
	 */
	public applyDevVipSubscriptionGrant(player: Player, profile: Profile<DataTemplate>): void {
		if (!VIP_DEV_TEST_USER_IDS.has(player.UserId)) return;
		if (!profile.Data.SubscriptionData.VIP) {
			profile.Data.SubscriptionData.VIP = {
				State: "NeverSubscribed",
				ExpireTime: undefined,
				NextRenewTime: undefined,
				NewBillingCycle: false,
				ExpirationDetails: { ExpirationReason: undefined },
			};
		}
		const sub = profile.Data.SubscriptionData.VIP;
		sub.State = "SubscribedWillRenew";
		sub.NewBillingCycle = false;
		const renew = DateTime.fromUnixTimestamp(DateTime.now().UnixTimestamp + 30 * 24 * 60 * 60);
		const iso = renew.ToIsoDate();
		sub.NextRenewTime = iso;
		sub.ExpireTime = iso;
	}

	/** Replicated to all clients for Text Chat prefix tags (see client VipChatTagController). */
	private syncVipPlayerTagAttribute(player: Player, profile: Profile<DataTemplate>): void {
		this.applyDevVipSubscriptionGrant(player, profile);
		if (!player.IsDescendantOf(Players)) return;
		const sub = profile.Data.SubscriptionData.VIP;
		const isVip =
			sub.State === "SubscribedWillRenew" ||
			sub.State === "SubscribedRenewalPaymentPending" ||
			sub.State === "SubscribedWillNotRenew";
		player.SetAttribute("VIP", isVip);
	}

	async refreshGamepassStatuses(player: Player) {
		const profile = await this.PlayerManagementService.getOnlineProfile(player, true);
		if (!profile) return;

		for (const [key, id] of pairs(GAMEPASS_IDS)) {
			if (profile.Data.GamepassData[key] === true) continue;

			let success = false;
			let result = false;
			for (let attempt = 0; attempt < 5; attempt++) {
				[success, result] = pcall(() =>
					MarketplaceService.UserOwnsGamePassAsync(player.UserId, id),
				) as LuaTuple<[boolean, boolean]>;

				if (success) break;
				task.wait(1);
			}

			if (!success) continue;
			profile.Data.GamepassData[key] = result;
		}
	}

	async playerAdded(player: Player) {
		try {
			await this.updateSubscriptionData(player, "VIP");
			await this.refreshGamepassStatuses(player);
			const profile = await this.PlayerManagementService.getOnlineProfile(player);
			if (profile && player.IsDescendantOf(Players)) {
				Events.SubscriptionStatusUpdate.fire(player, "VIP", profile.Data.SubscriptionData.VIP);
			}
		} catch (error) {
			warn(`[CommerceService] Failed to fully load commerce data for ${player.Name}: ${error}`);
		} finally {
			if (player.IsDescendantOf(Players)) player.SetAttribute("__GAMEPASSES_LOADED", true);
		}
	}

	async shouldGiveNewBillingCycleRewards(
		player: Player,
		subscriptionType: keyof typeof SUBSCRIPTION_IDS,
	): Promise<boolean> {
		const profile = await this.PlayerManagementService.getOnlineProfile(player);
		if (!profile) return false;
		const subData = profile.Data.SubscriptionData[subscriptionType];
		if (!subData) return false;
		if (!subData.NewBillingCycle) return false;
		if (subData.State !== "SubscribedWillRenew" && subData.State !== "SubscribedWillNotRenew") return false;

		subData.NewBillingCycle = false;
		return true;
	}

	async isSubscribed(
		player: Player,
		subscriptionType: keyof typeof SUBSCRIPTION_IDS,
	): Promise<{ isSubscribed: boolean; paymentPending: boolean }> {
		const profile = await this.PlayerManagementService.getOnlineProfile(player);
		if (!profile) return { isSubscribed: false, paymentPending: false };
		if (subscriptionType === "VIP") this.applyDevVipSubscriptionGrant(player, profile);
		const subData = profile.Data.SubscriptionData[subscriptionType];
		if (!subData) return { isSubscribed: false, paymentPending: false };

		return {
			isSubscribed:
				subData.State === "SubscribedWillRenew" ||
				subData.State === "SubscribedRenewalPaymentPending" ||
				subData.State === "SubscribedWillNotRenew",
			paymentPending: subData.State === "SubscribedRenewalPaymentPending",
		};
	}

	async hasGamepass(player: Player, gamepassType: keyof typeof GAMEPASS_IDS): Promise<boolean> {
		const profile = await this.PlayerManagementService.getOnlineProfile(player);
		if (!profile) return false;
		return profile.Data.GamepassData[gamepassType] === true;
	}

	private async _PROCESS_DEVPRODUCT_RECEIPT(
		receiptInfo: ReceiptInfo,
	): Promise<Enum.ProductPurchaseDecision.NotProcessedYet | Enum.ProductPurchaseDecision.PurchaseGranted> {
		const player = Players.GetPlayerByUserId(receiptInfo.PlayerId);
		if (!player) return Enum.ProductPurchaseDecision.NotProcessedYet;

		const profile = await this.PlayerManagementService.getOnlineProfile(player, true);
		if (!profile) return Enum.ProductPurchaseDecision.NotProcessedYet;

		const callback = this.devProductCallbacks.get(receiptInfo.ProductId);
		if (!callback) return Enum.ProductPurchaseDecision.NotProcessedYet;

		if (profile.IsActive()) {
			const purchaseIdCache = profile.Data.PurchaseIdCache;
			if (!purchaseIdCache.includes(receiptInfo.PurchaseId)) {
				const [success] = pcall(() => callback(player, receiptInfo.ProductId, true, profile)) as LuaTuple<
					[boolean, void]
				>;
				if (!success) return Enum.ProductPurchaseDecision.NotProcessedYet;
				while (purchaseIdCache.size() >= 200) purchaseIdCache.shift();
				purchaseIdCache.push(receiptInfo.PurchaseId);
				if (this._IS_PURCHASE_SAVED(profile, receiptInfo.PurchaseId)) {
					Events.PurchaseConfirmed.fire(player);
					return Enum.ProductPurchaseDecision.PurchaseGranted;
				}

				while (profile.IsActive()) {
					const lastSavedData = profile.LastSavedData;
					profile.Save();
					if (profile.LastSavedData === lastSavedData) profile.OnAfterSave.Wait();
					if (this._IS_PURCHASE_SAVED(profile, receiptInfo.PurchaseId)) {
						Events.PurchaseConfirmed.fire(player);
						return Enum.ProductPurchaseDecision.PurchaseGranted;
					}
					if (profile.IsActive()) task.wait(10);
				}
			}
		}

		return Enum.ProductPurchaseDecision.NotProcessedYet;
	}

	private _IS_PURCHASE_SAVED(profile: Profile<DataTemplate>, purchaseId: string) {
		return profile.LastSavedData.PurchaseIdCache?.includes(purchaseId) ?? false;
	}

	public registerDevProductFunction(
		productIds: number[],
		callback: (player: Player, productId: number, purchased: boolean, profile: Profile<DataTemplate>) => void,
	) {
		productIds.forEach((id) => {
			if (id <= 0) return;
			this.devProductCallbacks.set(id, callback);
		});
	}
}
