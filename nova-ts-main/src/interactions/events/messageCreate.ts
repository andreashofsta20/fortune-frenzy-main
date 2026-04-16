import { ArgsOf, Client, Discord, Guard, On } from "discordx";
import { NotBot } from "@discordx/utilities";
import { ChannelType } from "discord.js";
import handleDmMessage from "../../utils/messageCreation/handleDmMessage.js";
import handleLevelling from "../../utils/messageCreation/handleLevelling.js";

@Discord()
export class messageCreate {
	@On({ event: "messageCreate" })
	@Guard(NotBot)
	messageCreate([message]: ArgsOf<"messageCreate">, client: Client, guardPayload: any) {
		if (message.channel.type === ChannelType.DM) {
			return handleDmMessage([message]);
		}

		if (message.channel.type === ChannelType.PrivateThread && message.channel.parentId === "1169775478467465394") {
			return handleDmMessage([message]);
		}

		if (message.guild && message.guild.id === "1169775476739411978") {
			client.executeCommand(message);
			handleLevelling([message]);
		}
	}
}
