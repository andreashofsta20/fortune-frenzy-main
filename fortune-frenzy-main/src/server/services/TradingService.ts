import { Service, OnStart } from "@flamework/core";
import { HttpService, Players, ServerScriptService } from "@rbxts/services";
import { Request } from "server/util/packeter";
import { Events } from "server/network";
import { PlayerManagementService } from "./PlayerManagementService";
import { ItemManagementService } from "./ItemManagementService";
import { Profile } from "@rbxts/profile-store";
import { DataTemplate } from "server/util/data-template";
import {
	AcceptTradeResponse,
	CancelTradeResponse,
	CreateTradeResponse,
	GetTradesResponse,
	Trade,
} from "typings/APIResponses";
import { GetUAIDsForOnlineInventory } from "server/util/get-uaid-from-quantity";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";
import getPollingCooldown from "server/util/get-polling-cooldown";

@Service()
export class TradingService implements OnStart {
	public Trades = new Array<Trade>();
	private sentNotifications = new Set<string>();
	private readonly CLEANUP_INTERVAL = 300; // 5 minutes
	private readonly NOTIFICATION_EXPIRY = 3600; // 1 hour in seconds
	private readonly MAX_TRADE_UNIQUE_ITEMS = 8;
	private readonly MAX_TRADE_ITEM_QUANTITY = 999;

	constructor(
		private playerManagementService: PlayerManagementService,
		private itemManagementService: ItemManagementService,
	) {}

	private shouldNotify(player: Player | undefined, tradeId: number, change: string) {
		return player !== undefined && !this.sentNotifications.has(`${tradeId}-${player.UserId}-${change}`);
	}

	private sendNotification(
		player: Player,
		tradeId: number,
		change: string,
		status: "pending" | "accepted" | "declined" | "cancelled" | "failed",
	) {
		this.sentNotifications.add(`${tradeId}-${player.UserId}-${change}`);
		task.delay(60, () => this.sentNotifications.delete(`${tradeId}-${player.UserId}-${change}`));
		Events.TradeStatusUpdate(player, tostring(tradeId), status);
	}

	private updateProfileTradeStatus(profile: Profile<DataTemplate> | undefined, trade: Trade) {
		if (!profile) return;
		profile.Data.Trades[tostring(trade.trade_id)] = trade;
	}

	private getSafeUserId(str: string): number {
		return tonumber(str) ?? 0;
	}

	private async isUserActiveInAnyServer(userId: number): Promise<boolean> {
		if (Players.GetPlayerByUserId(userId)) return true;

		const request = await new Request("GET", `/users/${userId}/active`).GetResponse<{ active?: boolean }>();
		if (request.Code !== 200) return false;
		return request.Response.active === true;
	}

	private selectUAIDsFromItemCounts(
		inventory: [string, string, string, string][],
		requestedItems: Record<string, number>,
	): string[] | undefined {
		const grouped = new Map<string, string[]>();
		for (const [itemId, uaid] of inventory) {
			if (!grouped.has(itemId)) grouped.set(itemId, []);
			grouped.get(itemId)!.push(uaid);
		}

		const selectedUAIDs = new Array<string>();
		for (const [itemId, rawCount] of pairs(requestedItems)) {
			const count = math.max(0, math.floor(rawCount as number));
			if (count <= 0) continue;

			const availableUAIDs = grouped.get(itemId as string) ?? [];
			if (availableUAIDs.size() < count) return undefined;

			for (let i = 0; i < count; i++) {
				selectedUAIDs.push(availableUAIDs[i]);
			}
		}

		return selectedUAIDs;
	}

	private validateAndNormalizeTradeItems(
		requestedItems: Record<string, number>,
		label: string,
	): LuaTuple<[Record<string, number> | undefined, string | undefined]> {
		const normalized = {} as Record<string, number>;
		let uniqueItemCount = 0;

		for (const [rawItemId, rawCount] of pairs(requestedItems)) {
			const itemId = tostring(rawItemId ?? "");
			if (itemId.size() === 0) continue;

			const count = math.max(0, math.floor(tonumber(rawCount) ?? 0));
			if (count <= 0) continue;

			if (count > this.MAX_TRADE_ITEM_QUANTITY) {
				return $tuple(
					undefined,
					`${label} cannot include more than ${this.MAX_TRADE_ITEM_QUANTITY} copies of one item`,
				);
			}

			if (normalized[itemId] !== undefined) continue;

			uniqueItemCount += 1;
			if (uniqueItemCount > this.MAX_TRADE_UNIQUE_ITEMS) {
				return $tuple(undefined, `${label} can only include ${this.MAX_TRADE_UNIQUE_ITEMS} unique items`);
			}

			normalized[itemId] = count;
		}

		return $tuple(normalized, undefined);
	}

