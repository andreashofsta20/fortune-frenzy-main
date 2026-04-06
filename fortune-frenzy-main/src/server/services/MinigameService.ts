import { Service, OnStart } from "@flamework/core";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";
import { PlayerManagementService } from "./PlayerManagementService";
import { MemoryStoreService, Players } from "@rbxts/services";
import { Request } from "server/util/packeter";
import { Events } from "server/network";
import getPollingCooldown from "server/util/get-polling-cooldown";

const CURRENT_MINIGAMES = ["Coinflip", "ItemCases"];

@Service()
export class MinigameService implements OnStart {
	constructor(private PlayerManagementService: PlayerManagementService) {}

	private _GLOBAL_MINIGAME_STATS = new Map<
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

	async onStart() {
		log("warn", "⌛ [MinigameService] Starting...");
		const start_time = tick();

		task.spawn(async () => {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				await this.UpdateGlobalMinigameStats();

				Players.GetPlayers().forEach(async (player) => {
					const profile = await this.PlayerManagementService.getOnlineProfile(player);
					if (!profile) return;

					Events.MinigamesUpdated.fire(player, this._GLOBAL_MINIGAME_STATS, profile.Data.MinigameData);
				});

				task.wait(getPollingCooldown());
			}
		});

		log("print", `✅ [MinigameService] Started in ${setDecimalPlaces(tick() - start_time)}s`);
	}

	async GetMinigameDataLive(player: Player) {
		const profile = await this.PlayerManagementService.getOnlineProfile(player, true);
		if (!profile) return;
		const playerMinigameData = profile.Data.MinigameData;

		return {
			local: playerMinigameData,
			global: this._GLOBAL_MINIGAME_STATS,
		};
	}

	private async UpdateGlobalMinigameStats() {
		const request = await new Request("GET", "/statistics/minigames").GetResponse();
		if (!request.Success) return;

		const response = request.Response as {
			status: "OK";
			error: string | undefined;
			stats: Record<
				string,
				{
					current_ccu: number;
					total_spent: number;
					total_games_played: number;
					total_wins?: number;
					total_losses?: number;
				}
			>;
		};

		for (const [minigame, stats] of pairs(response.stats))
			this._GLOBAL_MINIGAME_STATS.set(minigame, {
				last_updated: os.clock(),
				current_ccu: stats.current_ccu,
				total_spent: stats.total_spent,
				total_games_played: stats.total_games_played,
				total_wins: stats.total_wins,
				total_losses: stats.total_losses,
			});
	}
}
