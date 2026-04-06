import React, { useEffect, useMemo, useState } from "@rbxts/react";
import { palette } from "client/utils/palette";
import { usePx } from "client/hooks/use-px";
import { Corner } from "../tools/Corner";
import { JACKPOT_MENU_TITLE } from "shared/util/strings";
import { TextLabel } from "../core/TextLabel";
import { CloseButton } from "../core/CloseButton";
import { changeMenu } from "client/utils/menu-utils";
import { SortButton } from "../core/SortButton";
import { Button } from "../core/Button";
import { CaseBattleData, JackpotData } from "typings/APIResponses";
import { useMotion } from "client/hooks/use-motion";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { ReplicatedStorage, Players } from "@rbxts/services";
import { formatWithSuffix } from "shared/util/number-utils";
import { useCountdown } from "client/hooks/use-countdown";
import { JackpotCreatePopup } from "./JackpotCreatePopup";
import { LoadingCircle } from "../core/LoadingCircle";

interface Props {
	visible: boolean;
	setCurrentPage: (page: "grid" | "viewing") => void;
}

type JackpotSortType = "system" | "user" | "global";

interface TextPairProps {
	left: string;
	right: string;
	position: UDim2;
	highlight?: boolean;
}

function TextPair({ left, right, position, highlight = false }: TextPairProps) {
	const px = usePx();
	return (
		<>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: left,
					Position: position,
					Size: new UDim2(1, -px(30), 0, px(18)),
					AnchorPoint: new Vector2(0.5, 0),
					TextSize: px(18),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTransparency: 0.4,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: right,
					Position: position,
					Size: new UDim2(1, -px(30), 0, px(18)),
					AnchorPoint: new Vector2(0.5, 0),
					TextSize: px(18),
					TextXAlignment: Enum.TextXAlignment.Right,
					TextTransparency: highlight ? 0 : 0.4,
				}}
			>
				{highlight && (
					<uigradient
						Color={
							new ColorSequence([
								new ColorSequenceKeypoint(0, Color3.fromHex("#44ff33")),
								new ColorSequenceKeypoint(1, Color3.fromHex("#ffffff")),
							])
						}
						Rotation={-90}
					/>
				)}
			</TextLabel>
		</>
	);
}

const JackpotGridItem = React.memo(({ jackpot, layoutOrder }: { jackpot: JackpotData; layoutOrder: number }) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const [imageTransparency, imageTransparencyMotion] = useMotion(0.25);
	const [countdownString, countdownFinished] = useCountdown(
		jackpot.status === "waiting_for_start" && jackpot.auto_start_at
			? jackpot.auto_start_at
			: jackpot.status === "countdown"
				? jackpot.countdown_end_at
				: undefined,
	);

	return (
		<imagebutton
			Image={"rbxassetid://77732208983273"}
			BackgroundTransparency={1}
			ImageTransparency={imageTransparency}
			Size={new UDim2(0, px(204), 0, px(143))}
			LayoutOrder={layoutOrder}
			Event={{
				MouseEnter: () =>
					imageTransparencyMotion.tween(0, {
						time: 0.4,
						style: Enum.EasingStyle.Quint,
						direction: Enum.EasingDirection.Out,
					}),
				MouseLeave: () =>
					imageTransparencyMotion.tween(0.25, {
						time: 0.4,
						style: Enum.EasingStyle.Quint,
						direction: Enum.EasingDirection.Out,
					}),
				Activated: () => {
					clientStateController.JackpotSelectedEvent.Fire(jackpot.id);
				},
			}}
		>
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: jackpot.value_floor
						? `${formatWithSuffix(jackpot.value_floor, 2)} - ${jackpot.value_cap > 1000000000000 ? "∞" : formatWithSuffix(jackpot.value_cap, 2)} Cap`
						: `${jackpot.value_cap > 1000000000000 ? "∞" : formatWithSuffix(jackpot.value_cap, 2)} Cap`,
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, px(15)),
					Size: new UDim2(1, -px(30), 0, px(20)),
					TextSize: px(20),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTransparency: 0.4,
				}}
			/>
			<imagelabel
				Image={"rbxassetid://116554271698440"}
				AnchorPoint={new Vector2(0.5, 0)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0, px(43))}
				Size={new UDim2(1, -px(30), 0, px(2))}
				ScaleType={Enum.ScaleType.Crop}
			/>
			<TextPair
				left="Players:"
				right={`${jackpot.members.size()}/${jackpot.max_players ?? "64"}`}
				position={new UDim2(0.5, 0, 0, px(51))}
			/>
			<TextPair
				left="Value:"
				right={`${formatWithSuffix(
					jackpot.members.reduce((sum, member) => sum + member.total_value, 0),
					2,
				)}`}
				position={new UDim2(0.5, 0, 0, px(74))}
				highlight
			/>
			<imagelabel
				Image={"rbxassetid://116554271698440"}
				AnchorPoint={new Vector2(0.5, 0)}
				BackgroundTransparency={1}
				Position={new UDim2(0.5, 0, 0, px(100))}
				Size={new UDim2(1, -px(30), 0, px(2))}
				ScaleType={Enum.ScaleType.Crop}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: (() => {
						if (countdownFinished) return "";
						if (jackpot.status === "waiting_for_start" && jackpot.auto_start_at) {
							return `Starting in ${countdownString}`;
						} else if (jackpot.status === "waiting_for_start" && !jackpot.auto_start_at) {
							return "Waiting for players...";
						} else if (jackpot.status === "countdown") {
							return `Spinning in ${countdownString}`;
						} else if (jackpot.status === "complete") {
							return `@${jackpot.winning_data?.player.username} won!`;
						}
					})(),
					AnchorPoint: new Vector2(0.5, 1),
					Position: new UDim2(0.5, 0, 1, -px(15)),
					Size: new UDim2(1, -px(30), 0, px(18)),
					TextSize: px(18),
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTransparency: 0.4,
				}}
			/>
			<LoadingCircle
				AnchorPoint={new Vector2(0, 1)}
				Position={new UDim2(0, px(15), 1, -px(15))}
				Size={new UDim2(0, px(18), 0, px(18))}
				Visible={countdownFinished}
			/>
		</imagebutton>
	);
});

