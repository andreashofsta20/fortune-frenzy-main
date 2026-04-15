import React, { useEffect, useState } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { MenuCore } from "../navigation/MenuCore";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { CloseButton } from "../core/CloseButton";
import { Corner } from "../tools/Corner";
import { TextLabel } from "../core/TextLabel";
import { MINIGAMES_TITLE } from "shared/util/strings";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { replacePlaceholder } from "shared/util/string-utils";
import { addCommasToNumber } from "shared/util/number-utils";
import { brighten } from "client/utils/color-utils";
import { activeMenuAtom, globalMinigameStatsRevisionAtom } from "client/utils/global-state";
import { handleCloseButton } from "client/utils/menu-utils";
import { SectionStroke } from "../tools/SectionStroke";
import {
	TUTORIAL_TARGET_IDS,
	advanceTutorialAction,
	isTutorialInteractionBlocked,
	registerTutorialTarget,
	unregisterTutorialTarget,
} from "client/tutorial/tutorial-state";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

const MINIGAMES = [
	{
		name: "Coinflip",
		image: "",
		menuImage: "rbxassetid://122507891160868",
		menuImageRotation: -17,
		menuImageSize: new UDim2(1, 0, 1, 0),
		menuImagePosition: new UDim2(0.05, 0, 0.5, 0),
		description: "You've completed {{count}} flips",
		countZeroDescription: "You've never played coinflip",
		internalKey: "Coinflip",
		menuName: "Coinflip",
	},
	{
		name: "Item Cases",
		image: "",
		menuImage: "rbxassetid://138622510320842",
		menuImageRotation: 0,
		menuImageSize: new UDim2(1, 0, 1, 0),
		menuImagePosition: new UDim2(0.05, 0, 0.5, 0),
		description: "You've opened {{count}} cases",
		countZeroDescription: "You've never opened a case",
		internalKey: "ItemCases",
		localKey: "Item Cases",
		menuName: "ItemCases",
	},
	{
		name: "Case Battles",
		image: "",
		menuImage: "rbxassetid://137498998440327",
		menuImageRotation: 0,
		menuImageSize: new UDim2(1.3, 0, 1.3, 0),
		menuImagePosition: new UDim2(0.04, 0, 0.5, 0),
		description: "You've joined {{count}} case battles",
		countZeroDescription: "You've never joined a case battle",
		internalKey: "CaseBattles",
		localKey: "Case Battles",
		menuName: "CaseBattles",
	},
	{
		name: "Jackpot",
		image: "",
		menuImage: "rbxassetid://91734184790134",
		menuImageRotation: -17,
		menuImageSize: new UDim2(1, 0, 1, 0),
		menuImagePosition: new UDim2(0.05, 0, 0.5, 0),
		description: "You've joined {{count}} jackpots",
		countZeroDescription: "You've never joined a jackpot",
		internalKey: "Jackpot",
		menuName: "Jackpot",
	},
];

function getGlobalStatByMinigame(
	globalStats: Map<
		string,
		{
			last_updated: number;
			current_ccu: number;
			total_spent: number;
			total_games_played: number;
			total_wins?: number;
			total_losses?: number;
		}
	>,
	minigame: (typeof MINIGAMES)[number],
) {
	return (
		globalStats.get(minigame.internalKey) ?? (minigame.localKey ? globalStats.get(minigame.localKey) : undefined)
	);
}

type MinigameRow = (typeof MINIGAMES)[number];

interface MinigameItemProps {
	minigame: MinigameRow;
	clientStateController: ClientStateController;
	px: (n: number) => number;
}

