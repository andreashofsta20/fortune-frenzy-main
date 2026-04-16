import {
	CommandInteraction,
	EmbedBuilder,
	GuildMember,
	SlashCommandStringOption,
} from "discord.js";
import { Discord, Slash, SlashOption } from "discordx";
import { isStaff } from "../../../config/discord-ids.js";
import { isFortuneFrenzyOwner } from "../../../config/fortune-frenzy-owner.js";
import {
	ffAddCash,
	ffAddItemCopy,
	ffGetCatalogItems,
	type FfCatalogItem,
	ffGetUser,
	ffGetWallet,
	ffRemoveCash,
	FortuneFrenzyApiError,
} from "../../../services/fortuneFrenzyApi.js";
import { parseHumanInt64 } from "../../../utils/parseHumanInt.js";
import { buildFfErrorEmbed, logFfCommandError } from "../../../utils/ffSlashErrors.js";
import { ffErrorEmbed, ffSuccessEmbed, robloxProfileUrl } from "../../../utils/ffEmbeds.js";

function requireStaffGuild(interaction: CommandInteraction): GuildMember | null {
	const m = interaction.member;
	if (!interaction.inGuild() || !m || typeof m === "string") {
		void interaction.reply({
			ephemeral: true,
			embeds: [ffErrorEmbed("Server only", "Run this in a guild where you have staff or owner access.")],
		});
		return null;
	}
	const gm = m as GuildMember;
	if (!isStaff(gm) && !isFortuneFrenzyOwner(gm)) {
		void interaction.reply({
			ephemeral: true,
			embeds: [ffErrorEmbed("Not allowed", "Requires staff role, staff allowlist user id, or FF owner id.")],
		});
		return null;
	}
	return gm;
}

async function resolveCurrentCashBigint(userId: string): Promise<bigint> {
	const w = await ffGetWallet(userId);
	if (w.mongo_wallet && w.cash !== undefined && w.cash !== null) {
		const s = String(w.cash).split(/[.]/)[0] ?? "0";
		return BigInt(s.replace(/\D/g, "") || "0");
	}
	const u = await ffGetUser(userId);
	if (!u) {
		throw new FortuneFrenzyApiError(404, "User not found.");
	}
	const raw = String(u.statistics.current_cash ?? "0");
	const n = Number(raw.replace(/[^0-9.-]/g, ""));
	if (!Number.isFinite(n) || n < 0) {
		return 0n;
	}
	return BigInt(Math.floor(n));
}

/** Greedy picks catalog rows until sum >= target (may overshoot on last item). */
function greedyItemIdsForValue(items: FfCatalogItem[], target: bigint): string[] {
	const valid = items
		.filter((i) => i.value > 0)
		.sort((a, b) => b.value - a.value);
	if (valid.length === 0) {
		return [];
	}
	let total = 0n;
	const picks: string[] = [];
	let guard = 0;
	while (total < target && guard < 4000) {
		guard++;
		const rem = target - total;
		const fits = valid.filter((i) => BigInt(i.value) <= rem);
		const pick = fits.length > 0 ? fits[0]! : valid[valid.length - 1]!;
		picks.push(pick.id);
		total += BigInt(pick.value);
	}
	return picks;
}

