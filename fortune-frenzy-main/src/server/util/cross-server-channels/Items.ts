import { MessagingService } from "@rbxts/services";

export interface Data {
	method: string;
}

export default {
	channel: "Items",
	callback: (message: { Data: unknown; Sent: number }) => {
		const data = message.Data as Data;
	},
	publish: (data: Data) => {
		MessagingService.PublishAsync("Items", data);
	},
};
