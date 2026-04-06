import React, { useEffect, useRef, useCallback } from "@rbxts/react";
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
import { TweenService } from "@rbxts/services";
import { activeMenuAtom } from "client/utils/global-state";
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
		description: "You've completed {{count}} flips",
		countZeroDescription: "You've never played coinflip",
		internalKey: "Coinflip",
		menuName: "Coinflip",
	},
	{
		name: "Item Cases",
		image: "",
		description: "You've opened {{count}} cases",
		countZeroDescription: "You've never opened a case",
		internalKey: "ItemCases",
		localKey: "Item Cases",
		menuName: "ItemCases",
	},
	{
		name: "Case Battles",
		image: "",
		description: "You've joined {{count}} case battles",
		countZeroDescription: "You've never joined a case battle",
		internalKey: "CaseBattles",
		localKey: "Case Battles",
		menuName: "CaseBattles",
	},
	{
		name: "Jackpot",
		image: "",
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

function MinigamesMenuComponent({ visible, flashMenu }: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const animatingValuesRef = useRef(new Map<string, number>());
	const lastValuesRef = useRef(new Map<string, number>());

	useEffect(() => {
		MINIGAMES.forEach((minigame) => {
			lastValuesRef.current.set(
				minigame.internalKey,
				getGlobalStatByMinigame(clientStateController.GlobalMinigameData, minigame)?.current_ccu ?? 0,
			);
		});
	}, []);

	const updateAnimations = useCallback(() => {
		const newStats = new Map([...clientStateController.GlobalMinigameData]);
		MINIGAMES.forEach((minigame) => {
			const key = minigame.internalKey;
			const oldValue = lastValuesRef.current.get(key) ?? 0;
			const newValue = getGlobalStatByMinigame(newStats, minigame)?.current_ccu ?? 0;

			if (oldValue !== newValue) {
				const numberValue = new Instance("NumberValue");
				numberValue.Value = oldValue;
				lastValuesRef.current.set(key, newValue);

				const tween = TweenService.Create(
					numberValue,
					new TweenInfo(0.7, Enum.EasingStyle.Quart, Enum.EasingDirection.Out),
					{ Value: newValue },
				);

				numberValue.Changed.Connect(() => {
					animatingValuesRef.current.set(key, math.round(numberValue.Value));
				});

				tween.Completed.Connect(() => {
					animatingValuesRef.current.delete(key);
					numberValue.Destroy();
				});

				tween.Play();
			}
		});
	}, []);

	useEffect(() => {
		if (!visible) return;

		const connection = task.spawn(() => {
			// eslint-disable-next-line no-constant-condition
			while (true) {
				updateAnimations();
				task.wait(2);
			}
		});

		return () => {
			task.cancel(connection);
		};
	}, [visible, updateAnimations]);

	const MinigameItem = React.memo(({ minigame }: { minigame: (typeof MINIGAMES)[number] }) => {
		const statKey = minigame.localKey ?? minigame.internalKey;
		const stat = clientStateController.LocalMinigameData[statKey] ?? { total_games_played: 0 };
		const globalStat = getGlobalStatByMinigame(clientStateController.GlobalMinigameData, minigame) ?? {
			current_ccu: 0,
		};
		const displayCcu = animatingValuesRef.current.has(minigame.internalKey)
			? animatingValuesRef.current.get(minigame.internalKey)!
			: globalStat.current_ccu;
		const [buttonInstance, setButtonInstance] = React.useState<ImageButton | undefined>(undefined);

		const tutorialAction = minigame.internalKey === "ItemCases" ? ("open_item_cases_menu" as const) : undefined;
		const tutorialTargetId =
			minigame.internalKey === "ItemCases" ? TUTORIAL_TARGET_IDS.minigamesItemCases : undefined;

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
						<MinigameItem minigame={minigame} key={minigame.internalKey} />
					))}
				</scrollingframe>
			</frame>
		</MenuCore>
	);
}

export const MinigamesMenu = React.memo(MinigamesMenuComponent);
