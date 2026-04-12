/* eslint-disable no-constant-condition */
import { OnStart, Service } from "@flamework/core";
import log from "shared/util/log";
import { PlayerManagementService } from "./PlayerManagementService";
import { setDecimalPlaces } from "shared/util/number-utils";
import { Request } from "server/util/packeter";
import { JackpotData, JackpotPotsResponse } from "typings/APIResponses";
import { Events } from "server/network";
import getPollingCooldown from "server/util/get-polling-cooldown";
import filterServerSeed from "server/util/jackpot/filterServerSeed";
import { HttpService, ServerScriptService, Players } from "@rbxts/services";
import { GetUAIDsForOnlineInventory } from "server/util/get-uaid-from-quantity";
import { ItemManagementService } from "./ItemManagementService";
import { JACKPOT_INFINITY_VALUE_CAP, normalizeJackpotValueCap } from "shared/util/jackpot-value-cap";
import { GameEvents } from "server/util/cross-server-channels/GameEvents";

declare const fetch: (url: string, init: defined) => Promise<unknown>;

function emitAgentDebugLog(location: string, message: string, data: Record<string, unknown>, hypothesisId: string) {
	// #region agent log
	task.spawn(() => {
		pcall(() =>
			fetch("http://127.0.0.1:7528/ingest/1b6715ac-5dbe-4e21-b0fb-3326720d79ad", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Debug-Session-Id": "4ef876",
				},
				body: HttpService.JSONEncode({
					sessionId: "4ef876",
					location,
					message,
					data,
					timestamp: DateTime.now().UnixTimestampMillis,
					runId: "pre-fix",
					hypothesisId,
				}),
			}),
		);
	});
	// #endregion
}

@Service()
export class JackpotService implements OnStart {
	private readonly MAX_ACTIVE_JACKPOT_JOINS_PER_PLAYER = 3;

	constructor(
		private PlayerManagementService: PlayerManagementService,
		private ItemManagementService: ItemManagementService,
	) {}

	public Jackpots = new Array<JackpotData>();

	async onStart(): Promise<void> {
		const startTime = tick();
		log("warn", "⌛ [JackpotService] Starting...");

		Players.PlayerRemoving.Connect((player) => {
			this.handlePlayerDisconnect(player);
		});

		this.subscribeToCrossServerEvents();
		this.startJackpotPolling();
		log("print", `✅ [JackpotService] Started in ${setDecimalPlaces(tick() - startTime)}s`);
	}

	private subscribeToCrossServerEvents(): void {
		GameEvents.subscribe("jackpot_update", () => {
			task.spawn(() => this.updateJackpots());
		});

		GameEvents.subscribe("jackpot_remove", (msg) => {
			const ids = msg.ids ?? [];
			if (ids.size() === 0) return;
			this.Jackpots = this.Jackpots.filter((jp) => !ids.includes(jp.id));
			Events.JackpotsUpdated.broadcast({ updated: [], removed: ids });
		});
	}

	private handlePlayerDisconnect(player: Player): void {
		const userId = tostring(player.UserId);

		for (const jackpot of this.Jackpots) {
			if (jackpot.status !== "waiting_for_start") continue;

			const isMember = jackpot.members.some((m) => m.player.id === userId);
			if (!isMember) continue;

			task.spawn(async () => {
				try {
					const { Code, Response } = await new Request("POST", `/jackpot/leave/${jackpot.id}`, undefined, {
						user_id: player.UserId,
					}).GetResponse();

					if (Code === 200) {
						const updatedPot = (Response as { pot?: JackpotData }).pot;
						if (updatedPot) {
							const index = this.Jackpots.findIndex((jp) => jp.id === updatedPot.id);
							if (index !== -1) this.Jackpots[index] = updatedPot;
							Events.JackpotsUpdated.broadcast({ updated: [filterServerSeed(updatedPot)], removed: [] });
						}
						log("print", `[JackpotService] Auto-left jackpot ${jackpot.id} for disconnected player ${userId}`);
					}
				} catch (err) {
					log("warn", `[JackpotService] Failed to auto-leave jackpot ${jackpot.id} on disconnect: ${err}`);
				}
			});
		}
	}

	private startJackpotPolling(): void {
		task.spawn(async () => {
			while (true) {
				try {
					await this.updateJackpots();
				} catch (error) {
					log("warn", `[JackpotService] Error updating jackpot: ${error}`);
				}

				task.wait(getPollingCooldown());
			}
		});
	}