@Discord()
class FFEconomy {
	@Slash({
		description: "[Staff] Add cash to a Roblox user (API: POST /users/:id/add-cash).",
		name: "ffaddcash",
	})
	async ffaddcash(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id")
				.setRequired(true),
		)
		robloxUserId: string,
		@SlashOption(
			new SlashCommandStringOption()
				.setName("amount")
				.setDescription("Amount: e.g. 500k, 1.5m, 10000000")
				.setRequired(true),
		)
		amountRaw: string,
		interaction: CommandInteraction,
	) {
		const staff = requireStaffGuild(interaction);
		if (!staff) return;
		if (!/^\d+$/.test(robloxUserId.trim())) {
			return interaction.reply({
				ephemeral: true,
				embeds: [ffErrorEmbed("Invalid id", "Use a numeric Roblox user id.")],
			});
		}
		const parsed = parseHumanInt64(amountRaw);
		if (!parsed.ok) {
			return interaction.reply({ ephemeral: true, embeds: [ffErrorEmbed("Invalid amount", parsed.error)] });
		}

		await interaction.deferReply({ ephemeral: true });
		try {
			const out = await ffAddCash(robloxUserId.trim(), parsed.value);
			const cashHint =
				typeof out === "object" && out !== null && "cash" in out
					? `\nWallet balance now: \`${String((out as { cash?: unknown }).cash)}\``
					: "";
			return interaction.editReply({
				embeds: [
					ffSuccessEmbed(
						"Cash credited",
						`Amount: **${parsed.value.toLocaleString()}**\nUser: [\`${robloxUserId.trim()}\`](${robloxProfileUrl(robloxUserId.trim())})${cashHint}`,
					),
				],
			});
		} catch (e) {
			logFfCommandError("ffaddcash", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}

	@Slash({
		description: "[Staff] Remove cash: type `all` or an amount (500k, 1m, …).",
		name: "ffremovecash",
	})
	async ffremovecash(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id")
				.setRequired(true),
		)
		robloxUserId: string,
		@SlashOption(
			new SlashCommandStringOption()
				.setName("amount")
				.setDescription("`all` to drain current cash, or e.g. 500k")
				.setRequired(true),
		)
		amountRaw: string,
		interaction: CommandInteraction,
	) {
		const staff = requireStaffGuild(interaction);
		if (!staff) return;
		if (!/^\d+$/.test(robloxUserId.trim())) {
			return interaction.reply({
				ephemeral: true,
				embeds: [ffErrorEmbed("Invalid id", "Use a numeric Roblox user id.")],
			});
		}

		await interaction.deferReply({ ephemeral: true });
		const uid = robloxUserId.trim();

		try {
			let removeAmt: bigint;
			if (amountRaw.trim().toLowerCase() === "all") {
				removeAmt = await resolveCurrentCashBigint(uid);
				if (removeAmt <= 0n) {
					return interaction.editReply({
						embeds: [ffErrorEmbed("Nothing to remove", "That user has **0** cash or no profile.")],
					});
				}
			} else {
				const parsed = parseHumanInt64(amountRaw);
				if (!parsed.ok) {
					return interaction.editReply({ embeds: [ffErrorEmbed("Invalid amount", parsed.error)] });
				}
				removeAmt = parsed.value;
			}

			const out = await ffRemoveCash(uid, removeAmt);
			const cashHint =
				typeof out === "object" && out !== null && "cash" in out
					? `\nWallet balance now: \`${String((out as { cash?: unknown }).cash)}\``
					: "";
			return interaction.editReply({
				embeds: [
					ffSuccessEmbed(
						"Cash debited",
						`Amount: **${removeAmt.toLocaleString()}**\nUser: [\`${uid}\`](${robloxProfileUrl(uid)})${cashHint}`,
					),
				],
			});
		} catch (e) {
			logFfCommandError("ffremovecash", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}

	@Slash({
		description: "[Staff] Grant items from the catalog until Rolimons value sum ≥ target (approximate).",
		name: "ffaddvalue",
	})
	async ffaddvalue(
		@SlashOption(
			new SlashCommandStringOption()
				.setName("roblox_user_id")
				.setDescription("Numeric Roblox user id")
				.setRequired(true),
		)
		robloxUserId: string,
		@SlashOption(
			new SlashCommandStringOption()
				.setName("value")
				.setDescription("Target total value e.g. 500k, 2.5m")
				.setRequired(true),
		)
		valueRaw: string,
		interaction: CommandInteraction,
	) {
		const staff = requireStaffGuild(interaction);
		if (!staff) return;
		if (!/^\d+$/.test(robloxUserId.trim())) {
			return interaction.reply({
				ephemeral: true,
				embeds: [ffErrorEmbed("Invalid id", "Use a numeric Roblox user id.")],
			});
		}
		const parsed = parseHumanInt64(valueRaw);
		if (!parsed.ok) {
			return interaction.reply({ ephemeral: true, embeds: [ffErrorEmbed("Invalid value", parsed.error)] });
		}

		await interaction.deferReply({ ephemeral: true });
		const uid = robloxUserId.trim();

		try {
			const catalog = await ffGetCatalogItems();
			const picks = greedyItemIdsForValue(catalog, parsed.value);
			if (picks.length === 0) {
				return interaction.editReply({
					embeds: [ffErrorEmbed("No items", "Catalog has no positive-value rows, or the target cannot be reached.")],
				});
			}
			if (picks.length > 800) {
				return interaction.editReply({
					embeds: [
						ffErrorEmbed(
							"Too many items",
							`Would need **${picks.length}** copies (max **800** per run). Use a smaller target or higher-value catalog items.`,
						),
					],
				});
			}

			const valueById = new Map(catalog.map((c) => [c.id, BigInt(Math.max(0, Math.floor(c.value)))]));
			let sum = 0n;
			const counts = new Map<string, number>();
			for (const id of picks) {
				await ffAddItemCopy(uid, id);
				sum += valueById.get(id) ?? 0n;
				counts.set(id, (counts.get(id) ?? 0) + 1);
			}

			const summary = [...counts.entries()]
				.slice(0, 12)
				.map(([id, n]) => `\`${id}\` ×${n}`)
				.join("\n");
			const more = counts.size > 12 ? `\n_…and ${counts.size - 12} more item id(s)_` : "";

			const embed = new EmbedBuilder()
				.setColor(0x15803d)
				.setAuthor({ name: "Fortune Frenzy" })
				.setTitle("Inventory granted")
				.setDescription(
					`Greedy grant toward **≥ ${parsed.value.toLocaleString()}** Rolimons value (may overshoot). User: [\`${uid}\`](${robloxProfileUrl(uid)}).`,
				)
				.addFields(
					{
						name: "Result",
						value: `**${picks.length}** copies · ~**${sum.toLocaleString()}** total value`,
						inline: false,
					},
					{ name: "Item ids (sample)", value: summary + more || "—", inline: false },
				)
				.setFooter({ text: "One POST /items/add per copy · large jobs may take a few seconds" });

			return interaction.editReply({ embeds: [embed] });
		} catch (e) {
			logFfCommandError("ffaddvalue", e);
			return interaction.editReply({ embeds: [buildFfErrorEmbed(e)] });
		}
	}
}
