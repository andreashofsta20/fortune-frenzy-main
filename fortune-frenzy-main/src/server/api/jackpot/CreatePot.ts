import { Modding } from "@flamework/core";
import { Functions } from "server/network";
import { JackpotService } from "server/services/JackpotService";
import { normalizeJackpotValueCap } from "shared/util/jackpot-value-cap";

export default {
	function: Functions.Jackpot.CreatePot,
	handle: async (player: Player, value_range: string, max_players: number, start_delay: number) => {
		const jackpotService = Modding.resolveSingleton(JackpotService);

		const [capToken, floorToken] = value_range.split("#");
		const valueCap = normalizeJackpotValueCap(capToken, 0);
		if (valueCap < 1) return { status: "error", code: 400, message: "Invalid value range" };

		const parsedFloor = floorToken !== undefined ? tonumber(floorToken.gsub(",", "")[0]) : undefined;
		const valueFloor =
			parsedFloor !== undefined &&
			parsedFloor === parsedFloor &&
			parsedFloor > -math.huge &&
			parsedFloor < math.huge
				? math.max(0, math.floor(parsedFloor))
				: 0;

		return jackpotService.createJackpot(player, valueCap, math.min(valueFloor, valueCap), max_players, start_delay);
	},
};