	private hasRequestedTradeItems(itemCounts: Record<string, number>) {
		for (const [, quantity] of pairs(itemCounts)) {
			if ((quantity as number) > 0) return true;
		}

		return false;
	}

	private upsertLocalTrade(trade: Trade): string | undefined {
		const existingIndex = this.Trades.findIndex((t) => t.trade_id === trade.trade_id);

		if (existingIndex === -1) {
			this.Trades.push(trade);
			return undefined;
		} else {
			const oldStatus = this.Trades[existingIndex].status;
			this.Trades[existingIndex] = trade;
			return oldStatus;
		}
	}

	private handleTradeStatusChange(trade: Trade, oldStatus: string | undefined) {
		const { initiator, receiver, status } = trade;
		if (!oldStatus || oldStatus === status) return;

		const initiatorId = this.getSafeUserId(initiator.user_id);
		const receiverId = this.getSafeUserId(receiver.user_id);
		const initiatorPlayer = Players.GetPlayerByUserId(initiatorId);
		const receiverPlayer = Players.GetPlayerByUserId(receiverId);

		const statusMapping: Record<string, string> = {
			declined: "got_declined",
			accepted: "got_accepted",
			cancelled: "got_cancelled",
		};

		const newStatusTag = statusMapping[status] || "other";
		switch (status) {
			case "declined":
			case "accepted": {
				if (initiatorPlayer) {
					Events.TradeStatusUpdate(initiatorPlayer, tostring(trade.trade_id), status);
				}
				if (receiverPlayer && this.shouldNotify(receiverPlayer, trade.trade_id, newStatusTag)) {
					this.sendNotification(receiverPlayer, trade.trade_id, newStatusTag, status);
				}
				if (status === "accepted") {
					warn("refreshing inventory because trade was accepted");
					if (initiatorPlayer) this.playerManagementService.refreshInventory(initiatorPlayer);
					if (receiverPlayer) this.playerManagementService.refreshInventory(receiverPlayer);
				}
				break;
			}
			case "cancelled": {
				if (receiverPlayer) {
					Events.TradeStatusUpdate(receiverPlayer, tostring(trade.trade_id), status);
				}
				if (initiatorPlayer && this.shouldNotify(initiatorPlayer, trade.trade_id, newStatusTag)) {
					this.sendNotification(initiatorPlayer, trade.trade_id, newStatusTag, status);
				}
				break;
			}
		}
	}

