import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

/** Luau-safe nearest integer (avoid relying on `math.round` on older runtimes). */
function roundToNearestInt(n: number): number {
	return math.floor(n + (n >= 0 ? 0.5 : -0.5));
}

export default {
	function: Functions.Loading.SetClientData,
	handle: async (player: Player, data: { current_time: number }) => {
		try {
			if (!data || !typeIs(data.current_time, "number")) {
				return false;
			}

			const pms = Modding.resolveSingleton(PlayerManagementService);
			const getProfile = (pms as unknown as { getOnlineProfile?: unknown }).getOnlineProfile;
			if (!typeIs(getProfile, "function")) {
				warn("[SetClientData] PlayerManagementService not ready (no getOnlineProfile)");
				return false;
			}

			// Wait up to 60s (see PlayerManagementService.getOnlineProfile) for ProfileStore session.
			const playerData = await pms.getOnlineProfile(player, true);
			if (!playerData?.Data?.UserData) {
				return false;
			}

			const serverTime = DateTime.now();
			const difference = data.current_time - serverTime.UnixTimestamp;
			const minutes = roundToNearestInt(difference / 60);

			if (math.abs(minutes) > 840) {
				warn(`Invalid timezone difference detected for player ${player.Name}: ${minutes} minutes`);
				return false;
			}

			const ud = playerData.Data.UserData;
			if (ud.TimezoneDifferenceFromUTC_LastUpdated + 86400 < serverTime.UnixTimestamp) {
				ud.TimezoneDifferenceFromUTC = minutes;
				ud.TimezoneDifferenceFromUTC_LastUpdated = serverTime.UnixTimestamp;
			}

			return true;
		} catch (err) {
			warn(`[SetClientData] error for ${player.Name}:`, err);
			return false;
		}
	},
};