	async updateJackpots(): Promise<void> {
		const { Code, Response } = await new Request("GET", "/jackpot/pots").GetResponse();
		// #region agent log
		emitAgentDebugLog(
			"src/server/services/JackpotService.ts:124",
			"jackpot poll response",
			{
				code: Code,
				hasPotsArray: typeIs((Response as JackpotPotsResponse).pots, "table"),
			},
			"H4",
		);
		// #endregion
		if (Code !== 200) {
			log("warn", `[JackpotService] Failed to fetch jackpots. Status: ${Code}`);
			return;
		}
		const { pots: rawPots } = Response as JackpotPotsResponse;
		const pots = rawPots.map((pot) => ({
			...pot,
			value_cap: normalizeJackpotValueCap(
				pot.value_cap,
				pot.is_system_pot === true || pot.creator.id === "0" ? 1000000 : JACKPOT_INFINITY_VALUE_CAP,
			),
		}));
		const oldById = new Map(this.Jackpots.map((p) => [p.id, p]));
		const newIds = new Set(pots.map((p) => p.id));
		const removed = this.Jackpots.filter((p) => !newIds.has(p.id)).map((p) => p.id);
		const updated: JackpotData[] = [];

		for (const pot of pots) {
			const old = oldById.get(pot.id);
			if (!old || old.updated_at !== pot.updated_at) {
				if (pot.status === "complete" && (!old || old.status !== "complete")) {
					this.handleJackpotComplete(pot);
				}
				updated.push(filterServerSeed(pot));
			}
		}

		this.Jackpots = pots;

		if (updated.size() > 0 || removed.size() > 0) {
			log("print", `[JackpotService] Broadcasting JackpotsUpdated: updated=[${updated.map(jp => jp.id).join(",")}], removed=[${removed.join(",")}]`);
			Events.JackpotsUpdated.broadcast({ updated, removed });
		}
	}

	private handleJackpotComplete(pot: JackpotData) {
		log("print", `[JackpotService] handleJackpotComplete: id=${pot.id}, status=${pot.status}, winnerId=${pot.winning_data?.player.id}`);
		const winnerId = pot.winning_data?.player.id;
		const totalPotValue = pot.members.reduce((sum, member) => sum + member.total_value, 0);

		for (const member of pot.members) {
			const userId = tonumber(member.player.id);
			if (!userId) continue;

			const player = Players.GetPlayerByUserId(userId);
			if (player) {
				const didWin = winnerId !== undefined && winnerId === member.player.id;
				log("print", `[JackpotService] Payout: player=${member.player.id}, didWin=${didWin}, amountWon=${didWin ? totalPotValue : 0}`);
				this.PlayerManagementService.recordMinigameOutcome(
					player,
					"Jackpot",
					didWin,
					didWin ? totalPotValue : 0,
					member.total_value,
				);

				task.spawn(() => {
					this.PlayerManagementService.refreshInventory(player);
				});
			}
		}
	}

	async createJackpot(
		player: Player,
		value_cap: number,
		value_floor: number,
		max_players: number,
		starting_after: number,
	) {
		for (const jackpot of this.Jackpots)
			if (jackpot.creator.id === tostring(player.UserId) && jackpot.status !== "complete")
				return { status: "error", code: 400, message: "Already own an active jackpot" };

		const { Code, Response } = await new Request("POST", "/jackpot/create", undefined, {
			creator: player.UserId,
			server_id: ServerScriptService.GetAttribute("server_id"),
			value_cap,
			value_floor: value_floor === 0 ? undefined : value_floor,
			max_players,
			starting_after,
		}).GetResponse();

		if (Code !== 200) {
			const payload = Response as { message?: string; error?: string };
			return {
				status: "error",
				code: Code,
				message: payload.message ?? payload.error ?? "Failed to create jackpot",
			};
		}

		const { jackpot_id } = Response as { jackpot_id: string };
		return { status: "success", message: jackpot_id, code: 200 };
	}

