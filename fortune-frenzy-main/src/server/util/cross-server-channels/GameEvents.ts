import { HttpService, MessagingService, ServerScriptService } from "@rbxts/services";

export type GameEventType =
	| "coinflip_update"
	| "coinflip_remove"
	| "casebattle_update"
	| "casebattle_remove"
	| "jackpot_update"
	| "jackpot_remove"
	| "force_poll";

export interface GameEventMessage {
	t: GameEventType;
	s: string;
	ids?: string[];
}

const TOPIC = "GameEvents";
const listeners = new Map<GameEventType, Array<(msg: GameEventMessage) => void>>();

function getServerId(): string {
	return (ServerScriptService.GetAttribute("server_id") as string) ?? "";
}

export const GameEvents = {
	publish(eventType: GameEventType, ids?: string[]) {
		const msg: GameEventMessage = {
			t: eventType,
			s: getServerId(),
			ids,
		};
		const [success, err] = pcall(() => {
			MessagingService.PublishAsync(TOPIC, HttpService.JSONEncode(msg));
		});
		if (!success) {
			warn(`[GameEvents] Failed to publish ${eventType}: ${err}`);
		}
	},

	subscribe(eventType: GameEventType, callback: (msg: GameEventMessage) => void) {
		let list = listeners.get(eventType);
		if (!list) {
			list = [];
			listeners.set(eventType, list);
		}
		list.push(callback);
	},

	init() {
		MessagingService.SubscribeAsync(TOPIC, (rawMessage) => {
			const [success, msg] = pcall(() => HttpService.JSONDecode(rawMessage.Data as string) as GameEventMessage);
			if (!success || !msg) return;
			if (msg.s === getServerId()) return;

			const list = listeners.get(msg.t);
			if (list) {
				for (const cb of list) {
					task.spawn(() => cb(msg));
				}
			}
		});
	},
};
