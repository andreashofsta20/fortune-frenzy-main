import { Modding } from "@flamework/core";
import { PlayerManagementService } from "server/services/PlayerManagementService";
import { ItemManagementService } from "server/services/ItemManagementService";
import { Functions } from "server/network";

const cooldowns = new Map<Player, number>();
const COOLDOWN_TIME = 0.5;

export default {
	function: Functions.Marketplace.ToggleEquip,
	handle: async (player: Player, itemId: string) => {
		const playerManagementService = Modding.resolveSingleton(PlayerManagementService);
		const itemManagementService = Modding.resolveSingleton(ItemManagementService);
		const onlineProfile = await playerManagementService.getOnlineProfile(player, true);
		const localProfile = playerManagementService.getSessionOnlyProfile(player);
		if (!onlineProfile || !localProfile) return false;

		if (cooldowns.has(player) && tick() - cooldowns.get(player)! < COOLDOWN_TIME)
			return onlineProfile.Data.EquippedItems.includes(itemId);
		cooldowns.set(player, tick());

		task.delay(COOLDOWN_TIME, () => {
			cooldowns.delete(player);
		});

		let ownsAtLeastOne = false;

		for (let i = 0; i < localProfile.OwnedUAIDs.size(); i++) {
			const uaid = localProfile.OwnedUAIDs[i];
			const uaidInfo = itemManagementService.UAIDInfo.get(uaid);
			if (!uaidInfo || uaidInfo[0] !== itemId) continue;
			ownsAtLeastOne = true;
			break;
		}

		if (!ownsAtLeastOne) return false;

		const equippedItems = onlineProfile.Data.EquippedItems;

		if (equippedItems.includes(itemId)) {
			onlineProfile.Data.EquippedItems = equippedItems.filter((id) => id !== itemId);
			playerManagementService.reloadCharacterAccessories(player);
			return false;
		} else {
			if (equippedItems.size() >= 5) {
				equippedItems.shift();
			}

			equippedItems.push(itemId);
			playerManagementService.reloadCharacterAccessories(player);
			return true;
		}
	},
};
