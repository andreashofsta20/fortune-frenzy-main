import { Service, OnInit, OnStart } from "@flamework/core";
import { MessagingService, ServerScriptService } from "@rbxts/services";
import Items from "server/util/cross-server-channels/Items";
import log from "shared/util/log";
import { setDecimalPlaces } from "shared/util/number-utils";

@Service()
export class CrossServerService implements OnStart {
	async onStart() {
		log("warn", "⌛ [CrossServerService] Starting...");
		const start_time = tick();
		MessagingService.SubscribeAsync(Items.channel, Items.callback);
		log("warn", `✅ [CrossServerService] Started in ${setDecimalPlaces(tick() - start_time)}s`);
	}
}
