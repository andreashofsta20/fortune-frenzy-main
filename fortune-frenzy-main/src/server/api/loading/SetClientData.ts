import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Loading.SetClientData,
	handle: async (player: Player, data: { current_time: number }) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const playerData = await playerManagementService.getOnlineProfile(player);

		if (!playerData) return false;

		const serverTime = DateTime.now();
		const difference = data.current_time - serverTime.UnixTimestamp;
		const minutes = math.round(difference / 60);

		if (math.abs(minutes) > 840) {
			warn(`Invalid timezone difference detected for player ${player.Name}: ${minutes} minutes`);
			return false;
		}

		if (playerData.Data.UserData.TimezoneDifferenceFromUTC_LastUpdated + 86400 < serverTime.UnixTimestamp) {
			playerData.Data.UserData.TimezoneDifferenceFromUTC = minutes;
			playerData.Data.UserData.TimezoneDifferenceFromUTC_LastUpdated = serverTime.UnixTimestamp;
		}

		return true;
	},
};
