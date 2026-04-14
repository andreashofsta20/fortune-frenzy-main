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

/** Default API base when ReplicatedStorage `_backend_url` is unset. */
const PACKETER_BACKEND_URL_DEFAULT = "https://api.fortunefrenzy.xyz";

function resolvePacketerBackendUrl(): string {
	const attr = ReplicatedStorage.GetAttribute("_backend_url");
	if (typeIs(attr, "string") && attr.size() > 0) {
		if (string.lower(attr) === "local") {
			warn(
				`[InitializationService] _backend_url "local" is no longer supported (in-game mock backend removed). Using ${PACKETER_BACKEND_URL_DEFAULT}.`,
			);
			return PACKETER_BACKEND_URL_DEFAULT;
		}
		return attr;
	}
	return PACKETER_BACKEND_URL_DEFAULT;
}
const SETTINGS_REFRESH_INTERVAL = 30;
const LEADERBOARD_REFRESH_INTERVAL = 15;
const NETWORK_LOG_FLUSH_INTERVAL = 5;
/** Slower than minigame polls so cash_changes DB work does not compete as often with case battles / jackpots. */
const CASH_CHANGES_POLL_INTERVAL = 8;
/** How often to pull Mongo wallet cash for online players (offline admin / marketplace credits without rejoin). */
const MONGO_WALLET_SYNC_INTERVAL = 15;

interface SettingsGetResponse {
	status: string;
	result: Record<string, unknown> & {
		polling_cooldown?: number;
		/** Seconds between Packeter HttpService batches (optional; default 0.1 in code). */
		packeter_min_interval?: number;
		game_open?: boolean;
		paycheck?: number;
		dailywheel?: unknown;
	};
}

interface LeaderboardHttpResponse {
	status: string;
	leaderboards: {
		cash: readonly unknown[];
		value: readonly unknown[];
	};
}

interface ApiModule {
	default: {
		function: ServerReceiver<unknown[], unknown>;
		handle: (...args: unknown[]) => Promise<unknown>;
	};
}

@Service({ loadOrder: -1 })
export class InitializationService implements OnInit, OnStart {
	constructor(private PlayerManagementService: PlayerManagementService) {}

	private readonly networkLogs: {
		network_name: string;
		speed: number;
		response: string;
		player: { name: string; id: number };
	}[] = [];

	async onInit() {
		log("warn", "🚀 [InitializationService] Initializing...");
		const start_time = tick();

		new Packeter(resolvePacketerBackendUrl());
		ReplicatedStorage.SetAttribute("ServerType", getServerType());

		log("print", `✅ [InitializationService] Initialized in ${setDecimalPlaces(tick() - start_time)}ms`);

		// Must run in OnInit (sequential): OnStart handlers run concurrently — registering here avoids nil Flamework callbacks.
		this.registerApiCallbacks();
	}

	async onStart() {
		const startTime = tick();
		log("warn", "⌛ [InitializationService] Setting up network functions...");

		try {
			await this.fetchAndApplyGameSettings();
		} catch (error) {
			log("warn", `[InitializationService] Initial settings fetch failed: ${error}`);
		}

		const startLoop = (delay: number | "global", callback: () => Promise<void>) => {
			task.spawn(async () => {
				while (true) {
					try {
						await callback();
					} catch (err) {
						warn("❌ Loop error:", err);
					}
					task.wait(delay === "global" ? getPollingCooldown() : delay);
				}
			});
		};

		startLoop(CASH_CHANGES_POLL_INTERVAL, async () => {
			const playersLoaded = Players.GetPlayers().filter((p) => p.GetAttribute("__SERVER_LOADED") === true);
			const allUserIds = playersLoaded.map((p) => p.UserId).join(",");
			if (allUserIds === "") return;

			const request = await new Request("GET", "/users/get-cash-changes", {
				"user-ids": allUserIds,
			}).GetResponse();
			if (!request.Success) return;

			const response = request.Response as CashChangeResponse;
			if (!response.changes) return;

			for (const change of response.changes) {
				const player = Players.GetPlayerByUserId(tonumber(change.user_id) as number);
				if (!player) continue;
				const profile = await this.PlayerManagementService.getOnlineProfile(player);
				if (!profile) continue;
				await this.PlayerManagementService.addCash(player, tonumber(change.amount) ?? 0);
			}
		});

		startLoop(MONGO_WALLET_SYNC_INTERVAL, async () => {
			const playersLoaded = Players.GetPlayers().filter((p) => p.GetAttribute("__SERVER_LOADED") === true);
			if (playersLoaded.size() === 0) return;
			await Promise.all(
				playersLoaded.map((player) => this.PlayerManagementService.applyAuthoritativeWalletFromMongo(player)),
			);
		});

		startLoop(NETWORK_LOG_FLUSH_INTERVAL, async () => {
			if (this.networkLogs.size() === 0) return;

			const body = {
				server_id: (ServerScriptService.GetAttribute("server_id") as string) || "SERVER_ID_NOT_FOUND",
				logs: this.networkLogs,
			};

			const request = await new Request("POST", "/logging/network", undefined, body).GetResponse();
			if (request.Success) {
				this.networkLogs.clear();
			}
		});

		task.spawn(() => {
			this.refreshLeaderboardsAttribute();
		});

		startLoop(LEADERBOARD_REFRESH_INTERVAL, async () => {
			await this.refreshLeaderboardsAttribute();
		});

		startLoop(SETTINGS_REFRESH_INTERVAL, async () => {
			try {
				await this.fetchAndApplyGameSettings();
			} catch (error) {
				log("warn", `[InitializationService] Failed to refresh game settings: ${error}`);
			}
		});

		const serverReady = new Instance("BoolValue");
		serverReady.Name = "ServerReady";
		serverReady.Value = true;
		serverReady.Parent = ReplicatedStorage;

		log("print", `✅ [InitializationService] Started in ${setDecimalPlaces(tick() - startTime)}ms`);
	}

