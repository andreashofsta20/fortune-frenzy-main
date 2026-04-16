import { ArgsOf, Client, Discord, On } from "discordx";
import { fortuneFrenzyLogger } from "../../utils/monitors/fortuneFrenzyLogger.js";

@Discord()
export class ready {
	@On({ event: "ready" })
	async ready(_: any, client: Client, guardPayload: any) {
		console.log(`Ready! Logged in as ${client.user?.tag}`);

		if (process.env.FORTUNE_FRENZY_API_LOGS_ENABLED === "true") {
			void fortuneFrenzyLogger(client).catch((err) => console.error("[fortuneFrenzyLogger]", err));
		}

		void client.initApplicationCommands();
	}

	@On({ event: "guildMemberAdd" })
	async onGuildMemberAdd([member]: ArgsOf<"guildMemberAdd">, client: Client) {
		if (member.guild.id !== "1169775476739411978") return;
		try {
			member.roles.add("1169775476756201633");
		} catch (error) {}
	}
}
