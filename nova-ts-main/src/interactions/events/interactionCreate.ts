import { ArgsOf, Client, Discord, On } from "discordx";

@Discord()
export class interactionCreate {
	@On({ event: "interactionCreate" })
	interactionCreate([interaction]: ArgsOf<"interactionCreate">, client: Client) {
		client.executeInteraction(interaction);
	}
}
