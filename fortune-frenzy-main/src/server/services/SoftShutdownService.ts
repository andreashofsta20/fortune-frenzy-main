import { Service, OnStart } from "@flamework/core";
import { Players, RunService, TeleportService } from "@rbxts/services";
import { Events } from "server/network";

const SHUTDOWN_TIMEOUT_SECONDS = 20;
const TELEPORT_RETRY_DELAY_SECONDS = 1.5;
const MAX_TELEPORT_ATTEMPTS = 3;
const DEFAULT_MESSAGES = {
	clientMessage: "Game updating...",
	serverMessage: "Rejoining a new server...",
};

@Service()
export class SoftShutdownService implements OnStart {
	private isShuttingDown = false;
	private reservedServerCode?: string;
	private pendingTeleports = new Set<number>();

	onStart() {
		Players.PlayerAdded.Connect((player) => {
			if (this.isShuttingDown) {
				this.queueTeleport(player);
			}
		});

		game.BindToClose(() => {
			this.beginSoftShutdown();
			this.waitForPlayersToLeave();
		});
	}

	private beginSoftShutdown() {
		if (this.isShuttingDown) return;

		if (RunService.IsStudio()) {
			warn("[SoftShutdownService] Soft shutdown skipped in Studio.");
			return;
		}

		this.isShuttingDown = true;

		const [reserveSuccess, accessCode] = pcall(() => TeleportService.ReserveServer(game.PlaceId));
		if (!reserveSuccess || typeIs(accessCode, "string") === false) {
			warn("[SoftShutdownService] Failed to reserve a server for soft shutdown:", accessCode);
			return;
		}

		this.reservedServerCode = accessCode as string;

		Players.GetPlayers().forEach((player) => {
			Events.SoftShutdown.fire(player, DEFAULT_MESSAGES);
		});
		Players.GetPlayers().forEach((player) => this.queueTeleport(player));
	}

	private queueTeleport(player: Player) {
		if (!player.IsDescendantOf(Players)) return;
		if (this.pendingTeleports.has(player.UserId)) return;

		this.pendingTeleports.add(player.UserId);
		this.applyShutdownStatus(player);

		task.spawn(() => this.teleportWithRetry(player));
	}

	private applyShutdownStatus(player: Player) {
		player.SetAttribute("_localLoadingStatus", DEFAULT_MESSAGES.clientMessage);
		player.SetAttribute("_backendLoadingStatus", DEFAULT_MESSAGES.serverMessage);
	}

	private teleportWithRetry(player: Player) {
		const accessCode = this.reservedServerCode;
		if (!accessCode) return;

		for (let attempt = 1; attempt <= MAX_TELEPORT_ATTEMPTS; attempt++) {
			if (!player.IsDescendantOf(Players)) return;

			const [success, err] = pcall(() => {
				TeleportService.TeleportToPrivateServer(game.PlaceId, accessCode, [player]);
			});

			if (success) return;

			warn(`[SoftShutdownService] Teleport attempt ${attempt} failed for ${player.Name}:`, err);
			task.wait(TELEPORT_RETRY_DELAY_SECONDS);
		}
	}

	private waitForPlayersToLeave() {
		if (!this.isShuttingDown) return;

		const startTime = os.clock();
		while (Players.GetPlayers().size() > 0 && os.clock() - startTime < SHUTDOWN_TIMEOUT_SECONDS) {
			task.wait(0.5);
		}
	}
}
