import { EmbedBuilder } from "discord.js";

export function errorEmbed(title: string, description: string) {
	return new EmbedBuilder()
		.setColor("#f76e6e")
		.setDescription(`### <:nova_error:1278474560026706020> ${title}\n${description}`);
}

export function successEmbed(title: string, description: string) {
	return new EmbedBuilder()
		.setColor("#3ba45c")
		.setDescription(`### <:nova_success:1278474605375524988> ${title}\n${description}`);
}