const MinigameItem = React.memo(({ minigame, clientStateController, px }: MinigameItemProps) => {
	useAtom(globalMinigameStatsRevisionAtom);
	const statKey = minigame.localKey ?? minigame.internalKey;
	const stat = clientStateController.LocalMinigameData[statKey] ?? { total_games_played: 0 };
	const globalStat = getGlobalStatByMinigame(clientStateController.GlobalMinigameData, minigame) ?? {
		current_ccu: 0,
	};
	const displayCcu = globalStat.current_ccu;
	const [buttonInstance, setButtonInstance] = useState<ImageButton | undefined>(undefined);

	const tutorialAction =
		minigame.internalKey === "ItemCases"
			? ("open_item_cases_menu" as const)
			: minigame.internalKey === "Coinflip"
				? ("open_coinflip_hub" as const)
				: undefined;
	const tutorialTargetId =
		minigame.internalKey === "ItemCases"
			? TUTORIAL_TARGET_IDS.minigamesItemCases
			: minigame.internalKey === "Coinflip"
				? TUTORIAL_TARGET_IDS.minigamesCoinflip
				: undefined;

	useEffect(() => {
		if (!tutorialTargetId || !buttonInstance) return;
		registerTutorialTarget(tutorialTargetId, buttonInstance);

		return () => {
			unregisterTutorialTarget(tutorialTargetId, buttonInstance);
		};
	}, [tutorialTargetId, buttonInstance]);

	return (
		<imagebutton
				ref={setButtonInstance}
				Image={minigame.image}
				Size={new UDim2(1, 0, 0, px(110))}
				ClipsDescendants={true}
				BackgroundTransparency={0}
				BackgroundColor3={palette.background2}
				Event={{
					Activated: () => {
						if (isTutorialInteractionBlocked(tutorialAction)) return;
						activeMenuAtom(minigame.menuName);
						if (tutorialAction) {
							advanceTutorialAction(tutorialAction);
						}
					},
				}}
				key={`minigamesMenuImageButton-${minigame.internalKey}`}
			>
				{minigame.internalKey === "CaseBattles" ? (
					<>
						<canvasgroup
							Size={new UDim2(0, px(132), 1, 0)}
							Position={new UDim2(0, 0, 0, 0)}
							BackgroundTransparency={1}
							ClipsDescendants={true}
							ZIndex={-1}
						>
							<imagelabel
								Image="rbxassetid://132649198062625"
								BackgroundTransparency={1}
								ImageTransparency={0}
								ImageColor3={Color3.fromRGB(255, 255, 255)}
								Size={new UDim2(1, 0, 1, 0)}
								Position={new UDim2(0.05, 0, 0.5, 0)}
								AnchorPoint={new Vector2(0, 0.5)}
								ZIndex={0}
							>
								<uiaspectratioconstraint AspectRatio={1} />
							</imagelabel>
						</canvasgroup>
						<canvasgroup
							Size={new UDim2(0, px(132), 1, 0)}
							Position={new UDim2(0.1, 0, 0, 0)}
							BackgroundTransparency={1}
							ClipsDescendants={true}
							ZIndex={-2}
						>
							<imagelabel
								Image="rbxassetid://107726293836738"
								BackgroundTransparency={1}
								ImageTransparency={0.35}
								ImageColor3={Color3.fromRGB(255, 255, 255)}
								Size={new UDim2(1, 0, 1, 0)}
								Position={new UDim2(0.05, 0, 0.5, 0)}
								AnchorPoint={new Vector2(0, 0.5)}
								ZIndex={0}
							>
								<uiaspectratioconstraint AspectRatio={1} />
							</imagelabel>
						</canvasgroup>
						<canvasgroup
							Size={new UDim2(0, px(132), 1, 0)}
							Position={new UDim2(0.2, 0, 0, 0)}
							BackgroundTransparency={1}
							ClipsDescendants={true}
							ZIndex={-3}
						>
							<imagelabel
								Image="rbxassetid://135561038387876"
								BackgroundTransparency={1}
								ImageTransparency={0.55}
								ImageColor3={Color3.fromRGB(255, 255, 255)}
								Size={new UDim2(1, 0, 1, 0)}
								Position={new UDim2(0.05, 0, 0.5, 0)}
								AnchorPoint={new Vector2(0, 0.5)}
								ZIndex={0}
							>
								<uiaspectratioconstraint AspectRatio={1} />
							</imagelabel>
						</canvasgroup>
					</>
				) : (
					<canvasgroup
						Size={new UDim2(0, px(132), 1, 0)}
						BackgroundTransparency={1}
						ClipsDescendants={true}
						ZIndex={0}
					>
						<imagelabel
							Image={minigame.menuImage}
							BackgroundTransparency={1}
							ImageTransparency={0}
							Rotation={minigame.menuImageRotation}
							Size={minigame.menuImageSize}
							Position={minigame.menuImagePosition}
							AnchorPoint={new Vector2(0, 0.5)}
							ZIndex={0}
						>
							<uiaspectratioconstraint AspectRatio={1} />
						</imagelabel>
					</canvasgroup>
				)}
				<Corner roundness="small" />
				<SectionStroke />
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: minigame.name,
						TextSize: px(22),
						Size: new UDim2(0, px(320), 0, px(22)),
						Position: new UDim2(1, px(-24), 0, px(15)),
						TextTransparency: 0.1,
						AnchorPoint: new Vector2(1, 0),
						TextXAlignment: Enum.TextXAlignment.Right,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						Text:
							stat.total_games_played > 0
								? replacePlaceholder(
										minigame.description,
										"{{count}}",
										addCommasToNumber(stat.total_games_played),
									)
								: minigame.countZeroDescription,
						TextSize: px(18),
						Size: new UDim2(0, px(320), 0, px(18)),
						Position: new UDim2(1, px(-24), 0, px(40)),
						TextTransparency: 0.2,
						AnchorPoint: new Vector2(1, 0),
						TextXAlignment: Enum.TextXAlignment.Right,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: `${addCommasToNumber(displayCcu)} players active`,
						TextSize: px(18),
						Size: new UDim2(0, px(320), 0, px(18)),
						Position: new UDim2(1, px(-24), 1, px(-15)),
						TextTransparency: 0.2,
						AnchorPoint: new Vector2(1, 1),
						TextXAlignment: Enum.TextXAlignment.Right,
						TextColor3: brighten(palette.profitGreen, 0.3),
					}}
				/>
			</imagebutton>
	);
});

