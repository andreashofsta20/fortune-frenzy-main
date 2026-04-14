import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { usePx } from "client/hooks/use-px";
import { ITEM_CASES_MENU_TITLE, ITEM_CASES_ROTATION_DESCRIPTION, ITEM_CASES_ROTATION_TITLE } from "shared/util/strings";
import { palette } from "client/utils/palette";
import { setInterval } from "@rbxts/set-timeout";
import { getColorBasedOnTime, timeUntil } from "shared/util/string-utils";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core";
import { CaseButton } from "./CaseButton";
import { Case } from "typings/APIResponses";
import { Corner } from "../tools/Corner";
import { changeMenu } from "client/utils/menu-utils";
import { useCountdown } from "client/hooks/use-countdown";
import { TUTORIAL_TARGET_IDS } from "client/tutorial/tutorial-state";

interface Props {
	visible: boolean;
	currentCase: Case | undefined;
	setCurrentCase: React.Dispatch<React.SetStateAction<Case | undefined>>;
}

export function CaseSelectorPage({ visible, currentCase, setCurrentCase }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [nextRotationText, setNextRotationText] = useState("Loading...");
	const [currentCasesArray, setCurrentCasesArray] = useState<Case[]>([]);
	const [hoverCountdown, setHoverCountdown] = useState(false);

	// Retrieve the next rotation ISO string once per render
	const nextRotationIso = clientStateController.Cases.get("starter")?.next_rotation;

	// Convert ISO string to epoch milliseconds for useCountdown
	const countdownTarget = useMemo(() => {
		if (nextRotationIso) {
			const dt = DateTime.fromIsoDate(nextRotationIso);
			return dt ? dt.UnixTimestamp * 1000 : undefined;
		}
		return undefined;
	}, [nextRotationIso]);

	// Live countdown text (updates every frame)
	const [countdownDisplay] = useCountdown(countdownTarget);

	const liveCountdownText = useMemo(() => {
		if (!nextRotationIso) return "";
		return ITEM_CASES_ROTATION_TITLE.gsub("{{countdown}}", countdownDisplay)[0].gsub(
			"{{color}}",
			`#${getColorBasedOnTime(nextRotationIso).ToHex()}`,
		)[0];
	}, [countdownDisplay, nextRotationIso]);

	const displayText = hoverCountdown ? liveCountdownText : nextRotationText;

	const caseTiles = useMemo(() => {
		const tiles: JSX.Element[] = [];
		currentCasesArray.forEach((value, index) => {
			const tier_number = tonumber(value.id.split("_")[1]) ?? 0;
			const isPrimaryTutorialCase = index === 0;
			tiles.push(
				<CaseButton
					caseData={value}
					LayoutOrder={tier_number}
					tutorialActionId={isPrimaryTutorialCase ? "select_case" : undefined}
					tutorialTargetId={isPrimaryTutorialCase ? TUTORIAL_TARGET_IDS.caseSelectorPrimary : undefined}
					Activated={() => {
						if (!currentCase) setCurrentCase(value);
					}}
				/>,
			);
		});

		return tiles;
	}, [currentCasesArray]);

	useEffect(() => {
		const cleanup = setInterval(() => {
			const nextRotation = clientStateController.Cases.get("starter")?.next_rotation;
			if (nextRotation) {
				setNextRotationText(
					ITEM_CASES_ROTATION_TITLE.gsub("{{countdown}}", timeUntil(nextRotation))[0].gsub(
						"{{color}}",
						`#${getColorBasedOnTime(nextRotation).ToHex()}`,
					)[0],
				);
			}
		}, 0.5);

		const casesArray: Case[] = [];
		for (const [_, value] of clientStateController.Cases) casesArray.push(value);
		casesArray.sort((a, b) => a.price < b.price);

		setCurrentCasesArray(casesArray);

		const caseChangeConnection = clientStateController.CaseChangedEvent.Connect((cases) => {
			const casesArray: Case[] = [];
			for (const [_, value] of cases) casesArray.push(value);
			casesArray.sort((a, b) => a.price < b.price);

			setCurrentCasesArray(casesArray);
		});

		return () => {
			cleanup();
			caseChangeConnection.Disconnect();
		};
	}, [visible]);

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
					Text: ITEM_CASES_MENU_TITLE,
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				showUpscaleButton={false}
				native={{ Size: new UDim2(0, px(21), 0, px(21)), Position: new UDim2(0, px(855), 0, px(24)) }}
				event={{
					Activated: () => changeMenu("Minigames"),
				}}
			/>
			<frame
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0, px(124))}
				Size={new UDim2(0, px(850), 0, px(290))}
				AnchorPoint={new Vector2(0.5, 0)}
				ClipsDescendants={false}
			>
				<uigridlayout
					CellPadding={UDim2.fromOffset(px(10), px(10))}
					CellSize={UDim2.fromOffset(px(162), px(147))}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{caseTiles}
			</frame>
			<TextLabel
				weight="SemiBold"
				typeface="Sans"
				native={{
					Text: displayText,
					TextSize: px(20),
					Size: new UDim2(0, px(840), 0, px(20)),
					Position: new UDim2(0, px(24), 0, px(55)),
					RichText: true,
					TextColor3: palette.primaryText,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextYAlignment: Enum.TextYAlignment.Top,
				}}
				event={{
					MouseEnter: () => setHoverCountdown(true),
					MouseLeave: () => setHoverCountdown(false),
				}}
			/>
			<TextLabel
				weight="Medium"
				typeface="Sans"
				native={{
					Text: ITEM_CASES_ROTATION_DESCRIPTION,
					TextSize: px(14),
					Size: new UDim2(0, px(840), 0, px(34)),
					Position: new UDim2(0, px(24), 0, px(80)),
					TextColor3: palette.midText,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextYAlignment: Enum.TextYAlignment.Top,
				}}
			/>
		</frame>
	);
}
