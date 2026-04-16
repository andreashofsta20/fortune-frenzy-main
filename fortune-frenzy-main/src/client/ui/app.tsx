import React, { useEffect } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { Layer } from "./layer";
import { SideBar } from "./core/SideBar";
import { LoadingScreen } from "./menus/LoadingScreen";
import MenuContainer from "./menu-container";
import Overlay from "./core/Overlay";
import Notifications from "./core/Notifications";
import { PaycheckWidget } from "client/ui/core/PaycheckWidget";
import { TutorialOfferModal } from "client/tutorial/TutorialOfferModal";
import { TutorialOverlay } from "client/tutorial/TutorialOverlay";
import { backendApiUnreachableAtom } from "client/utils/global-state";
import { ensureTouchMobileMenuUpscaleTutorialSync } from "client/utils/menu-mobile-upscale";
import { GEMS_THUMB_IMAGE } from "shared/util/strings";

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
	const backendUnreachable = useAtom(backendApiUnreachableAtom);

	useEffect(() => {
		ensureTouchMobileMenuUpscaleTutorialSync();
	}, []);

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
			<frame
				key="app-chrome-root"
				BackgroundTransparency={1}
				Size={new UDim2(1, 0, 1, 0)}
				Visible={!backendUnreachable}
			>
				<LoadingScreen />
				<SideBar
					buttons={buttons}
					currencies={[
						["Cash", "rbxassetid://86337070472077", Color3.fromRGB(64, 188, 74)],
						["Gems", GEMS_THUMB_IMAGE, Color3.fromRGB(53, 180, 255)],
					]}
				/>
				<PaycheckWidget />
				<MenuContainer />
				<Overlay />
				<Notifications />
				<TutorialOfferModal />
				<TutorialOverlay />
			</frame>
		</Layer>
	);
}
