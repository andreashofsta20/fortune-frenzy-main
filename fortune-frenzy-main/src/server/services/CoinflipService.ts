/* eslint-disable no-constant-condition */
import { Service, OnStart } from "@flamework/core";
import { Coinflip, CreateCoinflipResponse, GetCoinflipsResponse } from "typings/APIResponses";
import { PlayerManagementService } from "./PlayerManagementService";
import { ItemManagementService } from "./ItemManagementService";
import { Request } from "server/util/packeter";
import { Events } from "server/network";
import { HttpService, Players, ServerScriptService } from "@rbxts/services";
import { GetUAIDsForOnlineInventory } from "server/util/get-uaid-from-quantity";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";
import getPollingCooldown from "server/util/get-polling-cooldown";
import { getCoinflipJoinValueRange } from "shared/util/coinflip-join-range";

@Service()
export class CoinflipService implements OnStart {
	private readonly COMPLETED_CLEANUP_INTERVAL = 30;
	private supportsGlobalCompletedCleanup = true;

	constructor(
		private PlayerManagementService: PlayerManagementService,
		private ItemManagementService: ItemManagementService,
	) {}

	public Coinflips = new Array<Coinflip>();

	private getCoinflipItemValue(items: string[] | undefined) {
		if (!items) return 0;

		return items.reduce((sum, entry) => {
			const split = entry.split(":");
			const uaid = split[0] ?? entry;
			const encodedItemId = split[1];
			const itemId = this.ItemManagementService.getItemIdFromUAID(uaid) ?? encodedItemId ?? entry;
			const item = this.ItemManagementService.ItemInfo.get(itemId);
			return item ? sum + item.value : sum;
		}, 0);
	}

	private getSelectedItemValue(items: { [itemId: string]: number }) {
		let totalValue = 0;

		for (const [rawItemKey, rawAmount] of pairs(items)) {
			const amount = tonumber(rawAmount) ?? 0;
			if (amount <= 0) continue;

			const itemKey = tostring(rawItemKey);
			const split = itemKey.split(":");
			const keyPrefix = split[0] ?? itemKey;
			const encodedItemId = split[1];
			const resolvedItemId =
				this.ItemManagementService.getItemIdFromUAID(keyPrefix) ??
				encodedItemId ??
				this.ItemManagementService.getItemIdFromUAID(itemKey) ??
				itemKey;

			const itemData =
				this.ItemManagementService.ItemInfo.get(resolvedItemId) ?? this.ItemManagementService.ItemInfo.get(itemKey);
			if (!itemData) continue;

			totalValue += itemData.value * amount;
		}

		return totalValue;
	}

	private handleCoinflipCompleted(coinflip: Coinflip) {
		if (!coinflip.player2) return;
		if (!coinflip.winning_coin) return;

		const player1 = Players.GetPlayerByUserId(tonumber(coinflip.player1.id) ?? 0);
		const player2 = Players.GetPlayerByUserId(tonumber(coinflip.player2.id) ?? 0);
		const player1Stake = this.getCoinflipItemValue(coinflip.player1_items);
		const player2Stake = this.getCoinflipItemValue(coinflip.player2_items);
		const totalPot = player1Stake + player2Stake;
		const player1Won = coinflip.winning_coin === coinflip.player1_coin;

		if (player1) {
			this.PlayerManagementService.recordMinigameOutcome(
				player1,
				"Coinflip",
				player1Won,
				player1Won ? totalPot : 0,
				player1Stake,
			);
		}

		if (player2) {
			this.PlayerManagementService.recordMinigameOutcome(
				player2,
				"Coinflip",
				!player1Won,
				player1Won ? 0 : totalPot,
				player2Stake,
			);
		}
	}

