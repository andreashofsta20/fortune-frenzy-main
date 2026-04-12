import { Players, RunService, ServerScriptService } from "@rbxts/services";

/** Floor between backend poll loop iterations (coinflip, jackpot, cash sync, etc.). */
const DEFAULT_POLL_INTERVAL = 2;
const STUDIO_MIN_INTERVAL = 2.2;

export default function getPollingCooldown() {
	const configuredCooldown = ServerScriptService.GetAttribute("gamesettings_polling_cooldown") as number | undefined;
	const baseCooldown =
		configuredCooldown !== undefined && configuredCooldown > 0 ? configuredCooldown : DEFAULT_POLL_INTERVAL;

	const playerCount = Players.GetPlayers().size();
	const extraPlayerPenalty = math.max(0, playerCount - 1) * 0.08;
	const studioPenalty = RunService.IsStudio() ? 0.15 : 0;
	const jitter = math.random() * 0.05;
	const minimumCooldown = RunService.IsStudio() ? STUDIO_MIN_INTERVAL : DEFAULT_POLL_INTERVAL;

	return math.max(minimumCooldown, baseCooldown + extraPlayerPenalty + studioPenalty + jitter);
}