	async joinJackpot(player: Player, jackpot_id: string, items: { [itemId: string]: number }) {
		const currentJackpot = this.Jackpots.find((j) => j.id === jackpot_id);
		if (!currentJackpot) return { status: "error", code: 400, message: "Jackpot not found" };
		if (currentJackpot.status !== "waiting_for_start")
			return { status: "error", code: 400, message: "Jackpot is not waiting for start" };

		let joinedActiveJackpots = 0;
		for (const jackpot of this.Jackpots) {
			if (jackpot.status === "complete" || jackpot.id === jackpot_id) continue;
			for (const member of jackpot.members) {
				if (member.player.id === tostring(player.UserId)) {
					joinedActiveJackpots += 1;
					break;
				}
			}
		}

		if (joinedActiveJackpots >= this.MAX_ACTIVE_JACKPOT_JOINS_PER_PLAYER)
			return { status: "error", code: 400, message: "Already in 3 active jackpots" };

		let totalSelectedItems = 0;
		for (const [, amount] of pairs(items)) totalSelectedItems += amount;

		const selectUAIDs = () =>
			GetUAIDsForOnlineInventory(this.ItemManagementService, this.PlayerManagementService, player, items);
		const joinWithUAIDs = (selectedUAIDsArray: string[]) =>
			new Request("POST", `/jackpot/join/${jackpot_id}`, undefined, {
				user_id: player.UserId,
				items: selectedUAIDsArray,
				item_counts: items,
				client_seed: player.GetAttribute("ClientSeed") as string,
			}).GetResponse();

		let selectedUAIDsArray = selectUAIDs();
		if (selectedUAIDsArray.size() < totalSelectedItems) {
			try {
				await this.PlayerManagementService.refreshInventory(player);
			} catch (error) {
				warn(`[JackpotService] Failed to refresh inventory before join for ${player.UserId}: ${error}`);
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

		let joinResponse = await joinWithUAIDs(selectedUAIDsArray);

		if (joinResponse.Code !== 200) {
			const payload = joinResponse.Response as { message?: string; error?: string };
			const message = payload.message ?? payload.error ?? "Failed to join jackpot";
			const lowerMessage = string.lower(message);
			const shouldRetryInventory =
				joinResponse.Code === 400 &&
				(string.find(lowerMessage, "item") !== undefined ||
					string.find(lowerMessage, "uaid") !== undefined ||
					string.find(lowerMessage, "inventory") !== undefined);

			if (!shouldRetryInventory) {
				return {
					status: "error",
					code: joinResponse.Code,
					message,
				};
			}

			try {
				await this.PlayerManagementService.refreshInventory(player);
			} catch (error) {
				warn(`[JackpotService] Failed to refresh inventory before retry for ${player.UserId}: ${error}`);
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

			joinResponse = await joinWithUAIDs(selectedUAIDsArray);
			if (joinResponse.Code !== 200) {
				const retryPayload = joinResponse.Response as { message?: string; error?: string };
				return {
					status: "error",
					code: joinResponse.Code,
					message: retryPayload.message ?? retryPayload.error ?? "Failed to join jackpot",
				};
			}
		}

		const updatedPot = (joinResponse.Response as { pot?: JackpotData }).pot;
		if (updatedPot) {
			const index = this.Jackpots.findIndex((jp) => jp.id === updatedPot.id);
			if (index !== -1) {
				this.Jackpots[index] = updatedPot;
			} else {
				this.Jackpots.push(updatedPot);
			}

			Events.JackpotsUpdated.broadcast({
				updated: [filterServerSeed(updatedPot)],
				removed: [],
			});
			GameEvents.publish("jackpot_update");
		}

		try {
			await this.PlayerManagementService.refreshInventory(player);
		} catch (error) {
			warn(`[JackpotService] Failed to refresh inventory after join for ${player.UserId}: ${error}`);
		}

		return { status: "success", code: 200 };
	}

	async leaveJackpot(player: Player, jackpot_id: string) {
		const currentJackpot = this.Jackpots.find((j) => j.id === jackpot_id);
		if (!currentJackpot) return { status: "error", code: 400, message: "Jackpot not found" };
		if (!currentJackpot.members.some((member) => member.player.id === tostring(player.UserId))) {
			return { status: "error", code: 400, message: "Not in jackpot" };
		}

		const { Code, Response } = await new Request("POST", `/jackpot/leave/${jackpot_id}`, undefined, {
			user_id: player.UserId,
		}).GetResponse();

		if (Code !== 200) {
			const payload = Response as { message?: string; error?: string };
			return {
				status: "error",
				code: Code,
				message: payload.message ?? payload.error ?? "Failed to leave jackpot",
			};
		}

		const updatedPot = (Response as { pot?: JackpotData }).pot;
		if (updatedPot) {
			const index = this.Jackpots.findIndex((jp) => jp.id === updatedPot.id);
			if (index !== -1) this.Jackpots[index] = updatedPot;
			else this.Jackpots.push(updatedPot);

			Events.JackpotsUpdated.broadcast({
				updated: [filterServerSeed(updatedPot)],
				removed: [],
			});
			GameEvents.publish("jackpot_update");
		}

		try {
			await this.PlayerManagementService.refreshInventory(player);
		} catch (error) {
			warn(`[JackpotService] Failed to refresh inventory after leave for ${player.UserId}: ${error}`);
		}

		return { status: "success", code: 200 };
	}
}
