import React from "@rbxts/react";
import { Layer } from "./layer";
import { SideBar } from "./core/SideBar";
import { LoadingScreen } from "./menus/LoadingScreen";
import MenuContainer from "./menu-container";
import Overlay from "./core/Overlay";
import Notifications from "./core/Notifications";
import { PaycheckWidget } from "client/ui/core/PaycheckWidget";
import { TutorialOverlay } from "client/tutorial/TutorialOverlay";

const MENUS = {
	PROFILES: "Profiles",
	TRADING: "Trading",
	MARKETPLACE: "Marketplace",
	INVENTORY: "Inventory",
	ITEM_CASES: "ItemCases",
	COINFLIP: "Coinflip",
	CASE_BATTLES: "CaseBattles",
	ROBUX_SHOP: "RobuxShop",
	MINIGAMES: "Minigames",
	JACKPOT: "Jackpot",
	DAILY_REWARD: "DailyReward",
	REWARD_WHEEL: "RewardWheel",
	LEADERBOARDS: "Leaderboards",
};

export function App() {
	const buttons: [string, string][] = [
		["rbxassetid://97435883027463", MENUS.PROFILES],
		["rbxassetid://97391903080074", MENUS.TRADING],
		["rbxassetid://84088657648025", MENUS.MARKETPLACE],
		["rbxassetid://12259966451", MENUS.INVENTORY],
		["rbxassetid://112840024298477", MENUS.ROBUX_SHOP],
		["rbxassetid://77906840323180", MENUS.MINIGAMES],
		["rbxassetid://14931115187", MENUS.LEADERBOARDS],
	];

	return (
		<Layer name={"App"}>
			<LoadingScreen />
			<SideBar
				buttons={buttons}
				currencies={[
					["Cash", "rbxassetid://86337070472077", Color3.fromRGB(64, 188, 74)],
					["Gems", "rbxassetid://71369037261295", Color3.fromRGB(53, 180, 255)],
				]}
			/>
			<PaycheckWidget />
			<MenuContainer />
			<Overlay />
			<Notifications />
			<TutorialOverlay />
		</Layer>
	);
}
