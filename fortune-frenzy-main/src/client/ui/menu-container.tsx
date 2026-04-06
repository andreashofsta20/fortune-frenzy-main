// MenuContainer.tsx
import React, { useEffect, useCallback } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { MainMenusHolder } from "./navigation/MainMenusHolder";
import { useMotion } from "client/hooks/use-motion";
import {
	activeMenuAtom,
	previousMenuAtom,
	inventoryOverlayStateAtom,
	isNavigationVisibleAtom,
} from "client/utils/global-state";

import { MarketplaceMenu } from "./menus/MarketplaceMenu";
import { TradingMenu } from "./menus/TradingMenu";
import { ItemCasesMenu } from "./menus/ItemCasesMenu";
import { InventoryMenu } from "./menus/InventoryMenu";
import { MinigamesMenu } from "./menus/MinigamesMenu";
import { RobuxShopMenu } from "./menus/ExclusiveStoreMenu";
import { CoinflipMenu } from "./menus/CoinflipMenu";
import { ProfilesMenu } from "./menus/ProfilesMenu";
import { DailyRewardPopUp } from "./rewards/DailyRewardMenu";
import { CaseBattlesMenu } from "./menus/CaseBattlesMenu";
import { JackpotMenu } from "./menus/JackpotMenu";
import { RewardWheelMenu } from "./rewards/RewardWheelMenu";
import { LeaderboardsMenu } from "./menus/LeaderboardsMenu";

const MENUS = {
	PROFILES: "Profiles",
	TRADING: "Trading",
	MARKETPLACE: "Marketplace",
	INVENTORY: "Inventory",
	ITEM_CASES: "ItemCases",
	COINFLIP: "Coinflip",
	ROBUX_SHOP: "RobuxShop",
	MINIGAMES: "Minigames",
	DAILY_REWARD: "DailyReward",
	CASE_BATTLES: "CaseBattles",
	JACKPOT: "Jackpot",
	REWARD_WHEEL: "RewardWheel",
	LEADERBOARDS: "Leaderboards",
};

const ANIMATION_DURATION = 0.25;

function MenuContainer() {
	const currentMenu = useAtom(activeMenuAtom);
	const previousMenu = useAtom(previousMenuAtom);
	const inventoryOverlayState = useAtom(inventoryOverlayStateAtom);
	const [menuHolderPosition, menuHolderPositionMotion] = useMotion(new UDim2(0.5, 0, 0.5, 0));

	const isMenuVisible = useCallback(
		(menu: string) => (currentMenu === "" && previousMenu === menu) || currentMenu === menu,
		[currentMenu, previousMenu],
	);

	const flashMenu = useCallback(async () => {
		const tweenParams = {
			time: ANIMATION_DURATION,
			style: Enum.EasingStyle.Exponential,
			direction: Enum.EasingDirection.Out,
		};
		menuHolderPositionMotion.set(new UDim2(0.5, 0, 0.55, 0));
		menuHolderPositionMotion.tween(new UDim2(0.5, 0, 0.5, 0), tweenParams);
	}, [menuHolderPositionMotion]);

	useEffect(() => {
		if (currentMenu === "") {
			menuHolderPositionMotion.tween(new UDim2(0.5, 0, 0.55, 0), {
				time: ANIMATION_DURATION,
				style: Enum.EasingStyle.Back,
				direction: Enum.EasingDirection.In,
			});
			task.delay(ANIMATION_DURATION / 1.5, () => {
				previousMenuAtom("");
			});
		} else {
			flashMenu();
		}
	}, [currentMenu, flashMenu, menuHolderPositionMotion]);

	return (
		<MainMenusHolder position={menuHolderPosition}>
			<ProfilesMenu visible={isMenuVisible(MENUS.PROFILES)} flashMenu={flashMenu} key={"ProfilesMenu"} />
			<MarketplaceMenu visible={isMenuVisible(MENUS.MARKETPLACE)} flashMenu={flashMenu} key={"MarketplaceMenu"} />
			<TradingMenu visible={isMenuVisible(MENUS.TRADING)} flashMenu={flashMenu} key={"TradingMenu"} />
			<ItemCasesMenu visible={isMenuVisible(MENUS.ITEM_CASES)} flashMenu={flashMenu} key={"ItemCasesMenu"} />
			<CoinflipMenu visible={isMenuVisible(MENUS.COINFLIP)} flashMenu={flashMenu} key={"CoinflipMenu"} />
			<RobuxShopMenu visible={isMenuVisible(MENUS.ROBUX_SHOP)} flashMenu={flashMenu} key={"RobuxShopMenu"} />
			<MinigamesMenu visible={isMenuVisible(MENUS.MINIGAMES)} flashMenu={flashMenu} key={"MinigamesMenu"} />
			<CaseBattlesMenu
				visible={isMenuVisible(MENUS.CASE_BATTLES)}
				flashMenu={flashMenu}
				key={"CaseBattlesMenu"}
			/>
			<DailyRewardPopUp
				visible={isMenuVisible(MENUS.DAILY_REWARD)}
				flashMenu={flashMenu}
				key={"DailyRewardPopUp"}
			/>
			<JackpotMenu visible={isMenuVisible(MENUS.JACKPOT)} flashMenu={flashMenu} key={"JackpotMenu"} />
			<InventoryMenu
				visible={isMenuVisible(MENUS.INVENTORY) || (inventoryOverlayState?.visible ?? false)}
				handleCloseButton={inventoryOverlayState?.handleCloseButton}
				scale={inventoryOverlayState?.scale ?? true}
				mode={inventoryOverlayState?.selectionData ? "selection" : "default"}
				selectionData={inventoryOverlayState?.selectionData as never}
				inventoryOverwrite={inventoryOverlayState?.inventoryOverwrite}
				key={"InventoryMenu"}
			/>
			<RewardWheelMenu
				visible={isMenuVisible(MENUS.REWARD_WHEEL)}
				flashMenu={flashMenu}
				key={"RewardWheelMenu"}
			/>
			<LeaderboardsMenu
				visible={isMenuVisible(MENUS.LEADERBOARDS)}
				flashMenu={flashMenu}
				key={"LeaderboardsMenu"}
			/>
		</MainMenusHolder>
	);
}

export default MenuContainer;