	async onStart() {
		const start_time = tick();
		log("warn", "⌛ [CoinflipService] Starting...");

		task.spawn(async () => {
			async function updateCoinflips(
				CoinflipService: CoinflipService,
				PlayerManagementService: PlayerManagementService,
			) {
				const request = await new Request("GET", `/coinflips`, undefined, undefined, {
					server_id: ServerScriptService.GetAttribute("server_id") as string,
				}).GetResponse();
				if (request.Code !== 200) return;
				const response = request.Response as GetCoinflipsResponse;

				const responseCoinflipIds = new Set(response.coinflips.map((coinflip) => coinflip.id));
				const removedCoinflips = CoinflipService.Coinflips.filter(
					(cf) => !responseCoinflipIds.has(cf.id) || cf.locked,
				).map((cf) => cf.id);
				CoinflipService.Coinflips = CoinflipService.Coinflips.filter((cf) => !removedCoinflips.includes(cf.id));

				const coinflipMap = new Map(CoinflipService.Coinflips.map((cf) => [cf.id, cf]));
				const updatedCoinflips: Coinflip[] = [];

				response.coinflips.forEach((coinflip) => {
					const existingCoinflip = coinflipMap.get(coinflip.id);
					if (existingCoinflip) {
						if (
							existingCoinflip.status !== coinflip.status ||
							existingCoinflip.player2?.id !== coinflip.player2?.id
						) {
							if (existingCoinflip.status !== "completed" && coinflip.status === "completed") {
								CoinflipService.handleCoinflipCompleted(coinflip);
							}

							coinflipMap.set(coinflip.id, coinflip);
							const cfIndex = CoinflipService.Coinflips.findIndex((cf) => cf.id === coinflip.id);
							if (cfIndex !== -1) {
								CoinflipService.Coinflips[cfIndex] = coinflip;
							}
							updatedCoinflips.push(coinflip);
							if (coinflip.status === "completed") {
								const player1 = Players.GetPlayerByUserId(tonumber(coinflip.player1.id) || 0);
								const player2 = Players.GetPlayerByUserId(tonumber(coinflip.player2?.id) || 0);
								if (player1) PlayerManagementService.refreshInventory(player1, 3.5);
								if (player2) PlayerManagementService.refreshInventory(player2, 3.5);
							}
						}
					} else {
						CoinflipService.Coinflips.push(coinflip);
						coinflipMap.set(coinflip.id, coinflip);
						updatedCoinflips.push(coinflip);
					}
				});

				if (updatedCoinflips.size() > 0 || removedCoinflips.size() > 0) {
					Events.CoinflipsUpdated.broadcast({
						updated: updatedCoinflips,
						removed: removedCoinflips,
					});
				}
			}

			while (true) {
				await updateCoinflips(this, this.PlayerManagementService);
				task.wait(getPollingCooldown());
			}
		});
		this.startCompletedCoinflipCleanup();

		log("print", `✅ [CoinflipService] Started in ${setDecimalPlaces(tick() - start_time)}s`);
	}

	private startCompletedCoinflipCleanup(): void {
		task.spawn(async () => {
			while (task.wait(this.COMPLETED_CLEANUP_INTERVAL)) {
				await this.cleanupCompletedCoinflipsGlobally();

				const completedCoinflipIds = this.Coinflips.filter((coinflip) => coinflip.status === "completed").map(
					(coinflip) => coinflip.id,
				);
				if (completedCoinflipIds.size() === 0) continue;

				this.Coinflips = this.Coinflips.filter((coinflip) => coinflip.status !== "completed");
				Events.CoinflipsUpdated.broadcast({
					updated: [],
					removed: completedCoinflipIds,
				});
			}
		});
	}

	private async cleanupCompletedCoinflipsGlobally(): Promise<void> {
		if (!this.supportsGlobalCompletedCleanup) return;

		try {
			const response = await new Request("POST", "/coinflip/cleanup-completed").GetResponse();
			if (response.Code === 404 || response.Code === 405) {
				this.supportsGlobalCompletedCleanup = false;
			}
		} catch (error) {
			log("warn", `[CoinflipService] Failed global completed cleanup: ${error}`);
		}
	}

