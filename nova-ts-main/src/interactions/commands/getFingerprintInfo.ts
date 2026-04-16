import {
	APIEmbedField,
	CommandInteraction,
	EmbedBuilder,
	GuildMember,
	SlashCommandStringOption,
	SlashCommandUserOption,
	User,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { getMariaConnection } from "../../services/mariaService.js";
import { errorEmbed } from "../../utils/embed.js";

@Discord()
class update {
    @Slash({ description: "Get fingerprint information.", name: "fingerprint_info" })
    async update(
        @SlashOption(
            new SlashCommandStringOption()
                .setName("fingerprint")
                .setDescription("Public Fingerprint")
                .setRequired(true),
        )
        fingerprint: string,
        interaction: CommandInteraction,
    ) {
        const member = interaction.member as GuildMember;
        if (!member) return;

        await interaction.deferReply();
        const connection = await getMariaConnection();
        const rows = await connection.query("SELECT * FROM roblox_oauth_data WHERE public_fingerprint = ?", [fingerprint]);
        await connection.release();

        if (rows.length === 0) {
            return interaction.editReply({
                embeds: [
                    errorEmbed("Fingerprint not found.", "The provided fingerprint was not found in the database."),
                ],
            });
        }

        console.log(rows);

        const fields: APIEmbedField[] = [];
        rows.forEach((element: any) => {
            const claimsCache = JSON.parse(element.claims_cache);
            fields.push({
                name: `Discord ID: ${element.discord_id}`,
                value: `Roblox: [${claimsCache.preferred_username}](https://www.roblox.com/users/${claimsCache.sub})\nPing: <@${element.discord_id}>`,
            });
        });

        const embed = new EmbedBuilder().addFields(fields).setTitle("Fingerprint Information").setColor("#129f5d");
        await interaction.editReply({ embeds: [embed] });
    }
}
