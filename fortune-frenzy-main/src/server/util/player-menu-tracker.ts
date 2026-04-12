import { Players } from "@rbxts/services";
import { Events } from "server/network";

const playerMenus = new Map<number, string>();

Events.CurrentMenu.connect((player, menu) => {
	playerMenus.set(player.UserId, menu);
});

Players.PlayerRemoving.Connect((player) => {
	playerMenus.delete(player.UserId);
});

export function getPlayersOnMenu(...menuNames: string[]): Player[] {
	const menuSet = new Set(menuNames);
	return Players.GetPlayers().filter((player) => {
		const menu = playerMenus.get(player.UserId);
		return menu !== undefined && menuSet.has(menu);
	});
}

export function broadcastToMenuPlayers<T extends (...args: unknown[]) => void>(
	event: { fire: (player: Player, ...args: Parameters<T>) => void; broadcast: (...args: Parameters<T>) => void },
	menuNames: string[],
	...args: Parameters<T>
): void {
	const players = getPlayersOnMenu(...menuNames);
	if (players.size() === 0) return;
	for (const player of players) {
		event.fire(player, ...args);
	}
}
