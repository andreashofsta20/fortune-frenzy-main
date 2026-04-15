import React, { memo, useCallback, useMemo, useState, useEffect } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { CASE_BATTLES_BATTLE_BUILDER_TITLE } from "shared/util/strings";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { SortButton } from "../core/SortButton";
import { Corner } from "../tools/Corner";
import { ButtonGroup } from "../core/ButtonGroup";
import { Button } from "../core/Button";
import { CaseCards } from "./CaseCards";
import { useBattleData } from "client/hooks/use-battle-builder-data";
import { CASES_LIMIT, parseCaseValue } from "../../utils/battle-builder-utils";
import { Functions } from "client/network";
import { isLoadingAtom } from "client/utils/global-state";
import { Players } from "@rbxts/services";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core";
import { requestServer } from "client/utils/send-function";

interface Props extends React.PropsWithChildren {
	visible: boolean;
	flashMenu: () => void;
	setCurrentPage: (page: "grid" | "builder" | "case-selector" | "viewing") => void;
}

export const BattleBuilder = memo(({ visible, flashMenu, setCurrentPage }: Props) => {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const {
		battleData,
		totalCost,
		totalCostValue,
		currentCasesCount,
		handleCaseChange,
		handleTeamModeChange,
		handleCrazyModeChange,
		handleGameModeChange,
		resetBattleData,
	} = useBattleData(setCurrentPage);

	const [playerCash, setPlayerCash] = useState<number>((Players.LocalPlayer?.GetAttribute("Cash") as number) ?? 0);

	useEffect(() => {
		const localPlayer = Players.LocalPlayer;
		if (!localPlayer) return;

		const updateCash = () => setPlayerCash((localPlayer.GetAttribute("Cash") as number) ?? 0);
		updateCash();

		const connection = localPlayer.GetAttributeChangedSignal("Cash").Connect(updateCash);
		return () => connection.Disconnect();
	}, []);

	const canAfford = useMemo(() => playerCash >= totalCostValue, [playerCash, totalCostValue]);

	const handleCloseClick = useCallback(() => {
		setCurrentPage("grid");
	}, [setCurrentPage]);

	const handleStartBattle = useCallback(async () => {
		const casesArray = new Array<string>();
		for (const [caseId, quantityIndexStr] of pairs(battleData.cases)) {
			const { quantity } = parseCaseValue(quantityIndexStr);
			for (let i = 0; i < quantity; i++) {
				casesArray.push(caseId);
			}
		}

		isLoadingAtom(true);
		const result = await requestServer(
			Functions.CaseBattles.CreateBattle,
			"Failed to create battle",
			casesArray,
			battleData.mode,
			battleData.crazy,
			battleData.fast_mode,
			battleData.team_mode,
		);
		if (result === -1) return isLoadingAtom(false);
		isLoadingAtom(false);

		if (result.status === "success") {
			setCurrentPage("grid");
			resetBattleData();
		} else {
			clientStateController.NotificationEvent.Fire(
				`<font color="#${palette.lossRed.ToHex()}">${result.message ?? "Failed to create battle"}; Code ${result.code}</font>`,
				"rbxassetid://134904801170653",
			);
		}
	}, [battleData]);

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
					Text: CASE_BATTLES_BATTLE_BUILDER_TITLE,
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
				event={{ Activated: handleCloseClick }}
			/>
			<SortButton
				size={new UDim2(0, px(130), 0, px(32))}
				position={new UDim2(0, px(24), 0, px(65))}
				typeface="Sans"
				weight="SemiBold"
				current={battleData.team_mode}
				options={[
					["1v1", "1v1", 0, "rbxassetid://97435883027463"],
					["1v1v1", "1v1v1", 0, "rbxassetid://97435883027463"],
					["1v1v1v1", "1v1v1v1", 0, "rbxassetid://97435883027463"],
					["2v2", "2v2", 0, "rbxassetid://97435883027463"],
				]}
				setSortOrder={handleTeamModeChange}
			/>
			<SortButton
				size={new UDim2(0, px(160), 0, px(32))}
				position={new UDim2(0, px(164), 0, px(65))}
				typeface="Sans"
				weight="SemiBold"
				current={battleData.crazy ? "crazy_on" : "crazy_off"}
				setSortOrder={handleCrazyModeChange}
				options={[
					["crazy_off", "Crazy Mode", 0, "rbxassetid://112654897702276", Color3.fromRGB(71, 41, 41)],
					["crazy_on", "Crazy Mode", 0, "rbxassetid://109795416106405", Color3.fromRGB(33, 71, 33)],
				]}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: `Select your cases (${currentCasesCount}/${CASES_LIMIT})`,
					TextSize: px(18),
					Size: new UDim2(0, px(320), 0, px(18)),
					Position: new UDim2(0, px(24), 0, px(104)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: palette.darkerText,
				}}
			/>
			<CaseCards cases={battleData.cases} setCurrentPage={setCurrentPage} handleCaseChange={handleCaseChange} />
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: "Select gamemode",
					TextSize: px(18),
					Size: new UDim2(0, px(166), 0, px(18)),
					Position: new UDim2(1, -px(24), 0, px(104)),
					AnchorPoint: new Vector2(1, 0),
					TextXAlignment: Enum.TextXAlignment.Center,
					TextColor3: palette.darkerText,
				}}
			/>
			<ButtonGroup
				typeface="Sans"
				weight="SemiBold"
				options={["Standard", "Randomized", "Showdown", "Group"]}
				setState={handleGameModeChange}
				state={battleData.mode}
				position={new UDim2(1, -px(24), 0, px(133))}
				anchorPoint={new Vector2(1, 0)}
				backgroundColor={palette.background1}
				direction="vertical"
				minimumVerticalWidth={px(142)}
			/>
			<TextLabel
				typeface="Sans"
				weight="Medium"
				native={{
					Text: totalCost,
					TextSize: px(18),
					Size: new UDim2(0, px(210), 0, px(18)),
					Position: new UDim2(1, -px(1), 1, -px(60)),
					AnchorPoint: new Vector2(1, 1),
					TextXAlignment: Enum.TextXAlignment.Center,
					TextColor3: palette.darkerText,
				}}
			/>
			<Button
				size={new UDim2(0, px(166), 0, px(32))}
				position={new UDim2(1, -px(20), 1, -px(20))}
				anchorPoint={new Vector2(1, 1)}
				backgroundColor={palette.blue}
				textColor={palette.blueText}
				text="Start Battle"
				typeface="Sans"
				weight="SemiBold"
				enabled={currentCasesCount > 0 && canAfford}
				event={{ Activated: handleStartBattle }}
			/>
		</frame>
	);
});
