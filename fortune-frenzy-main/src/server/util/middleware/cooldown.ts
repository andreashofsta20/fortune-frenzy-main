import { Networking } from "@flamework/networking";

const functionCooldowns = new Map<string, Map<string, number>>();

export function FunctionCooldown<I extends Array<unknown>, O>(cooldown: number): Networking.FunctionMiddleware<I, O> {
	return (processNext, event) => {
		return (player, ...args) => {
			if (!player) return processNext(player, ...args);

			const functionName = event.name;
			let playerCooldowns = functionCooldowns.get(functionName);

			if (!playerCooldowns) {
				playerCooldowns = new Map<string, number>();
				functionCooldowns.set(functionName, playerCooldowns);
			}

			const now = tick();
			const lastUsed = playerCooldowns.get(`${player.UserId}`) || 0;
			if (now - lastUsed < cooldown) return Networking.Skip;
			playerCooldowns.set(`${player.UserId}`, now);

			task.delay(cooldown, () => {
				playerCooldowns?.delete(`${player.UserId}`);
				if (playerCooldowns?.size() === 0) {
					functionCooldowns.delete(functionName);
				}
			});

			return processNext(player, ...args);
		};
	};
}