	private async refreshTradesLoop() {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			await this.updateTrades();
			task.wait(getPollingCooldown());
		}
	}

	private async updateTrades() {
		const players = Players.GetPlayers();
		if (players.isEmpty()) return;

		const playerIds = players.map((p) => p.UserId).join(",");
		if (playerIds.size() === 0) return;

		const request = await new Request("GET", `/trades/${playerIds}`).GetResponse();
		if (request.Code !== 200) return;

		const response = request.Response as GetTradesResponse;

		for (const trade of response.trades) {
			const tradeId = tostring(trade.trade_id);

			const initiatorPlayer = Players.GetPlayerByUserId(this.getSafeUserId(trade.initiator.user_id));
			const receiverPlayer = Players.GetPlayerByUserId(this.getSafeUserId(trade.receiver.user_id));
			const initiatorProfile = initiatorPlayer
				? await this.playerManagementService.getOnlineProfile(initiatorPlayer)
				: undefined;
			const receiverProfile = receiverPlayer
				? await this.playerManagementService.getOnlineProfile(receiverPlayer)
				: undefined;

			this.updateProfileTradeStatus(initiatorProfile, trade);
			this.updateProfileTradeStatus(receiverProfile, trade);

			const oldStatus = this.upsertLocalTrade(trade);

			if (!oldStatus) {
				const creationTime = DateTime.fromIsoDate(trade.created_at);
				const inboundKey = `${tradeId}-${receiverPlayer?.UserId}-inbound`;

				if (
					creationTime &&
					creationTime.UnixTimestamp + 60 > DateTime.now().UnixTimestamp &&
					trade.status === "pending" &&
					receiverProfile &&
					receiverPlayer &&
					!this.sentNotifications.has(inboundKey)
				) {
					this.sentNotifications.add(inboundKey);
					task.delay(60, () => this.sentNotifications.delete(inboundKey));

					Events.NewTrade.fire(receiverPlayer, tradeId, receiverProfile.Data.Trades);
				}
			} else {
				this.handleTradeStatusChange(trade, oldStatus);
			}
		}

		playerIds.split(",").forEach((idStr) => {
			const userId = tonumber(idStr);
			if (userId) {
				const plr = Players.GetPlayerByUserId(userId);
				plr?.SetAttribute("__TRADES_UPDATED", true);
			}
		});
	}

	onStart() {
		const start_time = tick();
		log("warn", "⌛ [TradingService] Starting...");

		task.spawn(() => {
			while (task.wait(this.CLEANUP_INTERVAL)) {
				this.cleanupTrades();
			}
		});

		task.spawn(() => {
			this.refreshTradesLoop();
		});

		Players.PlayerRemoving.Connect((player) => this.handlePlayerLeave(player));

		log("print", `✅ [TradingService] Started in ${setDecimalPlaces(tick() - start_time)}ms`);
	}

	private cleanupTrades() {
		const currentTime = tick();
		this.Trades = this.Trades.filter((trade) => {
			if (trade.status === "cancelled") {
				const tradeTime = os.time(os.date("!*t", tonumber(trade.updated_at) ?? 0));
				return currentTime - tradeTime < 3600; // Keep trades from last hour
			}
			return true;
		});

		const notificationsToRemove: string[] = [];
		this.sentNotifications.forEach((notificationId) => {
			const [, timeStr] = notificationId.split("_");
			const notificationTime = tonumber(timeStr);
			if (notificationTime && currentTime - notificationTime > this.NOTIFICATION_EXPIRY) {
				notificationsToRemove.push(notificationId);
			}
		});
		notificationsToRemove.forEach((id) => this.sentNotifications.delete(id));
	}

	private handlePlayerLeave(player: Player) {
		const userId = tostring(player.UserId);
		this.Trades.forEach((trade) => {
			if (
				(trade.status === "pending" || trade.status === "accepted") &&
				(trade.initiator.user_id === userId || trade.receiver.user_id === userId)
			) {
				this.cancelTrade(player, tostring(trade.trade_id));
			}
		});

		const playerNotifications = new Array<string>();
		this.sentNotifications.forEach((notificationId) => {
			if (notificationId.match(`${userId}`)[0]) {
				playerNotifications.push(notificationId);
			}
		});
		playerNotifications.forEach((id) => this.sentNotifications.delete(id));
	}

	async createTrade(
		initiator: Player,
		receiver_id: number,
		initiatorItems: { [itemId: string]: number },
		receiverItems: { [itemId: string]: number },
	): Promise<{ status: string; message?: string; code?: number | string }> {
		const [normalizedInitiatorItems, initiatorValidationError] = this.validateAndNormalizeTradeItems(
			initiatorItems,
			"Your offer",
		);
		if (!normalizedInitiatorItems) {
			return { status: "error", code: 400, message: initiatorValidationError ?? "Invalid initiator items" };
		}

		const [normalizedReceiverItems, receiverValidationError] = this.validateAndNormalizeTradeItems(
			receiverItems,
			"Your requested offer",
		);
		if (!normalizedReceiverItems) {
			return { status: "error", code: 400, message: receiverValidationError ?? "Invalid receiver items" };
		}

		if (
			!this.hasRequestedTradeItems(normalizedInitiatorItems) ||
			!this.hasRequestedTradeItems(normalizedReceiverItems)
		) {
			return { status: "error", code: 400, message: "Both sides must include at least one item" };
		}

		const sessionProfile = this.playerManagementService.getSessionOnlyProfile(initiator);
		if (!sessionProfile) return { status: "error", code: 400, message: "Profile not found" };
		if (receiver_id === initiator.UserId) {
			return { status: "error", code: 400, message: "Cannot trade with yourself" };
		}

		const receiverPlayer = Players.GetPlayerByUserId(receiver_id);
		let receiverProfile: Profile<DataTemplate> | undefined;
		if (receiverPlayer) {
			receiverProfile = await this.playerManagementService.getOnlineProfile(receiverPlayer, true);
			if (!receiverProfile) {
				return { status: "error", code: 400, message: "Receiver profile not loaded" };
			}
		} else {
			const receiverIsActiveInGame = await this.isUserActiveInAnyServer(receiver_id);
			if (!receiverIsActiveInGame) {
				return { status: "error", code: 404, message: "Player must be active in-game to trade" };
			}
		}

		await this.playerManagementService.refreshInventory(initiator);

		const initiatorSelectedUAIDs = GetUAIDsForOnlineInventory(
			this.itemManagementService,
			this.playerManagementService,
			initiator,
			normalizedInitiatorItems,
		);
		if (initiatorSelectedUAIDs.size() === 0) {
			return {
				status: "error",
				code: 400,
				message: "Invalid initiator items (inventory may be out of sync)",
			};
		}

		let receiverSelectedUAIDs: string[] | undefined;
		if (receiverPlayer) {
			receiverSelectedUAIDs = GetUAIDsForOnlineInventory(
				this.itemManagementService,
				this.playerManagementService,
				receiverPlayer,
				normalizedReceiverItems,
			);
		} else {
			const receiverInventory = await this.playerManagementService.getOfflineUserInventory(receiver_id);
			receiverSelectedUAIDs = this.selectUAIDsFromItemCounts(receiverInventory, normalizedReceiverItems);
		}

		if (!receiverSelectedUAIDs || receiverSelectedUAIDs.size() === 0) {
			return { status: "error", code: 400, message: "Invalid receiver items" };
		}

		const createResponse = await new Request("POST", "/trades/create", undefined, {
			initiator_id: tostring(initiator.UserId),
			receiver_id: tostring(receiver_id),
			initiator_items: initiatorSelectedUAIDs,
			receiver_items: receiverSelectedUAIDs,
			initiator_item_counts: normalizedInitiatorItems,
			receiver_item_counts: normalizedReceiverItems,
		}).GetResponse();

		if (createResponse.Code !== 200) {
			const response = createResponse.Response as { error: string };
			if (response.error === "Initiator items unavailable") {
				await this.playerManagementService.refreshInventory(initiator);
				return {
					status: "error",
					code: createResponse.Code,
					message: "Initiator items unavailable (try re-opening inventory)",
				};
			}
			return { status: "error", code: createResponse.Code, message: response.error };
		}

		const responseData = createResponse.Response as CreateTradeResponse;
		const newTrade = responseData.data;
		this.Trades.push(newTrade);
		const initiatorProfile = await this.playerManagementService.getOnlineProfile(initiator);

		if (receiverPlayer && receiverProfile) {
			const inboundKey = `${newTrade.trade_id}-${receiverPlayer.UserId}-inbound`;
			this.sentNotifications.add(inboundKey);
			task.delay(60, () => this.sentNotifications.delete(inboundKey));

			receiverProfile.Data.Trades[tostring(newTrade.trade_id)] = newTrade;
			Events.NewTrade.fire(receiverPlayer, tostring(newTrade.trade_id), receiverProfile.Data.Trades);
		}

		if (initiatorProfile) {
			initiatorProfile.Data.Trades[tostring(newTrade.trade_id)] = newTrade;
			Events.NewTrade.fire(initiator, tostring(newTrade.trade_id), initiatorProfile.Data.Trades);
		}

		return { status: "success", code: 200 };
	}

	async acceptTrade(player: Player, tradeId: string): Promise<{ status: string; message?: string; code?: number }> {
		const profile = await this.playerManagementService.getOnlineProfile(player);
		if (!profile) {
			return { status: "error", code: 400, message: "Profile not found" };
		}

		const localTrade = this.Trades.find((t) => t.trade_id === tonumber(tradeId));
		if (!localTrade) {
			return { status: "error", code: 400, message: "Trade not found" };
		}
		if (localTrade.status !== "pending") {
			return { status: "error", code: 400, message: "Trade is not pending" };
		}
		if (localTrade.receiver.user_id !== tostring(player.UserId)) {
			return { status: "error", code: 400, message: "Cannot accept your own outbound trade" };
		}

		const acceptResponse = await new Request("POST", `/trades/${tradeId}/accept`).GetResponse();
		if (acceptResponse.Code !== 200) {
			const response = acceptResponse.Response as { error: string };
			if (response.error === "Item transfer failed") {
				profile.Data.Trades[tradeId].status = "failed";
				this.sendNotification(player, tonumber(tradeId)!, "got_failed", "failed");

				const initiatorUserId = tonumber(localTrade.initiator.user_id) || 0;
				const initiatorPlayer = Players.GetPlayerByUserId(initiatorUserId);
				const initiatorProfile = await this.playerManagementService.getOnlineProfile(initiatorPlayer);
				if (initiatorProfile && initiatorPlayer) {
					initiatorProfile.Data.Trades[tradeId].status = "failed";
					this.sendNotification(initiatorPlayer, tonumber(tradeId)!, "got_failed", "failed");
				}
			}

			return { status: "error", code: 500, message: "Failed to accept trade" };
		}

		const response = acceptResponse.Response as AcceptTradeResponse;
		const newStatus = response.tradeStatus;

		const initiatorPlayer = Players.GetPlayerByUserId(tonumber(localTrade.initiator.user_id) || 0);
		const initiatorProfile = await this.playerManagementService.getOnlineProfile(initiatorPlayer);

		if (initiatorProfile && initiatorPlayer) {
			initiatorProfile.Data.Trades[tradeId].status = newStatus;
			this.sendNotification(initiatorPlayer, tonumber(tradeId)!, "got_accepted", "accepted");
			this.playerManagementService.refreshInventory(initiatorPlayer);
		}

		profile.Data.Trades[tradeId].status = newStatus;
		this.sendNotification(player, tonumber(tradeId)!, "got_accepted", "accepted");
		this.playerManagementService.refreshInventory(player);

		const localIndex = this.Trades.findIndex((t) => t.trade_id === tonumber(tradeId));
		this.Trades[localIndex].status = newStatus;

		return { status: "success", code: 200 };
	}

	async cancelTrade(player: Player, tradeId: string): Promise<{ status: string; message?: string; code?: number }> {
		const profile = await this.playerManagementService.getOnlineProfile(player);
		if (!profile) return { status: "error", code: 400, message: "Profile not found" };
		const localTrade = this.Trades.find((t) => t.trade_id === tonumber(tradeId));
		if (!localTrade) {
			// check if its in their profile
			if (profile.Data.Trades[tradeId]) {
				profile.Data.Trades[tradeId].status = "cancelled";
				this.sendNotification(player, tonumber(tradeId)!, "got_cancelled", "cancelled");
				return { status: "success", code: 200 };
			}

			return { status: "error", code: 400, message: "Trade not found" };
		}
		if (localTrade.status !== "pending") return { status: "error", code: 400, message: "Trade is not pending" };
		const userRole = localTrade.receiver.user_id === tostring(player.UserId) ? "receiver" : "initiator";

		const cancelResponse = await new Request("POST", `/trades/${tradeId}/cancel`, undefined, {
			user_role: userRole,
		}).GetResponse();

		if (cancelResponse.Code !== 200) {
			const response = cancelResponse.Response as { error: string };
			if (response.error === "Trade not found") {
				profile.Data.Trades[tradeId].status = "cancelled";
				this.sendNotification(player, tonumber(tradeId)!, "got_cancelled", "cancelled");
				return { status: "success", code: 200 };
			}

			return { status: "error", code: 500, message: "Failed to cancel trade" };
		}

		const response = cancelResponse.Response as CancelTradeResponse;
		const newStatus = response.tradeStatus;
		const otherUserId =
			userRole === "receiver"
				? tonumber(localTrade.initiator.user_id) || 0
				: tonumber(localTrade.receiver.user_id) || 0;
		const otherPlayer = Players.GetPlayerByUserId(otherUserId);
		const otherProfile = await this.playerManagementService.getOnlineProfile(otherPlayer);

		if (otherProfile && otherPlayer) {
			otherProfile.Data.Trades[tradeId].status = newStatus;
			this.sendNotification(otherPlayer, tonumber(tradeId)!, "got_cancelled", "cancelled");
		}

		profile.Data.Trades[tradeId].status = newStatus;
		this.sendNotification(player, tonumber(tradeId)!, "got_cancelled", "cancelled");
		const localIndex = this.Trades.findIndex((t) => t.trade_id === tonumber(tradeId));
		this.Trades[localIndex].status = newStatus;

		return { status: "success", code: 200 };
	}

	async getTrades(player: Player): Promise<Record<string, Trade>> {
		const profile = await this.playerManagementService.getOnlineProfile(player);
		return profile ? profile.Data.Trades : {};
	}
}
