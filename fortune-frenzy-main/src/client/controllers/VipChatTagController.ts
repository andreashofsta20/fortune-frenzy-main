import { Controller, OnStart } from "@flamework/core";
import { Players, TextChatService } from "@rbxts/services";

/** Matches Exclusive Store VIP accent (see `ExclusiveStoreMenu` / VIP tile). */
const VIP_CHAT_TAG_HEX = "#FFAD20";

/**
 * Prepends a colored [VIP] tag in Text Chat for players with the replicated `VIP` attribute
 * (set by `CommerceService.syncVipPlayerTagAttribute` on the server).
 * `TextChatService.OnIncomingMessage` is client-only; tags use server-authoritative attributes.
 */
@Controller()
export class VipChatTagController implements OnStart {
	onStart(): void {
		TextChatService.OnIncomingMessage = (message: TextChatMessage) => {
			const textSource = message.TextSource;
			if (textSource === undefined) return undefined;

			const userId = textSource.UserId;
			if (userId === 0) return undefined;

			const speaker = Players.GetPlayerByUserId(userId);
			if (speaker === undefined) return undefined;
			if (speaker.GetAttribute("VIP") !== true) return undefined;

			const properties = new Instance("TextChatMessageProperties") as TextChatMessageProperties;
			properties.PrefixText = `<font color="${VIP_CHAT_TAG_HEX}"><b>[VIP]</b></font> ${message.PrefixText}`;
			return properties;
		};
	}
}
