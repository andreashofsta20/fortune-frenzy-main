import React, { useEffect, useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { COINFLIP_MENU_TITLE } from "shared/util/strings";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { ButtonGroup } from "../core/ButtonGroup";
import getServerType from "shared/util/get-server-type";
import { Button } from "../core/Button";
import { SortButton } from "../core/SortButton";
import { Corner } from "../tools/Corner";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { CoinflipGridItem } from "./CoinflipGridItem";
import { changeMenu } from "client/utils/menu-utils";
import { coinAtom, coinflipIdAtom, coinflipStateAtom } from "client/utils/global-state";
import { peek } from "@rbxts/charm";
import { Coinflip } from "typings/APIResponses";
import { resolveStakeItemId } from "client/utils/trade-stake-token";
import { TUTORIAL_TARGET_IDS } from "client/tutorial/tutorial-state";

function filterCoinflipsForTab(coinflips: readonly Coinflip[], tab: string): Coinflip[] {
	if (tab === "Friends Only") {
		return coinflips.filter((cf) => cf.type === "friends");
	}
	if (tab === "Server") {
		return coinflips.filter((cf) => cf.type === "server");
	}
	return coinflips.filter((cf) => cf.type === "global" || cf.type === "server");
}

interface Props extends React.PropsWithChildren {
	visible: boolean;
	flashMenu: () => void;
}

export function CoinflipGrid({ visible, flashMenu, children }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [currentTab, setCurrentTab] = React.useState<string>("Global");
	const [sortType, setSortType] = React.useState("value_highest");
	const [updateCounter, setUpdateCounter] = React.useState(0);
	const isPublicServer = getServerType() === "Public";
	const availableTabs = isPublicServer ? ["Global", "Friends Only"] : ["Global", "Server"];

	useEffect(() => {
		const tabs = isPublicServer ? ["Global", "Friends Only"] : ["Global", "Server"];
		if (tabs.indexOf(currentTab) < 0) {
			setCurrentTab(tabs[0]);
		}
	}, [currentTab, isPublicServer]);

	const coinflipTiles = useMemo(() => {
		const filtered = filterCoinflipsForTab(clientStateController.Coinflips, currentTab);
		const getValue = (cf: Coinflip) => {
			const items = [...cf.player1_items, ...(cf.player2_items ?? [])];
			return items.reduce((acc, item) => {
				const itemId = resolveStakeItemId(item);
				const itemData = clientStateController.ItemInfo.get(itemId);
				return itemData ? acc + itemData.value : acc;
			}, 0);
		};
		const sorted = [...filtered].sort((a, b) => {
			const valueA = getValue(a);
			const valueB = getValue(b);
			if (sortType === "value_highest") {
				return valueB > valueA;
			}
			if (sortType === "value_lowest") {
				return valueA > valueB;
			}
			return false;
		});
		return sorted.map((coinflip, index) => (
			<CoinflipGridItem
				key={coinflip.id}
				coinflip={coinflip}
				LayoutOrder={index}
				Activated={() => {
					coinflipIdAtom(coinflip.id);
					coinflipStateAtom("viewing");
				}}
			/>
		));
	}, [updateCounter, currentTab, sortType]);

	useEffect(() => {
		if (!visible) {
			setCurrentTab("Global");
			return;
		}

		setUpdateCounter((v) => v + 1);
		const connection = clientStateController.CoinflipChangedEvent.Connect(() => setUpdateCounter((v) => v + 1));
		return () => connection.Disconnect();
	}, [visible]);

	const handleCreateClick = () => {
		if (peek(coinflipStateAtom) === "default") coinflipStateAtom("create");
	};

	return (
		<frame
			Size={new UDim2(0, px(900), 0, px(470))}
			Position={new UDim2(0.5, 0, 0.5, 0)}
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundColor3={palette.background1}
			Visible={visible}
		>
			<Corner roundness="small" />
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: COINFLIP_MENU_TITLE,
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{
				Size: new UDim2(0, px(21), 0, px(21)),
				Position: new UDim2(1, px(-24), 0, px(24)),
				AnchorPoint: new Vector2(1, 0),
			}}
				event={{ Activated: () => changeMenu("Minigames") }}
			/>
			<Button
				size={new UDim2(0, px(120), 0, px(32))}
				position={new UDim2(0, px(24), 0, px(65))}
				text="Create"
				typeface="Sans"
				weight="SemiBold"
				backgroundColor={palette.blue}
				textColor={palette.blueText}
				tutorialActionId="coinflip_create_complete"
				tutorialTargetId={TUTORIAL_TARGET_IDS.coinflipCreateButton}
				event={{ Activated: handleCreateClick }}
			/>
			<SortButton
				size={new UDim2(0, px(160), 0, px(32))}
				position={new UDim2(0, px(154), 0, px(65))}
				typeface="Sans"
				weight="SemiBold"
				setSortOrder={setSortType}
				options={[
					["value_highest", "Highest Value", 0, "rbxassetid://89977107525633"],
					["value_lowest", "Lowest Value", 180, "rbxassetid://89977107525633"],
				]}
			/>
			<ButtonGroup
				weight="SemiBold"
				options={availableTabs}
				setState={setCurrentTab}
				state={currentTab}
				position={new UDim2(1, -px(24), 0, px(60))}
				backgroundColor={palette.background1}
				anchorPoint={new Vector2(1, 0)}
			/>
			<ButtonGroup
				weight="SemiBold"
				options={["Heads", "Tails"]}
				setState={(value) => coinAtom(value as "Heads" | "Tails")}
				state={peek(coinAtom)}
				position={new UDim2(1, -px(225), 0, px(60))}
				backgroundColor={palette.background1}
				anchorPoint={new Vector2(1, 0)}
			/>
			<scrollingframe
				key={currentTab}
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, px(112))}
				Size={new UDim2(0, px(850), 0, px(332))}
				HorizontalScrollBarInset={Enum.ScrollBarInset.None}
				ScrollBarThickness={0}
			>
				<uigridlayout
					CellPadding={new UDim2(0, px(10), 0, px(10))}
					CellSize={new UDim2(0, px(276), 0, px(167))}
					FillDirection={Enum.FillDirection.Horizontal}
					SortOrder={Enum.SortOrder.LayoutOrder}
					HorizontalAlignment={Enum.HorizontalAlignment.Left}
					VerticalAlignment={Enum.VerticalAlignment.Top}
				/>
				<uipadding PaddingTop={new UDim(0, px(1))} PaddingLeft={new UDim(0, px(1))} />
				{coinflipTiles}
			</scrollingframe>
			{children}
		</frame>
	);
}
