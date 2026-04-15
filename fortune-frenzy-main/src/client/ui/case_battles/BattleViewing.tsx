import React, { memo, useMemo, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core/out/modding";
import { CASE_BATTLES_VIEWING_TITLE } from "shared/util/strings";
import { replacePlaceholder } from "shared/util/string-utils";
import { TextLabel } from "../core/TextLabel";
import { Corner } from "../tools/Corner";
import { CloseButton } from "../core/CloseButton";
import { useStackedItems } from "client/hooks/use-stacked-items";
import { StackedItemCard } from "./StackedItemCard";
import { useCaseBattleSelection } from "client/hooks/use-case-battle-selection";
import { BattlePlayer } from "./BattlePlayer";
import { addCommasToNumber } from "shared/util/number-utils";
interface Props {
	visible: boolean;
	flashMenu: () => void;
	setCurrentPage: (page: "grid" | "builder" | "case-selector" | "viewing") => void;
}

export const BattleViewing = memo(({ visible, flashMenu, setCurrentPage }: Props) => {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const { currentBattle: currentBattleData, deselectBattle } = useCaseBattleSelection(() => {
		setCurrentPage("viewing");
	});

	const [viewingPlayerItems, setViewingPlayerItems] = useState<number>(1);

	const viewingData = useMemo(() => {
		if (!currentBattleData) return undefined;
		const player = currentBattleData.players.find((p) => p.position === viewingPlayerItems);
		if (!player) return undefined;
		const playerPulls = currentBattleData.player_pulls;
		const pullsForPlayer = playerPulls ? playerPulls[player.id] : undefined;

		return {
			player,
			items: pullsForPlayer?.items ?? [],
		};
	}, [currentBattleData, viewingPlayerItems]);

	const stackedItems = useStackedItems(
		viewingData?.items.filter((pull) => {
			if (!currentBattleData) return true;
			if (currentBattleData.status !== "in_progress") return true;
			// Only show pulls for rounds that have fully finished (not current or future cases).
			return pull.case_index < currentBattleData.current_spin_data.current_case_index;
		}),
		(pull) => {
			if (!currentBattleData) return `${pull.id}-${pull.case_index}`;
			const caseData = clientStateController.CaseBattleCases.find(
				(c) => c.id === currentBattleData.cases[pull.case_index],
			);
			const itemData = caseData?.items.find((i) => i.id === pull.id);
			return itemData?.asset_id ?? `${pull.id}-${pull.case_index}`;
		},
	);

	const teamSizes = useMemo(() => {
		if (!currentBattleData) return [] as number[];
		return currentBattleData.team_mode.split("v").map((str) => tonumber(str) || 0);
	}, [currentBattleData]);

	const totalPlayers = useMemo(() => teamSizes.reduce((sum, v) => sum + v, 0), [teamSizes]);

	const missingPlayers = useMemo(() => {
		if (!currentBattleData) return 0;
		return totalPlayers - currentBattleData.players.size();
	}, [totalPlayers, currentBattleData]);

	const subtitleText = useMemo(() => {
		if (!currentBattleData) return "";

		if (currentBattleData.status === "waiting_for_players") {
			return `Waiting for ${missingPlayers} more ${missingPlayers === 1 ? "player" : "players"}...`;
		}

		if (currentBattleData.status === "in_progress") {
			const currentCase = currentBattleData.current_spin_data.case_id;
			const caseData = clientStateController.CaseBattleCases.find((c) => c.id === currentCase);
			// progress is already "1/N" from the API — do not append /N again.
			const roundLabel = `Round ${currentBattleData.current_spin_data.progress}`;
			if (!caseData) return `${roundLabel}: Opening case...`;
			return `${roundLabel}: Opening ${caseData.name}...`;
		}

		if (currentBattleData.status === "completed") return "Completed!";

		return "";
	}, [currentBattleData, missingPlayers]);

	const modeText = useMemo(() => {
		if (!currentBattleData) return "";
		const parts: string[] = [currentBattleData.mode, currentBattleData.team_mode];
		if (currentBattleData.crazy) {
			parts.push('<font color="#f6a6ff">Crazy</font>');
		}
		if (currentBattleData.fast_mode) parts.push("Fast");
		return parts.join(" | ");
	}, [currentBattleData]);

	const winnerText = useMemo(() => {
		if (!currentBattleData || currentBattleData.status !== "completed") return "";
		const winners = currentBattleData.winners_info ?? [];
		if (winners.size() === 0) return "";

		if (winners.size() === 1) {
			const winnerData = winners[0];
			const winnerPlayer = currentBattleData.players.find((player) => player.id === winnerData.player_id);
			const winnerName = winnerPlayer?.username ?? winnerData.player_id;
			return `Winner: @${winnerName} (+$${addCommasToNumber(winnerData.amount_won)})`;
		}

		const winnerNames = winners.map((winner) => {
			const player = currentBattleData.players.find((candidate) => candidate.id === winner.player_id);
			return `@${player?.username ?? winner.player_id}`;
		});

		const splitAmount = winners[0]?.amount_won ?? 0;
		return `Winners: ${winnerNames.join(", ")} (+$${addCommasToNumber(splitAmount)} each)`;
	}, [currentBattleData]);

	const subtitleWidth = useMemo(() => {
		if (!currentBattleData) return px(630);
		if (currentBattleData.status === "completed" && winnerText !== "") return px(120);
		return px(630);
	}, [currentBattleData, winnerText, px]);

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
					Text: replacePlaceholder(
						CASE_BATTLES_VIEWING_TITLE,
						"{{name}}",
						currentBattleData?.players[0]?.username ?? "Unknown",
					),
					TextSize: px(28),
					Size: new UDim2(0, px(630), 0, px(28)),
					Position: new UDim2(0, currentBattleData ? px(90) : px(24), 0, px(21)),
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<CloseButton
				native={{
				Size: new UDim2(0, px(21), 0, px(21)),
				Position: new UDim2(1, px(-24), 0, px(24)),
				AnchorPoint: new Vector2(1, 0),
			}}
				event={{
					Activated: () => {
						setCurrentPage("grid");
						deselectBattle();
					},
				}}
			/>
			{!currentBattleData ? (
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: "Something went wrong",
						TextSize: px(20),
						Size: new UDim2(0, px(700), 0, px(20)),
						Position: new UDim2(0.5, 0, 0.5, 0),
						AnchorPoint: new Vector2(0.5, 0.5),
						TextColor3: palette.lossRed,
					}}
				/>
			) : (
				<>
					<imagelabel
						Image={
							clientStateController.CaseBattleCases.find(
								(c) => c.id === currentBattleData.current_spin_data.case_id,
							)?.image ??
							clientStateController.CaseBattleCases.find((c) => c.id === currentBattleData.cases[0])
								?.image
						}
						BackgroundTransparency={1}
						Size={new UDim2(0, px(70), 0, px(70))}
						Position={new UDim2(0, px(12), 0, px(12))}
					/>
					<TextLabel
						typeface="Sans"
						weight="SemiBold"
						native={{
							Text: subtitleText,
							TextSize: px(20),
							Size: new UDim2(0, subtitleWidth, 0, px(20)),
							Position: new UDim2(0, px(90), 0, px(55)),
							TextXAlignment: Enum.TextXAlignment.Left,
							TextColor3: palette.midText,
						}}
					/>
					{modeText !== "" && (
						<TextLabel
							typeface="Sans"
							weight="Medium"
							native={{
								Text: modeText,
								TextSize: px(18),
								Size: new UDim2(0, px(240), 0, px(18)),
								Position: new UDim2(1, -px(24), 0, px(55)),
								AnchorPoint: new Vector2(1, 0),
								TextXAlignment: Enum.TextXAlignment.Right,
								TextColor3: palette.primaryText,
								TextTransparency: 0.35,
								TextTruncate: Enum.TextTruncate.AtEnd,
								RichText: true,
							}}
						/>
					)}
					{winnerText !== "" && (
						<TextLabel
							typeface="Sans"
							weight="Bold"
							native={{
								Text: winnerText,
								TextSize: px(18),
								Size: new UDim2(0, px(640), 0, px(60)),
								Position: new UDim2(0.5, 0, 0, px(225)),
								AnchorPoint: new Vector2(0.5, 0),
								TextXAlignment: Enum.TextXAlignment.Center,
								TextYAlignment: Enum.TextYAlignment.Center,
								TextWrapped: true,
								TextTruncate: Enum.TextTruncate.None,
								ZIndex: 10,
							}}
						>
							<uigradient
								Color={
									new ColorSequence([
										new ColorSequenceKeypoint(0, Color3.fromHex("#44ff33")),
										new ColorSequenceKeypoint(1, Color3.fromHex("#ffffff")),
									])
								}
								Rotation={-90}
							/>
						</TextLabel>
					)}
					<frame
						AnchorPoint={new Vector2(0.5, 0.5)}
						BackgroundTransparency={1}
						Position={new UDim2(0.5, 0, 0.5, -px(30))}
						Size={new UDim2(1, -px(48), 0, px(239))}
					>
						<uilistlayout
							Padding={new UDim(0, px(12))}
							HorizontalFlex={Enum.UIFlexAlignment.Fill}
							SortOrder={Enum.SortOrder.LayoutOrder}
							FillDirection={Enum.FillDirection.Horizontal}
						/>
						{table.create(totalPlayers, 0).map((_, index: number) => {
							return (
								<BattlePlayer
									battleData={currentBattleData}
									playerPosition={index + 1}
									viewingPlayerItems={viewingPlayerItems}
									setViewingPlayerItems={setViewingPlayerItems}
								/>
							);
						})}
					</frame>
					<TextLabel
						typeface="Sans"
						weight="SemiBold"
						native={{
							Text: `${viewingData?.player?.username ?? "Unknown"}${(viewingData?.player?.username ?? "").sub(-1) === "s" ? "'" : "'s"} Items`,
							TextSize: px(20),
							Size: new UDim2(0, px(630), 0, px(20)),
							Position: new UDim2(0, px(24), 1, -px(135)),
							AnchorPoint: new Vector2(0, 1),
							TextXAlignment: Enum.TextXAlignment.Left,
							TextColor3: palette.midText,
						}}
					/>
					<frame
						AnchorPoint={new Vector2(0.5, 1)}
						BackgroundTransparency={1}
						Position={new UDim2(0.5, 0, 1, -px(24))}
						Size={new UDim2(1, -px(48), 0, px(102))}
					>
						<uilistlayout
							Padding={new UDim(0, px(5))}
							FillDirection={Enum.FillDirection.Horizontal}
							SortOrder={Enum.SortOrder.LayoutOrder}
						/>
						{stackedItems.map(({ item, quantity }) => {
							const caseData = clientStateController.CaseBattleCases.find(
								(c) => c.id === currentBattleData.cases[item.case_index],
							);
							const itemData = caseData?.items.find((i) => i.id === item.id);

							return (
								<StackedItemCard
									key={`${item.id}-${item.case_index}`}
									item={item}
									quantity={quantity}
									itemData={itemData}
									layoutOrder={item.case_index}
								/>
							);
						})}
					</frame>
					<frame
						BackgroundColor3={palette.background4}
						AnchorPoint={new Vector2(0.5, 1)}
						Position={new UDim2(0.5, 0, 1, -px(165))}
						Size={new UDim2(1, -px(50), 0, px(2))}
						BorderSizePixel={0}
					>
						<uigradient
							Transparency={
								new NumberSequence([
									new NumberSequenceKeypoint(0, 1),
									new NumberSequenceKeypoint(0.25, 0),
									new NumberSequenceKeypoint(0.5, 0),
									new NumberSequenceKeypoint(0.75, 0),
									new NumberSequenceKeypoint(1, 1),
								])
							}
						/>
					</frame>
				</>
			)}
		</frame>
	);
});
