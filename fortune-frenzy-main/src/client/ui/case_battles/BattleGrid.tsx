import React, { memo, useEffect, useMemo, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { CASE_BATTLES_MENU_TITLE, COINFLIP_MENU_TITLE } from "shared/util/strings";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { Button } from "../core/Button";
import { SortButton } from "../core/SortButton";
import { Corner } from "../tools/Corner";
import { changeMenu, handleCloseButton } from "client/utils/menu-utils";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core/out/modding";
import { ReplicatedStorage } from "@rbxts/services";
import { BattleGridTile } from "./BattleGridTile";
import { CaseBattleData } from "typings/APIResponses";

interface Props extends React.PropsWithChildren {
	visible: boolean;
	flashMenu: () => void;
	setCurrentPage: (page: "grid" | "builder" | "case-selector" | "viewing") => void;
}

export const BattleGrid = memo(({ visible, flashMenu, setCurrentPage }: Props) => {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [updateCounter, setUpdateCounter] = useState(0);
	const [sortType, setSortType] = useState("value_highest");

	useEffect(() => {
		if (!visible) return;
		setUpdateCounter((v) => v + 1);
		const connection = clientStateController.CaseBattleChangedEvent.Connect(() => setUpdateCounter((v) => v + 1));
		return () => connection.Disconnect();
	}, [visible]);

	const battleTiles = useMemo(() => {
		const battles = clientStateController.CaseBattles;
		const battlesFromThisServer = battles.filter(
			(battle) => battle.server_id === ReplicatedStorage.GetAttribute("server_id"),
		);
		const battlesFromOtherServers = battles.filter(
			(battle) => battle.server_id !== ReplicatedStorage.GetAttribute("server_id"),
		);

		const getBattleValue = (battle: CaseBattleData) => {
			return battle.cases.reduce((acc: number, caseId: string) => {
				const caseData = clientStateController.CaseBattleCases.find((c) => c.id === caseId);
				if (caseData) return acc + caseData.price;
				return acc;
			}, 0);
		};

		const sortBattles = (battleArray: CaseBattleData[]) => {
			return battleArray.sort((a, b) => {
				const valueA = getBattleValue(a);
				const valueB = getBattleValue(b);

				if (sortType === "value_highest") {
					return valueB > valueA;
				} else if (sortType === "value_lowest") {
					return valueA > valueB;
				}
				return false;
			});
		};

		const sortedBattlesFromThisServer = sortBattles([...battlesFromThisServer]);
		const sortedBattlesFromOtherServers = sortBattles([...battlesFromOtherServers]);

		const elements = [];
		let index = 0;
		if (sortedBattlesFromThisServer.size() > 0) {
			elements.push(
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: " Battles from this server",
						TextSize: px(18),
						Size: new UDim2(1, 0, 0, px(20)),
						TextColor3: palette.darkerText,
						LayoutOrder: 0,
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>,
			);
			index++;

			sortedBattlesFromThisServer.forEach((battle) => {
				elements.push(<BattleGridTile battleData={battle} layoutOrder={index} />);
				index++;
			});
		}

		if (sortedBattlesFromOtherServers.size() > 0) {
			elements.push(
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: "Battles from other servers",
						TextSize: px(18),
						Size: new UDim2(1, 0, 0, px(20)),
						TextColor3: palette.darkerText,
						LayoutOrder: index + 1,
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>,
			);
			index++;

			sortedBattlesFromOtherServers.forEach((battle) => {
				elements.push(<BattleGridTile battleData={battle} layoutOrder={index} />);
				index++;
			});
		}

		return elements;
	}, [updateCounter, sortType]);

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
					Text: CASE_BATTLES_MENU_TITLE,
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
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
				event={{ Activated: () => setCurrentPage("builder") }}
			/>
			<SortButton
				size={new UDim2(0, px(160), 0, px(32))}
				position={new UDim2(0, px(154), 0, px(65))}
				typeface="Sans"
				weight="SemiBold"
				setSortOrder={(sortType: string) => setSortType(sortType)}
				options={[
					["value_highest", "Highest Value", 0, "rbxassetid://89977107525633"],
					["value_lowest", "Lowest Value", 180, "rbxassetid://89977107525633"],
				]}
			/>
			<scrollingframe
				ScrollBarImageTransparency={1}
				ScrollBarThickness={0}
				AnchorPoint={new Vector2(0.5, 1)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 1, -26)}
				Size={UDim2.fromOffset(px(850), px(332))}
			>
				<uipadding PaddingLeft={new UDim(0, px(1))} PaddingTop={new UDim(0, px(11))} />
				<uilistlayout
					Padding={new UDim(0, px(10))}
					Wraps={true}
					FillDirection={Enum.FillDirection.Horizontal}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{battleTiles}
			</scrollingframe>
		</frame>
	);
});