export function JackpotGrid({ visible, setCurrentPage }: Props) {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [sortType, setSortType] = useState<JackpotSortType>("system");
	const [updateCounter, setUpdateCounter] = useState(0);
	const [createPopupVisible, setCreatePopupVisible] = useState(false);
	const canCreatePlayerPot = sortType === "user";

	useEffect(() => {
		if (sortType !== "user") {
			setCreatePopupVisible(false);
		}
	}, [sortType]);

	useEffect(() => {
		if (!visible) return;

		setUpdateCounter((v) => v + 1);
		const jackpotConnection = clientStateController.JackpotChangedEvent.Connect(() => {
			setUpdateCounter((v) => v + 1);
		});

		return () => {
			jackpotConnection.Disconnect();
		};
	}, [visible]);

	const tiles = useMemo(() => {
		const jackpots = clientStateController.Jackpots;
		const getJackpotValue = (jp: JackpotData) => jp.members.reduce((sum, member) => sum + member.total_value, 0);
		const sortByValueDesc = (a: JackpotData, b: JackpotData) => getJackpotValue(b) < getJackpotValue(a);
		const isGlobalPot = (jp: JackpotData) => jp.server_id === "global";
		const currentServerId = ReplicatedStorage.GetAttribute("server_id");
		const isSystemPot = (jp: JackpotData) =>
			jp.is_system_pot === true && !isGlobalPot(jp) && jp.server_id === currentServerId;
		const isPlayerPot = (jp: JackpotData) => jp.is_system_pot !== true && !isGlobalPot(jp);
		const isFromCurrentServer = (jp: JackpotData) => jp.server_id === currentServerId;
		const validJackpots = jackpots.filter((jp) => {
			if (sortType === "system") return isSystemPot(jp);
			if (sortType === "global") return isGlobalPot(jp);
			return isPlayerPot(jp);
		});

		const elements: JSX.Element[] = [];
		const pushHeader = (text: string) =>
			elements.push(
				<TextLabel
					key={`header-${elements.size()}`}
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: text,
						TextSize: px(18),
						Size: new UDim2(1, 0, 0, px(20)),
						TextColor3: palette.darkerText,
						LayoutOrder: elements.size(),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>,
			);

		if (sortType === "system") {
			pushHeader("Server Jackpots");

			const localPlayerId = `${Players.LocalPlayer.UserId}`;
			const potsByCap = new Map<number, JackpotData[]>();
			validJackpots.forEach((jp) => {
				const arr = potsByCap.get(jp.value_cap) ?? [];
				arr.push(jp);
				potsByCap.set(jp.value_cap, arr);
			});

			const selectedPots: JackpotData[] = [];
			potsByCap.forEach((pots) => {
				const playerActivePot = pots.find(
					(p) => p.status !== "complete" && p.members.some((m) => m.player.id === localPlayerId),
				);
				if (playerActivePot) {
					selectedPots.push(playerActivePot);
				} else {
					const activePots = pots.filter((p) => p.status !== "complete");
					const pool = activePots.size() > 0 ? activePots : pots;
					const latestPot = pool.reduce(
						(latest, p) => (p.created_at > latest.created_at ? p : latest),
						pool[0],
					);
					selectedPots.push(latestPot);
				}
			});

			selectedPots
				.sort((a, b) => a.value_cap < b.value_cap)
				.forEach((jp) => {
					elements.push(<JackpotGridItem key={`jp-${jp.id}`} jackpot={jp} layoutOrder={elements.size()} />);
				});

			return elements;
		}

		if (sortType === "global") {
			pushHeader("Global Jackpots");

			const localPlayerId = `${Players.LocalPlayer.UserId}`;
			const potsByCap = new Map<number, JackpotData[]>();
			validJackpots.forEach((jp) => {
				const arr = potsByCap.get(jp.value_cap) ?? [];
				arr.push(jp);
				potsByCap.set(jp.value_cap, arr);
			});

			const selectedPots: JackpotData[] = [];
			potsByCap.forEach((pots) => {
				const playerActivePot = pots.find(
					(p) => p.status !== "complete" && p.members.some((m) => m.player.id === localPlayerId),
				);
				if (playerActivePot) {
					selectedPots.push(playerActivePot);
				} else {
					const activePots = pots.filter((p) => p.status !== "complete");
					const pool = activePots.size() > 0 ? activePots : pots;
					const latestPot = pool.reduce(
						(latest, p) => (p.created_at > latest.created_at ? p : latest),
						pool[0],
					);
					selectedPots.push(latestPot);
				}
			});

			selectedPots
				.sort((a, b) => a.value_cap < b.value_cap)
				.forEach((jp) => {
					elements.push(
						<JackpotGridItem key={`jp-global-${jp.id}`} jackpot={jp} layoutOrder={elements.size()} />,
					);
				});

			return elements;
		}

		const thisServerJackpots = validJackpots.filter(isFromCurrentServer).sort(sortByValueDesc);
		const otherServerJackpots = validJackpots.filter((jp) => !isFromCurrentServer(jp)).sort(sortByValueDesc);

		if (thisServerJackpots.size() > 0) {
			pushHeader("Jackpots from this server");
			thisServerJackpots.forEach((jp) => {
				elements.push(<JackpotGridItem key={`jp-this-${jp.id}`} jackpot={jp} layoutOrder={elements.size()} />);
			});
		}

		if (otherServerJackpots.size() > 0) {
			pushHeader("Jackpots from other servers");
			otherServerJackpots.forEach((jp) => {
				elements.push(<JackpotGridItem key={`jp-other-${jp.id}`} jackpot={jp} layoutOrder={elements.size()} />);
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
					Text: JACKPOT_MENU_TITLE,
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
				text={canCreatePlayerPot ? "Create" : "Locked"}
				typeface="Sans"
				weight="SemiBold"
				backgroundColor={canCreatePlayerPot ? palette.blue : palette.background3}
				textColor={canCreatePlayerPot ? palette.blueText : palette.darkerText}
				enabled={canCreatePlayerPot}
				event={{ Activated: () => canCreatePlayerPot && setCreatePopupVisible(true) }}
			/>
			<SortButton
				size={new UDim2(0, px(186), 0, px(32))}
				position={new UDim2(0, px(154), 0, px(65))}
				typeface="Sans"
				weight="SemiBold"
				setSortOrder={(order: string) => setSortType(order as JackpotSortType)}
				imageSize={18}
				imagePadding={7}
				options={[
					["system", "Server Pots", 0, "rbxassetid://134028228679571"],
					["user", "User Pots", 0, "rbxassetid://97435883027463"],
					["global", "Global Pots", 0, "rbxassetid://100503553886895"],
				]}
			/>
			<scrollingframe
				ScrollBarImageTransparency={1}
				ScrollBarThickness={0}
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, px(112))}
				Size={new UDim2(0, px(850), 0, px(332))}
			>
				<uilistlayout
					Padding={new UDim(0, px(10))}
					Wraps={true}
					FillDirection={Enum.FillDirection.Horizontal}
					SortOrder={Enum.SortOrder.LayoutOrder}
				/>
				{tiles}
			</scrollingframe>
			<JackpotCreatePopup visible={createPopupVisible} close={() => setCreatePopupVisible(false)} />
		</frame>
	);
}
