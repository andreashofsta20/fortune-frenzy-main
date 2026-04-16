import React, { useEffect, useMemo, useState, useCallback } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Case } from "typings/APIResponses";
import { TextLabel } from "../core/TextLabel";
import {
	ITEM_CASES_CASE_MENU_CANT_AFFORD_DESC,
	ITEM_CASES_CASE_MENU_DESCRIPTION,
	ITEM_CASES_CASE_MENU_INFO_DIAMONDS_DESC,
	ITEM_CASES_CASE_MENU_INFO_DIAMONDS_TITLE,
	ITEM_CASES_CASE_MENU_INFO_OPENED_DESC,
	ITEM_CASES_CASE_MENU_INFO_OPENED_TITLE,
	ITEM_CASES_CASE_MENU_INFO_PRICE_DESC,
	ITEM_CASES_CASE_MENU_INFO_PRICE_TITLE,
	ITEM_CASES_CASE_MENU_INFO_WINCHANCE_DESC,
	ITEM_CASES_CASE_MENU_INFO_WINCHANCE_TITLE,
	ITEM_CASES_CASE_MENU_TITLE,
} from "shared/util/strings";
import { capitalizeFirstChar, replacePlaceholder } from "shared/util/string-utils";
import { CloseButton } from "../core/CloseButton";
import { ItemCard } from "./ItemCard";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { ItemPageSubBox } from "../marketplace/itemPage/InfoBox";
import { addCommasToNumber, formatWithSuffix, setDecimalPlaces } from "shared/util/number-utils";
import { Button } from "../core/Button";
import { Functions } from "client/network";
import { Corner } from "../tools/Corner";
import { isLoadingAtom, isNavigationVisibleAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";
import { TUTORIAL_TARGET_IDS, advanceTutorialAction } from "client/tutorial/tutorial-state";
import { resolveDisplayItemForCaseLine } from "client/utils/case-item-display";
import { prefetchMissingCaseItemRows } from "client/utils/prefetch-case-catalog-items";

interface Props {
	currentCase?: Case;
	setCurrentCase: React.Dispatch<React.SetStateAction<Case | undefined>>;
	visible: boolean;
	flashMenu: () => void;

	spinnerState: {
		status: "none" | "loading" | "spinning" | "done" | "ready";
		speed: number;
		winningItem?: string;
		winningIndex?: number;
		isLucky?: boolean;
	};
	setSpinnerState: React.Dispatch<
		React.SetStateAction<{
			status: "none" | "loading" | "spinning" | "done" | "ready";
			speed: number;
			winningItem?: string;
			winningIndex?: number;
			isLucky?: boolean;
		}>
	>;
}

export function CasePage({ currentCase, setCurrentCase, visible, spinnerState, setSpinnerState, flashMenu }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [previousCaseName, setPreviousCaseName] = useState<string | undefined>(undefined);
	const [catalogTick, setCatalogTick] = useState(0);

	useEffect(() => {
		const c = clientStateController.ItemInfoChangedEvent.Connect(() => setCatalogTick((n) => n + 1));
		return () => c.Disconnect();
	}, [clientStateController]);

	const [itemTiles, infoTiles, diamondsPrice] = useMemo(() => {
		if (!currentCase) return [[], [], -1];

		const itemTiles = currentCase.items
			.sort((a, b) => b.chance < a.chance)
			.map((item, index) => {
				const catalog = clientStateController.ItemInfo.get(item.id);
				const displayItem = resolveDisplayItemForCaseLine(item, catalog);
				return (
					<ItemCard
						data={{
							item: displayItem,
							chance: item.chance,
							claimed: item.claimed,
						}}
						layoutOrder={index}
					/>
				);
			});

		const infoTiles = [
			<ItemPageSubBox
				image="rbxassetid://133730286428245"
				color={palette.blue}
				title={ITEM_CASES_CASE_MENU_INFO_PRICE_TITLE}
				subtitle={replacePlaceholder(
					ITEM_CASES_CASE_MENU_INFO_PRICE_DESC,
					"{{price}}",
					addCommasToNumber(currentCase.price),
				)}
				size={new UDim2(0, px(192), 0, px(56))}
			/>,
			<ItemPageSubBox
				image="rbxassetid://77525717960367"
				color={palette.blue}
				title={ITEM_CASES_CASE_MENU_INFO_OPENED_TITLE}
				subtitle={replacePlaceholder(
					ITEM_CASES_CASE_MENU_INFO_OPENED_DESC,
					"{{count}}",
					addCommasToNumber(currentCase.opened_count),
				)}
				size={new UDim2(0, px(192), 0, px(56))}
			/>,
		];

		const diamondsPrice = currentCase.available_for_gems ? math.max(10, math.ceil(currentCase.price / 5000)) : -1;

		if (diamondsPrice > 0) {
			infoTiles.push(
				<ItemPageSubBox
					image="rbxassetid://124386301085688"
					color={palette.blue}
					title={ITEM_CASES_CASE_MENU_INFO_DIAMONDS_TITLE}
					subtitle={replacePlaceholder(
						ITEM_CASES_CASE_MENU_INFO_DIAMONDS_DESC,
						"{{price}}",
						addCommasToNumber(diamondsPrice),
					)}
					size={new UDim2(0, px(192), 0, px(56))}
				/>,
			);
		}
		return [itemTiles, infoTiles, diamondsPrice];
	}, [currentCase, catalogTick]);

	const handleOpenCase = useCallback(
		async (flag?: "lucky" | "robux") => {
			if (!currentCase) return;
			if (spinnerState.status !== "none") return;

			isNavigationVisibleAtom(false);
			flashMenu();
			setSpinnerState({ ...spinnerState, status: "loading" });

			isLoadingAtom(true);
			const result = flag
				? await requestServer(Functions.ItemCases.OpenCase, "Failed to open case", currentCase.id, flag)
				: await requestServer(Functions.ItemCases.OpenCase, "Failed to open case", currentCase.id);

			if (result === -1) {
				setSpinnerState({ ...spinnerState, status: "none" });
				isNavigationVisibleAtom(true);
				isLoadingAtom(false);
				return;
			}

			// Do not use PromptProductPurchaseFinished.Wait() here: that event fires when the
			// purchase UI closes, which is almost always *before* the server finishes
			// ProcessReceipt and returns. Wait() only listens for the next fire, so the client
			// would hang forever on loading after a successful Robux case open.

			isLoadingAtom(false);

			if (!result || result.status !== "success" || !result.message) {
				clientStateController.NotificationEvent.Fire(
					`<font color="#${palette.lossRed.ToHex()}">${result?.message ?? "Failed to open case"}; Code ${result?.code}</font>`,
					"rbxassetid://134904801170653",
				);
				setSpinnerState({ ...spinnerState, status: "none" });
				isNavigationVisibleAtom(true);
				return;
			}

			const [id, speed, isLucky] = result.message.split("|");
			setSpinnerState({
				...spinnerState,
				status: "ready",
				winningItem: id,
				winningIndex: undefined,
				speed: tonumber(speed) ?? 5,
				isLucky: isLucky === "true",
			});

			if (flag === undefined) {
				advanceTutorialAction("open_case");
			}
		},
		[currentCase, spinnerState],
	);

	const canAffordCash = currentCase ? (currentCase.price ?? 0) <= clientStateController.Cash : false;
	const robuxVisible = currentCase ? (tonumber(currentCase.dev_product) ?? 0) > 0 : false;
	const luckyVisible = currentCase
		? canAffordCash && diamondsPrice > 0 && clientStateController.Gems >= diamondsPrice
		: false;
	const cashVisible = canAffordCash;
	const cantAffordVisible = currentCase ? !canAffordCash : false;

	useEffect(() => {
		if (previousCaseName !== currentCase?.id) {
			flashMenu();
		}

		const caseChangeConnection = clientStateController.CaseChangedEvent.Connect((cases) => {
			if (!currentCase) return;
			setCurrentCase(cases.get(currentCase.id));
		});

		setPreviousCaseName(currentCase?.id);
		return () => caseChangeConnection.Disconnect();
	}, [currentCase]);

	useEffect(() => {
		if (!visible || !currentCase) return;
		prefetchMissingCaseItemRows(currentCase, clientStateController);
	}, [visible, currentCase, clientStateController]);

	return (
		<frame
			Size={new UDim2(0, px(900), 0, px(470))}
			Position={new UDim2(0.5, 0, 0.5, 0)}
			AnchorPoint={new Vector2(0.5, 0.5)}
			BackgroundColor3={palette.background1}
			Visible={visible}
		>
			<Corner roundness="small" />
			<CloseButton
				showUpscaleButton={false}
				native={{
				Size: new UDim2(0, px(21), 0, px(21)),
				Position: new UDim2(1, px(-24), 0, px(24)),
				AnchorPoint: new Vector2(1, 0),
			}}
				event={{
					Activated: () => {
						setCurrentCase(undefined);
					},
				}}
				image="rbxassetid://114306723191635"
			/>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: replacePlaceholder(
						ITEM_CASES_CASE_MENU_TITLE,
						"{{name}}",
						capitalizeFirstChar(currentCase?.id || ""),
					),
					TextSize: px(28),
					Size: new UDim2(0, px(320), 0, px(28)),
					Position: new UDim2(0, px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: ITEM_CASES_CASE_MENU_DESCRIPTION,
					TextSize: px(20),
					Size: new UDim2(0, px(400), 0, px(20)),
					Position: new UDim2(0, px(24), 0, px(55)),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextColor3: palette.midText,
				}}
			/>
			<frame
				BackgroundTransparency={1}
				Position={new UDim2(0, px(24), 0, px(90))}
				Size={new UDim2(0, px(650), 0, px(350))}
			>
				<uigridlayout
					CellSize={new UDim2(0, px(122), 0, px(170))}
					CellPadding={new UDim2(0, px(9), 0, px(10))}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{itemTiles}
			</frame>
			<frame
				BackgroundTransparency={1}
				Size={new UDim2(0, px(184), 0, px(350))}
				Position={new UDim2(0, px(783), 0, px(265))}
				AnchorPoint={new Vector2(0.5, 0.5)}
			>
				<uilistlayout
					Padding={new UDim(0, px(10))}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{infoTiles}
			</frame>
			<frame
				BackgroundTransparency={1}
				AutomaticSize={Enum.AutomaticSize.Y}
				Size={new UDim2(0, px(185), 0, 0)}
				Position={new UDim2(1, px(-117), 0, px(421))}
				AnchorPoint={new Vector2(0.5, 1)}
			>
				<uilistlayout
					Padding={new UDim(0, px(10))}
					FillDirection={Enum.FillDirection.Vertical}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				<Button
					size={new UDim2(0, px(185), 0, px(35))}
					position={new UDim2(0.5, 0, 0, 0)}
					anchorPoint={new Vector2(0.5, 0)}
					text="Robux Open"
					typeface="Sans"
					weight="Bold"
					image="rbxassetid://92236653596751"
					backgroundColor={palette.blue}
					textColor={palette.blueText}
					imageColor={palette.blueText}
					imageSize={20}
					imagePadding={px(5)}
					textSize={17}
					visible={robuxVisible}
					event={{ Activated: () => handleOpenCase("robux") }}
				/>
				<Button
					size={new UDim2(0, px(185), 0, px(35))}
					position={new UDim2(0.5, 0, 0, 0)}
					anchorPoint={new Vector2(0.5, 0)}
					text="Lucky Open"
					typeface="Sans"
					weight="Bold"
					image="rbxassetid://85509745365110"
					backgroundColor={palette.blue}
					textColor={palette.blueText}
					imageColor={palette.blueText}
					imageSize={20}
					imagePadding={px(5)}
					textSize={17}
					visible={luckyVisible}
					event={{ Activated: () => handleOpenCase("lucky") }}
				/>
				<Button
					size={new UDim2(0, px(185), 0, px(35))}
					position={new UDim2(0.5, 0, 0, 0)}
					anchorPoint={new Vector2(0.5, 0)}
					text="Open"
					typeface="Sans"
					weight="Bold"
					image="rbxassetid://92236653596751"
					backgroundColor={palette.blue}
					textColor={palette.blueText}
					imageColor={palette.blueText}
					imageSize={20}
					imagePadding={px(5)}
					textSize={17}
					visible={cashVisible}
					tutorialActionId="open_case"
					tutorialTargetId={TUTORIAL_TARGET_IDS.caseOpenButton}
					event={{ Activated: () => handleOpenCase(undefined) }}
				/>
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						Text: ITEM_CASES_CASE_MENU_CANT_AFFORD_DESC,
						TextSize: px(17),
						Size: new UDim2(0, px(175), 0, px(37)),
						TextXAlignment: Enum.TextXAlignment.Center,
						TextColor3: palette.darkerText,
						AnchorPoint: new Vector2(0.5, 0),
						Visible: cantAffordVisible,
					}}
				/>
			</frame>
		</frame>
	);
}
