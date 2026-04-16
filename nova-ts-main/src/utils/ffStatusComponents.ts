import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

export function ffStatusActionRow(): ActionRowBuilder<ButtonBuilder> {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder()
			.setCustomId("ffstatus_refresh")
			.setLabel("Refresh")
			.setStyle(ButtonStyle.Secondary),
	);
}
