import React, { useEffect, useState } from "@rbxts/react";
import { useMotion } from "client/hooks/use-motion";
import { usePx } from "client/hooks/use-px";
import { SidebarButton } from "../navigation/SidebarButton";
import { CurrencyDisplay } from "./CurrencyDisplay";
import { usePxScale } from "client/hooks/use-scale";
import { isNavigationVisibleAtom } from "client/utils/global-state";
import { useAtom } from "@rbxts/react-charm";
import { peek } from "@rbxts/charm";
import { activeMenuAtom } from "client/utils/global-state"; // Added for peek in onClick
import {
	TutorialActionId,
	TUTORIAL_TARGET_IDS,
	advanceTutorialAction,
	isTutorialInteractionBlocked,
} from "client/tutorial/tutorial-state";

interface Props {
	buttons: [iconUrl: string, name: string][];
	currencies: [currency: string, iconUrl: string, color: Color3][];
}

export function SideBar({ buttons, currencies }: Props) {
	const px = usePx();
	const buttonsVisible = useAtom(isNavigationVisibleAtom);
	const [barPosition, barPositionMotion] = useMotion(new UDim2(0, 0, 0.5, 0));
	const [barAnchorPoint, barAnchorPointMotion] = useMotion(new Vector2(1, 0.5));
	const [visible, setVisible] = useState(false);

	const getTutorialActionForMenu = (menuName: string): TutorialActionId | undefined => {
		switch (menuName) {
			case "Minigames":
				return "open_minigames_menu";
			case "Inventory":
				return "open_inventory_menu";
			default:
				return undefined;
		}
	};

	const getTutorialTargetForMenu = (menuName: string) => {
		switch (menuName) {
			case "Minigames":
				return TUTORIAL_TARGET_IDS.sidebarMinigames;
			case "Inventory":
				return TUTORIAL_TARGET_IDS.sidebarInventory;
			default:
				return undefined;
		}
	};

	useEffect(() => {
		const pos = buttonsVisible ? new UDim2(0, px(25), 0.5, 0) : new UDim2(0, 0, 0.5, 0);
		const anchor = buttonsVisible ? new Vector2(0, 0.5) : new Vector2(1, 0.5);
		const tweenOpts = { time: 0.3, style: Enum.EasingStyle.Exponential, direction: Enum.EasingDirection.InOut };
		barPositionMotion.tween(pos, tweenOpts);
		barAnchorPointMotion.tween(anchor, tweenOpts);

		if (buttonsVisible) {
			setVisible(true);
		} else {
			task.delay(0.3, () => {
				setVisible(false);
			});
		}
	}, [buttonsVisible]);

	return (
		<frame
			AnchorPoint={barAnchorPoint}
			Size={new UDim2(0, px(180), 1, px(-150))}
			Position={barPosition}
			BackgroundTransparency={1}
			Visible={visible}
		>
			<uiscale Scale={usePxScale()()} />
			<uilistlayout
				FillDirection={Enum.FillDirection.Vertical}
				Padding={new UDim(0, px(8))}
				VerticalAlignment={Enum.VerticalAlignment.Center}
				SortOrder={Enum.SortOrder.LayoutOrder}
			/>
			<frame
				BackgroundTransparency={1}
				AutomaticSize={Enum.AutomaticSize.Y}
				LayoutOrder={2}
				Size={new UDim2(1, 0, 0, px(1))}
			>
				<uigridlayout
					CellSize={new UDim2(0, px(54), 0, px(54))}
					CellPadding={new UDim2(0, px(8), 0, px(8))}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{buttons.map(([iconUrl, name], index) => (
					<SidebarButton
						imageUrl={iconUrl}
						name={name}
						layoutOrder={index + 1}
						tutorialTargetId={getTutorialTargetForMenu(name)}
						onClick={() => {
							const tutorialAction = getTutorialActionForMenu(name);
							if (isTutorialInteractionBlocked(tutorialAction)) return;

							if (buttonsVisible) {
								const currentMenuValue = peek(activeMenuAtom);
								const nextMenu = currentMenuValue === name ? "" : name;
								activeMenuAtom(nextMenu);

								if (tutorialAction && nextMenu === name) {
									advanceTutorialAction(tutorialAction);
								}
							}
						}}
						key={name}
					/>
				))}
			</frame>
			<frame
				BackgroundTransparency={1}
				AutomaticSize={Enum.AutomaticSize.Y}
				LayoutOrder={1}
				Size={new UDim2(1, 0, 0, px(1))}
			>
				<uilistlayout Padding={new UDim(0, px(8))} VerticalAlignment={Enum.VerticalAlignment.Center} />
				{currencies.map(([currency, iconUrl, color]) => (
					<CurrencyDisplay icon={iconUrl} currency={currency} color={color} key={currency} />
				))}
			</frame>
		</frame>
	);
}
