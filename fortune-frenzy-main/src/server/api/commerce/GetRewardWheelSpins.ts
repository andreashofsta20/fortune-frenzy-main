import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { Functions } from "server/network";

export default {
	function: Functions.Commerce.GetRewardWheelSpins,
	handle: async (player: Player) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);

		try {
			const profile = await playerManagementService.getOnlineProfile(player, true);
			if (!profile) {
				return {
					status: "error",
					message: "Profile not found",
					code: 404,
					spins: 0,
					nextFreeAt: 0,
				};
			}

			const currentTime = os.time();
			const rewardData = profile.Data.RewardWheelData;
			const validSpins = rewardData.Spins.filter((spin) => !spin.used && spin.expires_at > currentTime);
			const FREE_SPIN_INTERVAL = 60 * 60 * 12;
			const lastFreeSpinTime = rewardData.LastFreeSpinAwardedAt || 0;
			const nextFreeAt = lastFreeSpinTime + FREE_SPIN_INTERVAL;

			return {
				status: "success",
				code: 200,
				spins: validSpins.size(),
				nextFreeAt: nextFreeAt,
			};
		} catch (error) {
			return {
				status: "error",
				message: `Failed to get reward wheel spins: ${error}`,
				code: 500,
				spins: 0,
				nextFreeAt: 0,
			};
		}
	},
};
