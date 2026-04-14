import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { JackpotService } from "server/services/JackpotService";
import filterServerSeed from "server/util/jackpot/filterServerSeed";
import log from "shared/util/log";
import { JackpotData } from "typings/APIResponses";

export default {
	function: Functions.Jackpot.GetPots,
	handle: async (player: Player) => {
		try {
			const jackpotService = Modding.resolveSingleton(JackpotService);
			return jackpotService.Jackpots.map((pot) => {
				const [ok, out] = pcall(() => filterServerSeed(pot));
				if (!ok) {
					log("warn", `[Jackpot/GetPots] filterServerSeed failed for pot ${pot.id}:`, out);
					return { ...pot, server_seed: pot.status === "complete" ? pot.server_seed : "[REDACTED]" };
				}
				return out as JackpotData;
			});
		} catch (e) {
			log("warn", "[Jackpot/GetPots] failed:", e);
			return [];
		}
	},
};