	async createCoinflip(
		player: Player,
		items: { [itemId: string]: number },
		coin?: string,
	): Promise<{ status: string; message?: string; code?: number | string }> {
		for (const coinflip of this.Coinflips) {
			if (coinflip.player1.id === tostring(player.UserId) || coinflip.player2?.id === tostring(player.UserId)) {
				if (coinflip.status !== "completed" && coinflip.status !== "failed") {
					return { status: "error", code: 400, message: "Already in a coinflip" };
				}
			}
		}

		let totalSelectedItems = 0;
		for (const [, amount] of pairs(items)) totalSelectedItems += amount;

		if (totalSelectedItems > 10) {
			return { status: "error", code: 400, message: "Cannot select more than 10 items" };
		}

		const selectUAIDs = () =>
			GetUAIDsForOnlineInventory(this.ItemManagementService, this.PlayerManagementService, player, items);
		const createWithUAIDs = (selectedUAIDs: string[]) =>
			new Request("POST", `/coinflip/create/${ServerScriptService.GetAttribute("server_id")}`, undefined, {
				user_id: player.UserId,
				items: selectedUAIDs,
				item_counts: items,
				coin: coin === "Heads" ? 1 : 2,
				type: "global",
			}).GetResponse();

		let selectedUAIDsArray = selectUAIDs();
		if (selectedUAIDsArray.size() < totalSelectedItems) {
			try {
				await this.PlayerManagementService.refreshInventory(player);
			} catch (error) {
				warn(`[CoinflipService] Failed to refresh inventory before create for ${player.UserId}: ${error}`);
			}

			selectedUAIDsArray = selectUAIDs();
			if (selectedUAIDsArray.size() < totalSelectedItems) {
				return {
					status: "error",
					code: 400,
					message: "Some selected copies are unavailable or locked. Reopen inventory and try again.",
				};
			}
		}

		let request = await createWithUAIDs(selectedUAIDsArray);

		if (request.Code !== 200) {
			const payload = request.Response as { message?: string; error?: string };
			const message = payload.message ?? payload.error ?? "Failed to create coinflip";
			const lowerMessage = string.lower(message);
			const shouldRetryInventory =
				request.Code === 400 &&
				(string.find(lowerMessage, "item") !== undefined ||
					string.find(lowerMessage, "uaid") !== undefined ||
					string.find(lowerMessage, "inventory") !== undefined ||
					string.find(lowerMessage, "copy") !== undefined);

			if (!shouldRetryInventory) {
				return { status: "error", code: request.Code, message };
			}

			try {
				await this.PlayerManagementService.refreshInventory(player);
			} catch (error) {
				warn(
					`[CoinflipService] Failed to refresh inventory before create retry for ${player.UserId}: ${error}`,
				);
				return {
					status: "error",
					code: 400,
					message: "Unable to sync your inventory right now. Please wait a moment and try again.",
				};
			}

			selectedUAIDsArray = selectUAIDs();
			if (selectedUAIDsArray.size() < totalSelectedItems) {
				return {
					status: "error",
					code: 400,
					message: "Some selected copies are unavailable or locked. Reopen inventory and try again.",
				};
			}

			request = await createWithUAIDs(selectedUAIDsArray);
			if (request.Code !== 200) {
				const retryPayload = request.Response as { message?: string; error?: string };
				return {
					status: "error",
					code: request.Code,
					message: retryPayload.message ?? retryPayload.error ?? "Failed to create coinflip",
				};
			}
		}

		const response = request.Response as CreateCoinflipResponse;
		const coinflipData = response.data;

		this.Coinflips.push(coinflipData);
		Events.CoinflipsUpdated.broadcast({
			updated: [coinflipData],
			removed: [],
		});

		try {
			await this.PlayerManagementService.refreshInventory(player);
		} catch (error) {
			warn(`[CoinflipService] Failed to refresh inventory after create for ${player.UserId}: ${error}`);
		}

		return { status: "success", message: coinflipData.id, code: 200 };
	}