	private createNetworkCallback(module: ApiModule, networkName: string) {
		return async (...args: unknown[]) => {
			const player = args[0] as Player;
			const callStartTime = tick();

			try {
				const result = await module.default.handle(...args);
				const duration = setDecimalPlaces(tick() - callStartTime, 2);

				let truncatedResult = HttpService.JSONEncode(result);
				if (truncatedResult.size() > 100) {
					truncatedResult = `${truncatedResult.sub(1, 100)}...`;
				}

				this.networkLogs.push({
					network_name: networkName,
					speed: duration,
					response: truncatedResult,
					player: { name: player.Name, id: player.UserId },
				});

				while (this.networkLogs.size() > 250) {
					this.networkLogs.remove(1);
				}

				return result;
			} catch (err) {
				warn(`❌ Network error in ${networkName}:`, err);
				return { status: "error", message: "Internal server error" };
			}
		};
	}

	private findApiRoot(): Instance | undefined {
		const ts = ServerScriptService.FindFirstChild("TS");
		const fromTs = ts?.FindFirstChild("api");
		if (fromTs) return fromTs;
		return script.Parent?.Parent?.FindFirstChild("api") as Instance | undefined;
	}

	private registerApiCallbacks(): void {
		const apiParent = this.findApiRoot();
		if (apiParent) {
			for (const descendant of apiParent.GetDescendants()) {
				if (descendant.IsA("ModuleScript")) {
					try {
						const mod = require(descendant) as ApiModule;
						log("warn", `🔗 [InitializationService] Setting up network function: ${descendant.Name}`);
						mod.default.function.setCallback(this.createNetworkCallback(mod, descendant.Name));
					} catch (err) {
						warn(`❌ Failed to load module ${descendant.Name}:`, err);
					}
				}
			}
			ReplicatedStorage.SetAttribute("__FF_NETWORK_READY", true);
		} else {
			warn("❌ InitializationService: could not find server `api` folder — no remotes registered");
		}
	}

	private async refreshLeaderboardsAttribute(): Promise<void> {
		const request = await new Request("GET", "/leaderboard").GetResponse<LeaderboardHttpResponse>();
		if (!request.Success || !request.Response?.leaderboards) return;

		try {
			ReplicatedStorage.SetAttribute(
				"Leaderboards",
				HttpService.JSONEncode(request.Response.leaderboards),
			);
		} catch (e) {
			warn("❌ Leaderboard encode failed:", e);
		}
	}

	private async fetchAndApplyGameSettings(): Promise<void> {
		const request = await new Request("GET", "/settings").GetResponse<SettingsGetResponse>();

		if (!request.Success) {
			warn("❌ Settings fetch failed:", request.Code);
			return;
		}

		const response = request.Response;
		if (!response?.result) {
			warn("❌ Settings response missing result");
			return;
		}

		const settings = response.result;
		for (const [key, value] of pairs(settings as Record<string, unknown>)) {
			try {
				ReplicatedStorage.SetAttribute(`_config_${key}`, HttpService.JSONEncode({ value }));
			} catch (err) {
				warn(`❌ Failed to set config ${key}:`, err);
			}
		}

		const polling = settings.polling_cooldown;
		if (typeIs(polling, "number")) {
			ServerScriptService.SetAttribute("gamesettings_polling_cooldown", polling);
		}

		const packeterInterval = settings.packeter_min_interval;
		if (typeIs(packeterInterval, "number")) {
			Request.currentInstance?.setMinRequestInterval(packeterInterval);
		}
	}
}