function MinigamesMenuComponent({ visible, flashMenu: _flashMenu }: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();

	return (
		<MenuCore key="minigamesMenuCore">
			<frame
				AnchorPoint={new Vector2(0.5, 0.5)}
				Size={new UDim2(0, px(520), 0, px(470))}
				Position={new UDim2(0.5, 0, 0.5, 0)}
				BackgroundColor3={palette.background1}
				Visible={visible}
				key="minigamesMenuFrame"
			>
				<Corner roundness="small" />
				<CloseButton
					native={{
						Size: new UDim2(0, px(21), 0, px(21)),
						Position: new UDim2(1, px(-24), 0, px(24)),
						AnchorPoint: new Vector2(1, 0),
					}}
					event={{ Activated: handleCloseButton }}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: MINIGAMES_TITLE,
						TextSize: px(28),
						Size: new UDim2(0, px(320), 0, px(28)),
						Position: new UDim2(0, px(24), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<scrollingframe
					AnchorPoint={new Vector2(0.5, 1)}
					Position={new UDim2(0.5, 0, 1, px(-24))}
					Size={new UDim2(1, px(-48), 1, px(-90))}
					CanvasSize={new UDim2(0, 0, 0, 0)}
					AutomaticCanvasSize={Enum.AutomaticSize.Y}
					ScrollBarImageTransparency={1}
					ScrollBarThickness={0}
					ClipsDescendants={true}
					BackgroundTransparency={1}
					key="minigamesMenuScrollingFrame"
				>
					<uipadding
						PaddingLeft={new UDim(0, px(0.5))}
						PaddingRight={new UDim(0, px(3))}
						PaddingTop={new UDim(0, px(8))}
						PaddingBottom={new UDim(0, px(10))}
					/>
					<uilistlayout
						Padding={new UDim(0, px(10))}
						Wraps={true}
						FillDirection={Enum.FillDirection.Horizontal}
						HorizontalAlignment={Enum.HorizontalAlignment.Center}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					{MINIGAMES.map((minigame) => (
						<MinigameItem
							minigame={minigame}
							key={minigame.internalKey}
							clientStateController={clientStateController}
							px={px}
						/>
					))}
				</scrollingframe>
			</frame>
		</MenuCore>
	);
}

export const MinigamesMenu = React.memo(MinigamesMenuComponent);