	async cancelCoinflip(
		player: Player,
		coinflipId: string,
	): Promise<{ status: string; message?: string; code?: number }> {
		const coinflip = this.Coinflips.find((cf) => cf.id === coinflipId);
		if (!coinflip) return { status: "error", code: 400, message: "Coinflip not found" };

		if (coinflip.player1.id !== tostring(player.UserId)) {
			return { status: "error", code: 400, message: "You are not the owner of this coinflip" };
		}

		if (coinflip.status !== "waiting_for_player") {
			return { status: "error", code: 400, message: "Cannot cancel coinflip" };
		}

		const request = await new Request("POST", `/coinflip/cancel/${coinflipId}`).GetResponse();
		if (request.Code !== 200) {
			return { status: "error", code: 400, message: "Failed to cancel coinflip" };
		}

		const response = request.Response as { status?: string; message?: string };
		if (request.Code !== 200) {
			return { status: "error", code: 400, message: response.message ?? "Internal server error" };
		}

		this.Coinflips = this.Coinflips.filter((cf) => cf.id !== coinflipId);
		Events.CoinflipsUpdated.broadcast({
			updated: [],
			removed: [coinflipId],
		});

		try {
			await this.PlayerManagementService.refreshInventory(player);
		} catch (error) {
			warn(`[CoinflipService] Failed to refresh inventory after cancel for ${player.UserId}: ${error}`);
		}

		return { status: "success", code: 200 };
	}

	async callBotCoinflip(
		player: Player,
		coinflipId: string,
	): Promise<{ status: string; message?: string; code?: number }> {
		const coinflip = this.Coinflips.find((cf) => cf.id === coinflipId);
		if (!coinflip) return { status: "error", code: 400, message: "Coinflip not found" };

		if (coinflip.player1.id !== tostring(player.UserId)) {
			return { status: "error", code: 400, message: "You are not the owner of this coinflip" };
		}

		if (coinflip.status !== "waiting_for_player") {
			return { status: "error", code: 400, message: "Coinflip is not waiting for a bot" };
		}

		if (coinflip.player2) {
			return { status: "error", code: 400, message: "Coinflip already has a second player" };
		}

		const request = await new Request("POST", `/coinflip/call-bot/${coinflipId}`, undefined, {
			user_id: player.UserId,
		}).GetResponse();

		if (request.Code !== 200) {
			const response = request.Response as { message?: string; error?: string };
			return {
				status: "error",
				code: request.Code,
				message: response.message ?? response.error ?? "Failed to call bot",
			};
		}

		const response = request.Response as { status: string; data: Coinflip };
		const updatedCoinflip = response.data;
		const existingIndex = this.Coinflips.findIndex((cf) => cf.id === coinflipId);

		if (existingIndex !== -1) {
			this.Coinflips[existingIndex] = updatedCoinflip;
		} else {
			this.Coinflips.push(updatedCoinflip);
		}

		Events.CoinflipsUpdated.broadcast({
			updated: [updatedCoinflip],
			removed: [],
		});

		return { status: "success", code: 200 };
	}

