/* eslint-disable no-constant-condition */
import { Service, OnStart } from "@flamework/core";
import { CaseBattleCase, CaseBattleData } from "typings/APIResponses";
import { PlayerManagementService } from "./PlayerManagementService";
import { ItemManagementService } from "./ItemManagementService";
import { Request } from "server/util/packeter";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";
import { Players, ServerScriptService } from "@rbxts/services";
import { Events } from "server/network";
import getPollingCooldown from "server/util/get-polling-cooldown";

@Service()
export class CaseBattleService implements OnStart {
	constructor(
		private PlayerManagementService: PlayerManagementService,
		private ItemManagementService: ItemManagementService,
	) {}

	public CaseBattles = new Array<CaseBattleData>();
	public CaseBattleCases = new Array<CaseBattleCase>();

	async onStart(): Promise<void> {
		const startTime = tick();
		log("warn", "⌛ [CaseBattleService] Starting...");
		for (let attempt = 1; attempt <= 4; attempt++) {
			await this.refreshCases();
			if (this.CaseBattleCases.size() > 0) break;
			if (attempt < 4) {
				log("warn", `[CaseBattleService] Case list empty on startup, retrying (${attempt}/4)`);
				task.wait(0.35);
			}
		}
		print("[CASEBATTLES] Refreshed cases", this.CaseBattleCases);
		this.startCaseBattlePolling();
		log("print", `✅ [CaseBattleService] Started in ${setDecimalPlaces(tick() - startTime)}s`);
	}

	calculateCaseBattleCost(cases: string[]): number {
		let cost = 0;
		for (const case_id of cases) {
			const case_data = this.CaseBattleCases.find((c) => c.id === case_id);
			if (!case_data) continue;
			cost += case_data.price;
		}
		return cost;
	}

	private startCaseBattlePolling(): void {
		task.spawn(async () => {
			while (true) {
				try {
					await this.updateCaseBattles();
					// print("[CASEBATTLES] Refreshed casebattles", this.CaseBattles);
				} catch (error) {
					log("warn", `[CaseBattleService] Error updating case battles: ${error}`);
				}

				task.wait(getPollingCooldown());
			}
		});
	}

	private handleCaseBattleCompleted(battle: CaseBattleData) {
		const winners = new Map<string, number>();
		for (const winner of battle.winners_info ?? []) {
			winners.set(winner.player_id, winner.amount_won);
		}

		const stakeValue = this.calculateCaseBattleCost(battle.cases);
		for (const participant of battle.players) {
			const participantId = tonumber(participant.id) ?? 0;
			if (participantId <= 0) continue;

			const player = Players.GetPlayerByUserId(participantId);
			if (!player) continue;

			const amountWon = winners.get(participant.id) ?? 0;
			const didWin = winners.has(participant.id);
			const activityText = didWin ? `Won $${math.floor(amountWon)} in Case Battles` : "Lost a Case Battle round";

			if (didWin && amountWon > 0) {
				const payoutTransactionId = this.PlayerManagementService.addCash(player, amountWon, {
					transactionType: Enum.AnalyticsEconomyTransactionType.Gameplay.Name,
					stockKeepingUnit: `CASE_BATTLE_${battle.id}`,
				});

				task.spawn(async () => {
					const transactionId = await payoutTransactionId;
					if (!transactionId) return;
					this.PlayerManagementService.confirmAddCash(transactionId);
				});
			}

			this.PlayerManagementService.recordMinigameOutcome(
				player,
				"Case Battles",
				didWin,
				amountWon,
				stakeValue,
				activityText,
			);
		}
	}

	async updateCaseBattles(): Promise<void> {
		const { Code, Response } = await new Request("GET", "/casebattles").GetResponse();
		if (Code !== 200) {
			log("warn", `[CaseBattleService] Failed to fetch case battles. Status: ${Code}`);
			return;
		}

		const caseBattles = (Response as { casebattles: CaseBattleData[] }).casebattles;
		const oldById = new Map(this.CaseBattles.map((cb) => [cb.id, cb]));
		const newIds = new Set(caseBattles.map((cb) => cb.id));
		const removed = this.CaseBattles.filter((cb) => !newIds.has(cb.id)).map((cb) => cb.id);
		const updated: CaseBattleData[] = [];

		for (const cb of caseBattles) {
			const prev = oldById.get(cb.id);
			if (prev && prev.status !== "completed" && cb.status === "completed") {
				this.handleCaseBattleCompleted(cb);
			}

			const statusChanged = prev !== undefined && prev.status !== cb.status;
			const playersChanged = prev !== undefined && prev.players.size() !== cb.players.size();
			const roundChanged =
				prev !== undefined &&
				prev.current_spin_data.current_case_index !== cb.current_spin_data.current_case_index;
			const winnersChanged =
				prev !== undefined && (prev.winners_info?.size() ?? 0) !== (cb.winners_info?.size() ?? 0);

			if (
				!prev ||
				prev.updated_at !== cb.updated_at ||
				statusChanged ||
				playersChanged ||
				roundChanged ||
				winnersChanged
			) {
				updated.push(cb);
			}
		}

		this.CaseBattles = caseBattles;

		if (updated.size() > 0 || removed.size() > 0) {
			Events.CaseBattlesUpdated.broadcast({
				updated,
				removed,
			});
		}
	}

