import { Players, RunService, ServerScriptService } from "@rbxts/services";

export default function getPollingCooldown() {
	const configuredCooldown = ServerScriptService.GetAttribute("gamesettings_polling_cooldown") as number | undefined;
	const baseCooldown = configuredCooldown !== undefined && configuredCooldown > 0 ? configuredCooldown : 0.6;

	const playerCount = Players.GetPlayers().size();
	const extraPlayerPenalty = math.max(0, playerCount - 1) * 0.15;
	const studioPenalty = RunService.IsStudio() ? 0.2 : 0;
	const jitter = math.random() * 0.08;

	return math.max(0.5, baseCooldown + extraPlayerPenalty + studioPenalty + jitter);
}
