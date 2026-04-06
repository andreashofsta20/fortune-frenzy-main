/* eslint-disable no-constant-condition */
import { Service, OnInit, OnStart } from "@flamework/core";
import { HttpService, Players, ReplicatedStorage, ServerScriptService } from "@rbxts/services";
import { CashChangeResponse } from "typings/APIResponses";
import { PlayerManagementService } from "./PlayerManagementService";
import { Packeter, Request } from "server/util/packeter";
import { setDecimalPlaces } from "shared/util/number-utils";
import getServerType from "shared/util/get-server-type";
import log from "shared/util/log";
import { ServerReceiver } from "@flamework/networking/out/functions/types";
import getPollingCooldown from "server/util/get-polling-cooldown";

@Service({ loadOrder: -1 })
export class InitializationService implements OnInit, OnStart {
	constructor(private PlayerManagementService: PlayerManagementService) {}

	async onInit() {
		log("warn", "🚀 [InitializationService] Initializing...");
		const start_time = tick();
		new Packeter("local");
		ReplicatedStorage.SetAttribute("ServerType", getServerType());
		log("print", `✅ [InitializationService] Initialized in ${setDecimalPlaces(tick() - start_time)}ms`);
	}

	async onStart() {
		const startTime = tick();
		log("warn", "⌛ [InitializationService] Setting up network functions...");
		const networkTraceEnabled = ServerScriptService.GetAttribute("debug_network_trace") === true;
		const networkLogs: {
			network_name: string;
			speed: number;
			response: string;
			player: { name: string; id: number };
		}[] = [];

		function createNetworkCallback(
			module: {
				default: {
					function: ServerReceiver<unknown[], unknown>;
					handle: (...args: unknown[]) => unknown;
				};
			},
			networkName: string,
		) {
			return async (...args: unknown[]) => {
				const player = args[0] as Player;
				const callStartTime = tick();
				const result = await module.default.handle(...args);
				const duration = setDecimalPlaces(tick() - callStartTime, 2);

				if (networkTraceEnabled) {
					let truncatedResult = HttpService.JSONEncode(result);
					if (truncatedResult.size() > 100) {
						truncatedResult = `${truncatedResult.sub(1, 100)}...`;
					}

					networkLogs.push({
						network_name: networkName,
						speed: duration,
						response: truncatedResult,
						player: { name: player.Name, id: player.UserId },
					});

					// Keep log payload bounded even during stress tests.
					while (networkLogs.size() > 250) {
						networkLogs.remove(1);
					}

					if (duration >= 0.5) {
						warn(`🔗 [NetworkLogging] Slow call ${networkName} took ${duration}ms`);
					}
				}
				return result;
			};
		}

		await this.fetchAndApplyGameSettings();

		const apiParent = script.Parent?.Parent?.FindFirstChild("api") as Instance | undefined;
		if (apiParent) {
			const descendants = apiParent.GetDescendants();
			descendants.forEach((descendant) => {
				if (descendant.IsA("ModuleScript")) {
					const module = require(descendant) as {
						default: {
							function: ServerReceiver<unknown[], unknown>;
							handle: (...args: unknown[]) => unknown;
						};
					};

					log("warn", `🔗 [InitializationService] Setting up network function: ${descendant.Name}`);
					module.default.function.setCallback(createNetworkCallback(module, descendant.Name));
				}
			});
		}

		function startLoop(delay: number | "global", callback: () => Promise<void>) {
			task.spawn(async () => {
				while (true) {
					await callback();
					task.wait(delay === "global" ? getPollingCooldown() : delay);
				}
			});
		}

		startLoop(1.25, async () => {
			const playersLoaded = Players.GetPlayers().filter(
				(player) => player.GetAttribute("__SERVER_LOADED") === true,
			);
			const allUserIds = playersLoaded.map((player) => player.UserId).join(",");
			if (allUserIds === "") return;

			const request = await new Request("GET", "/users/get-cash-changes", {
				"user-ids": allUserIds,
			}).GetResponse();
			if (!request.Success) return;
			const response = request.Response as CashChangeResponse;

			response.changes.forEach(async (change) => {
				const player = Players.GetPlayerByUserId(tonumber(change.user_id) as number);
				if (!player) return;
				const profile = await this.PlayerManagementService.getOnlineProfile(player);
				if (!profile) return;
				this.PlayerManagementService.addCash(player, tonumber(change.amount) ?? 0);
			});
		});

		startLoop(5, async () => {
			if (!networkTraceEnabled) return;
			if (networkLogs.size() === 0) return;

			const body = {
				server_id: (ServerScriptService.GetAttribute("server_id") as string) || "SERVER_ID_NOT_FOUND",
				logs: networkLogs,
			};

			const request = await new Request("POST", "/logging/network", undefined, body).GetResponse();
			if (request.Success) {
				// print(`🌍 [NetworkLogging] Successfully pushed ${networkLogs.size()} logs`);
				networkLogs.clear();
			}
		});

		startLoop(8, async () => {
			const request = await new Request("GET", "/leaderboard").GetResponse();
			if (request.Success) {
				const response = request.Response as {
					status: string;
					leaderboards: {
						cash: [
							user_id: string,
							username: string,
							display_name: string,
							amount: string,
							country: string,
						][];
						value: [
							user_id: string,
							username: string,
							display_name: string,
							amount: string,
							country: string,
						][];
					};
				};

				const filterLeaderboardEntries = (
					entries: [
						user_id: string,
						username: string,
						display_name: string,
						amount: string,
						country: string,
					][],
				) =>
					entries.filter((entry) => {
						const userId = tonumber(entry[0]) ?? 0;
						if (userId <= 0) return false;
						return this.PlayerManagementService.hasPlayedBefore(userId);
					});

				const filteredLeaderboards = {
					cash: filterLeaderboardEntries(response.leaderboards.cash),
					value: filterLeaderboardEntries(response.leaderboards.value),
				};

				ReplicatedStorage.SetAttribute("Leaderboards", HttpService.JSONEncode(filteredLeaderboards));
			}
		});

		startLoop(15, async () => {
			try {
				await this.fetchAndApplyGameSettings();
			} catch (error) {
				log("warn", `[InitializationService] Failed to refresh game settings: ${error}`);
			}
		});

		const serverReady = new Instance("BoolValue");
		serverReady.Value = true;
		serverReady.Name = "ServerReady";
		serverReady.Parent = ReplicatedStorage;

		log("print", `✅ [InitializationService] Started in ${setDecimalPlaces(tick() - startTime)}ms`);
	}

	private async fetchAndApplyGameSettings(): Promise<void> {
		const request = await new Request("GET", "/settings").GetResponse();
		if (!request.Success) throw `HTTP ${request.Code}`;

		const response = request.Response as {
			status: string;
			result: {
				game_open: boolean;
				paycheck: number;
				polling_cooldown: number;
				dailywheel: {
					rewards: {
						type: "item" | "cash" | "gems" | "mystery";
						value: string;
						chance: number;
					}[];
				};
			};
		};

		if (request.Code !== 200) throw `HTTP ${request.Code}`;
		const settings = response.result;
		for (const [key, value] of pairs(settings as Record<string, unknown>)) {
			ReplicatedStorage.SetAttribute(`_config_${key}`, HttpService.JSONEncode({ value }));
		}

		ServerScriptService.SetAttribute("gamesettings_polling_cooldown", settings.polling_cooldown);
	}
}