	async refreshCases(): Promise<void> {
		const case_battles_response = await new Request("GET", "/casebattles/cases").GetResponse();
		if (case_battles_response.Code !== 200) {
			log("warn", `[CaseBattleService] Failed to refresh case list. Status: ${case_battles_response.Code}`);
			return;
		}
		const response = case_battles_response.Response as { status: string; data: CaseBattleCase[] };
		if (!typeIs(response.data, "table")) {
			log("warn", `[CaseBattleService] Invalid case list payload during refresh`);
			return;
		}

		this.CaseBattleCases = response.data;
	}

	async createCaseBattle(
		player: Player,
		cases: string[],
		mode: CaseBattleData["mode"],
		crazy: boolean,
		fast_mode: boolean,
		team_mode: CaseBattleData["team_mode"],
	) {
		// Determine the total cost up-front and make sure the player can afford it
		const cost = this.calculateCaseBattleCost(cases);
		const bypassSpendLimit = this.PlayerManagementService.hasUnlimitedSpendLimit(player);
		const currentCash = (player.GetAttribute("Cash") as number) ?? 0;
		if (!bypassSpendLimit && currentCash < cost) {
			return { status: "error", code: 400, message: `Insufficient funds to create case battle (Cost: ${cost})` };
		}

		const payload = {
			user_id: player.UserId,
			client_seed: player.GetAttribute("ClientSeed") as string,
			cases,
			mode: mode,
			team_mode,
			fast_mode,
			crazy,
			server_id: ServerScriptService.GetAttribute("server_id") as string,
		};

		for (const case_id of cases) {
			if (!this.CaseBattleCases.find((c) => c.id === case_id))
				return { status: "error", code: 400, message: `Invalid case ID (${case_id})` };
		}
		if (!["Standard", "Randomized", "Showdown", "Group"].includes(mode)) {
			return { status: "error", code: 400, message: `Invalid mode (${mode})` };
		}

		if (!["1v1", "1v1v1", "1v1v1v1", "2v2"].includes(team_mode)) {
			return { status: "error", code: 400, message: `Invalid team mode (${team_mode})` };
		}

		let transactionId: string | undefined;
		if (!bypassSpendLimit) {
			transactionId = await this.PlayerManagementService.addCash(player, -cost, {
				transactionType: Enum.AnalyticsEconomyTransactionType.Gameplay.Name,
			});
		}

		const request = await new Request("POST", "/casebattles/create", undefined, payload).GetResponse();
		if (request.Code !== 200) {
			if (transactionId !== undefined) {
				this.PlayerManagementService.rollbackAddCash(transactionId);
			}
			return { status: "error", code: request.Code, message: `Failed to create case battle (${request.Code})` };
		}

		if (transactionId !== undefined) {
			this.PlayerManagementService.confirmAddCash(transactionId);
		}
		const response = request.Response as { status: string; data: CaseBattleData };
		this.CaseBattles.push(response.data);
		Events.CaseBattlesUpdated.broadcast({
			updated: [response.data],
			removed: [],
		});

		return { status: "success", code: 200, message: response.data.id };
	}

	async joinCaseBattle(player: Player, caseBattleId: string, position: number) {
		const battle = this.CaseBattles.find((b) => b.id === caseBattleId);
		if (!battle) return { status: "error", code: 404, message: `Case battle not found (${caseBattleId})` };

		if (battle.status !== "waiting_for_players")
			return { status: "error", code: 400, message: `Case battle is not waiting for players` };

		if (battle.players.find((p) => p.id === tostring(player.UserId) && p.position !== 1))
			return { status: "error", code: 400, message: `You are already in the case battle` };

		const bypassSpendLimit = this.PlayerManagementService.hasUnlimitedSpendLimit(player);
		let transactionId: string | undefined;
		if (tostring(player.UserId) !== battle.players[0].id) {
			const cost = this.calculateCaseBattleCost(battle.cases);
			const currentCash = (player.GetAttribute("Cash") as number) ?? 0;
			if (!bypassSpendLimit && currentCash < cost) {
				return {
					status: "error",
					code: 400,
					message: `Insufficient funds to join case battle (Cost: ${cost})`,
				};
			}

			if (!bypassSpendLimit) {
				transactionId = await this.PlayerManagementService.addCash(player, -cost, {
					transactionType: Enum.AnalyticsEconomyTransactionType.Gameplay.Name,
				});
			}
		}

		const request = await new Request("POST", `/casebattles/join/${caseBattleId}`, undefined, {
			user_id: player.UserId,
			position,
			client_seed: player.GetAttribute("ClientSeed") as string,
		}).GetResponse();

		if (request.Code !== 200) {
			if (transactionId !== undefined) {
				this.PlayerManagementService.rollbackAddCash(transactionId);
			}
			return { status: "error", code: request.Code, message: `Failed to join case battle (${request.Code})` };
		}

		if (transactionId !== undefined) {
			this.PlayerManagementService.confirmAddCash(transactionId);
		}
		const response = request.Response as { status: string; data: CaseBattleData };
		const index = this.CaseBattles.findIndex((b) => b.id === caseBattleId);
		if (index !== -1) this.CaseBattles[index] = response.data;

		Events.CaseBattlesUpdated.broadcast({
			updated: [response.data],
			removed: [],
		});

		return { status: "success", message: response.data.id, code: 200 };
	}
}
