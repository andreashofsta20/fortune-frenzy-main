import { ArgsOf, Client, Discord, On } from "discordx";

function generateRandomString() {
	const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
	let result = "";
	for (let i = 0; i < 4; i++) {
		result += characters.charAt(Math.floor(Math.random() * characters.length));
	}
	return result;
}

@Discord()
export class ready {
	@On({ event: "threadCreate" })
	async threadCreate([thread]: ArgsOf<"threadCreate">, client: Client) {
		if (thread.parentId === "1316843576381931561") {
			try {
				thread.setName(`[BR-${generateRandomString()}] ${thread.name}`);
			} catch (error) {}
		}
	}
}