	async joinCoinflip(
		player: Player,
		coinflipId: string,
		items: { [itemId: string]: number },
	): Promise<{ status: string; message?: string; code?: number }> {
		for (const coinflip of this.Coinflips) {
			if (coinflip.player1.id === tostring(player.UserId) || coinflip.player2?.id === tostring(player.UserId)) {
				warn("[COINFLIP] Coinflip", coinflip);
				if (coinflip.status === "waiting_for_player" || coinflip.status === "awaiting_confirmation") {
					warn("NOT ADDING TO COINFLIP BECAUSE ALREADY IN A COINFLIP");
					return { status: "error", code: 400, message: "Already in a coinflip" };
				}
			}
		}

		let totalSelectedItems = 0;
		for (const [, amount] of pairs(items)) totalSelectedItems += amount;
		if (totalSelectedItems > 10) {
			return { status: "error", code: 400, message: "Cannot select more than 10 items" };
		}

		const sessionOnlyProfile = this.PlayerManagementService.getSessionOnlyProfile(player);
		if (!sessionOnlyProfile) return { status: "error", code: 400, message: "Profile not found" };
		const coinflip = this.Coinflips.find((cf) => cf.id === coinflipId);
		if (!coinflip) return { status: "error", code: 400, message: "Coinflip not found" };
		if (coinflip.player2) return { status: "error", code: 400, message: "Coinflip is full" };
		if (coinflip.status !== "waiting_for_player")
			return { status: "error", code: 400, message: "Coinflip is not joinable" };

		const player1StakeValue = this.getCoinflipItemValue(coinflip.player1_items);
		const player2StakeValue = this.getSelectedItemValue(items);
		const { minimumValue, maximumValue } = getCoinflipJoinValueRange(player1StakeValue);
		if (player2StakeValue < minimumValue || player2StakeValue > maximumValue) {
			return {
				status: "error",
				code: 400,
				message: "Your items must keep the coinflip within the 45/55 odds range.",
			};
		}

		const selectUAIDs = () =>
			GetUAIDsForOnlineInventory(this.ItemManagementService, this.PlayerManagementService, player, items);
		const joinWithUAIDs = (selectedUAIDs: string[]) =>
			new Request("POST", `/coinflip/join/${coinflipId}`, undefined, {
				user_id: player.UserId,
				items: selectedUAIDs,
				item_counts: items,
			}).GetResponse();

		let selectedUAIDsArray = selectUAIDs();
		if (selectedUAIDsArray.size() < totalSelectedItems) {
			try {
				await this.PlayerManagementService.refreshInventory(player);
			} catch (error) {
				warn(`[CoinflipService] Failed to refresh inventory before join for ${player.UserId}: ${error}`);
			}

			selectedUAIDsArray = selectUAIDs();
			if (selectedUAIDsArray.size() < totalSelectedItems) {
				return {
					status: "error",
					code: 400,
					message: "Some selected copies are unavailable or locked. Reopen inventory and try again.",
				};
			}
		}

		let request = await joinWithUAIDs(selectedUAIDsArray);

		if (request.Code !== 200) {
			const payload = request.Response as { message?: string; error?: string };
			const message = payload.message ?? payload.error ?? "Failed to join coinflip";
			const lowerMessage = string.lower(message);
			const shouldRetryInventory =
				request.Code === 400 &&
				(string.find(lowerMessage, "item") !== undefined ||
					string.find(lowerMessage, "uaid") !== undefined ||
					string.find(lowerMessage, "inventory") !== undefined ||
					string.find(lowerMessage, "copy") !== undefined);

			if (!shouldRetryInventory) {
				return { status: "error", code: request.Code, message };
			}

			try {
				await this.PlayerManagementService.refreshInventory(player);
			} catch (error) {
				warn(`[CoinflipService] Failed to refresh inventory before join retry for ${player.UserId}: ${error}`);
				return {
					status: "error",
					code: 400,
					message: "Unable to sync your inventory right now. Please wait a moment and try again.",
				};
			}

			selectedUAIDsArray = selectUAIDs();
			if (selectedUAIDsArray.size() < totalSelectedItems) {
				return {
					status: "error",
					code: 400,
					message: "Some selected copies are unavailable or locked. Reopen inventory and try again.",
				};
			}

			request = await joinWithUAIDs(selectedUAIDsArray);
			if (request.Code !== 200) {
				const retryPayload = request.Response as { message?: string; error?: string };
				return {
					status: "error",
					code: request.Code,
					message: retryPayload.message ?? retryPayload.error ?? "Failed to join coinflip",
				};
			}
		}

		const response = request.Response as { status: string; data: Coinflip };
		const coinflipData = response.data;
		const existingIndex = this.Coinflips.findIndex((cf) => cf.id === coinflipId);
		if (existingIndex !== -1) {
			this.Coinflips[existingIndex] = coinflipData;
		} else {
			this.Coinflips.push(coinflipData);
		}

		Events.CoinflipsUpdated.broadcast({
			updated: [coinflipData],
			removed: [],
		});

		try {
			await this.PlayerManagementService.refreshInventory(player);
		} catch (error) {
			warn(`[CoinflipService] Failed to refresh inventory after join for ${player.UserId}: ${error}`);
		}

		return { status: "success", code: 200 };
	}
}
