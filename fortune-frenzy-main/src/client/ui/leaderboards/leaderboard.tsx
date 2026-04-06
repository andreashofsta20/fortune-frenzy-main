import React, { useCallback, useEffect, useMemo, useState } from "@rbxts/react";
import { HttpService, ReplicatedStorage } from "@rbxts/services";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { Corner } from "../tools/Corner";
import countries from "shared/util/countries";
import { formatWithSuffix } from "shared/util/number-utils";
import { capitalizeFirstChar } from "shared/util/string-utils";
import { changeMenu } from "client/utils/menu-utils";
import { currentSelectedPlayerAtom, newTradeStateAtom } from "client/utils/global-state";
import buttonClick from "client/utils/ui-effects/button-click";
import { useMotion } from "@rbxts/pretty-react-hooks";

export type LeaderboardType = "cash" | "value";

type LeaderboardEntry = [user_id: string, username: string, display_name: string, amount: string, country: string];

type LeaderboardsPayload = {
	cash: LeaderboardEntry[];
	value: LeaderboardEntry[];
};

interface Props {
	lb: LeaderboardType;
}

function PlayerCard({
	userId,
	username,
	displayName,
	amount,
	index,
	country,
	onActivated,
}: {
	userId: string;
	username: string;
	displayName: string;
	amount: string;
	index: number;
	country: string;
	onActivated: (userId: string) => void;
}) {
	const px = usePx();
	const [frameStrokeColor, frameStrokeColorMotion] = useMotion(Color3.fromRGB(38, 39, 49));

	const backgroundColor = Color3.fromRGB(28, 29, 39);
	let rankColor = palette.darkerText;

	if (index === 0) rankColor = Color3.fromRGB(255, 206, 72);
	else if (index === 1) rankColor = Color3.fromRGB(172, 182, 199);
	else if (index === 2) rankColor = Color3.fromRGB(233, 145, 99);

	const parsedUserId = tonumber(userId) ?? 0;

	const countryData = countries[(country as keyof typeof countries) || "US"];
	const countryEmoji = countryData ? countryData[1] : countries.US[1];

	return (
		<imagebutton
			BackgroundColor3={backgroundColor}
			BorderSizePixel={0}
			Size={new UDim2(1, 0, 0, 74)}
			LayoutOrder={index}
			AutoButtonColor={false}
			Event={{
				MouseEnter: () => {
					frameStrokeColorMotion.tween(Color3.fromRGB(61, 62, 74), {
						time: 0.3,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.Out,
					});
				},
				MouseLeave: () => {
					frameStrokeColorMotion.tween(Color3.fromRGB(38, 39, 49), {
						time: 0.3,
						style: Enum.EasingStyle.Exponential,
						direction: Enum.EasingDirection.Out,
					});
				},
				Activated: () => {
					buttonClick();
					onActivated(userId);
				},
			}}
		>
			<Corner roundness="small" />
			<uistroke Color={frameStrokeColor} Thickness={px(1)} />
			<TextLabel
				weight="Bold"
				typeface="Sans"
				native={{
					AnchorPoint: new Vector2(0, 0.5),
					Position: new UDim2(0, 10, 0.5, 0),
					Size: new UDim2(0, 20, 0, 20),
					Text: `${index + 1}`,
					TextSize: 17,
					TextColor3: rankColor,
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>
			<imagelabel
				Image={`rbxthumb://type=AvatarHeadShot&id=${parsedUserId}&w=150&h=150`}
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0, 0.5)}
				Position={new UDim2(0, 30, 0.5, 0)}
				Size={new UDim2(0, 42, 0, 42)}
			>
				<Corner roundness="full" />
				<uistroke Color={frameStrokeColor} Thickness={px(1)} />
			</imagelabel>
			<TextLabel
				weight="Bold"
				typeface="Sans"
				native={{
					AnchorPoint: new Vector2(0, 0.5),
					Position: new UDim2(0, 82, 0.5, -10),
					Size: new UDim2(0.55, -10, 0, 19),
					Text: displayName,
					TextSize: 18,
					TextColor3: palette.primaryText,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.AtEnd,
				}}
			/>
			<TextLabel
				weight="SemiBold"
				typeface="Sans"
				native={{
					AnchorPoint: new Vector2(0, 0.5),
					Position: new UDim2(0, 82, 0.5, 11),
					Size: new UDim2(0.55, -10, 0, 16),
					Text: `${countryEmoji} @${username}`,
					TextSize: 15,
					TextColor3: palette.darkerText,
					TextXAlignment: Enum.TextXAlignment.Left,
					TextTruncate: Enum.TextTruncate.AtEnd,
				}}
			/>
			<TextLabel
				weight="Bold"
				typeface="Sans"
				native={{
					AnchorPoint: new Vector2(1, 0.5),
					Position: new UDim2(1, -16, 0.5, 0),
					Size: new UDim2(0.32, 0, 0, 22),
					Text: formatWithSuffix(tonumber(amount) ?? 0, 2),
					TextSize: 18,
					TextColor3: palette.primaryText,
					TextXAlignment: Enum.TextXAlignment.Right,
				}}
			/>
		</imagebutton>
	);
}

export function Leaderboard({ lb }: Props) {
	const px = usePx();
	const [users, setUsers] = useState<LeaderboardEntry[]>([]);
	const [isRefreshing, setIsRefreshing] = useState(false);

	const openLeaderboardProfile = useCallback((userId: string) => {
		if ((tonumber(userId) ?? 0) <= 0) return;

		newTradeStateAtom({
			selectedPlayerInventory: undefined,
			currentlySelectingFor: "none",
			localSelection: {},
			otherSelection: {},
			otherPlayerInfo: { userId: "", username: "", display_name: "" },
		});
		currentSelectedPlayerAtom(userId);
		changeMenu("Profiles");
	}, []);

	const fetchLeaderboard = useCallback(() => {
		setIsRefreshing(true);

		const encodedLeaderboards = ReplicatedStorage.GetAttribute("Leaderboards");
		if (!typeIs(encodedLeaderboards, "string") || encodedLeaderboards.size() === 0) {
			setUsers([]);
			setIsRefreshing(false);
			return;
		}

		const [decodedSuccess, decodedPayload] = pcall(() => HttpService.JSONDecode(encodedLeaderboards)) as LuaTuple<
			[boolean, unknown]
		>;

		if (!decodedSuccess || !typeIs(decodedPayload, "table")) {
			setUsers([]);
			setIsRefreshing(false);
			return;
		}

		const payload = decodedPayload as Partial<LeaderboardsPayload>;
		const leaderboardEntries = payload[lb];
		const sortedUsers = (typeIs(leaderboardEntries, "table") ? [...leaderboardEntries] : []).sort((a, b) => {
			const aValue = tonumber(a[3]) ?? 0;
			const bValue = tonumber(b[3]) ?? 0;

			if (aValue === bValue) return (a[2] ?? "") > (b[2] ?? "");
			return bValue < aValue;
		});

		setUsers(sortedUsers);
		setIsRefreshing(false);
	}, [lb]);

	useEffect(() => {
		fetchLeaderboard();
		const connection = ReplicatedStorage.GetAttributeChangedSignal("Leaderboards").Connect(fetchLeaderboard);
		return () => connection.Disconnect();
	}, [fetchLeaderboard]);

	const playerCards = useMemo(
		() =>
			users.map((user, index) => (
				<PlayerCard
					key={`${user[0]}_${index}`}
					userId={user[0]}
					username={user[1]}
					displayName={user[2]}
					amount={user[3]}
					index={index}
					country={user[4]}
					onActivated={openLeaderboardProfile}
				/>
			)),
		[users, openLeaderboardProfile],
	);

	return (
		<frame BackgroundColor3={palette.background2} Size={new UDim2(1, 0, 1, 0)}>
			<Corner roundness="small" />
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Position: new UDim2(0, px(16), 0, px(14)),
					Size: new UDim2(0.6, 0, 0, px(20)),
					TextSize: px(16),
					Text: `${capitalizeFirstChar(lb)} rankings`,
					TextColor3: palette.darkerText,
					TextXAlignment: Enum.TextXAlignment.Left,
				}}
			/>

			<scrollingframe
				BackgroundTransparency={1}
				AnchorPoint={new Vector2(0.5, 0)}
				Position={new UDim2(0.5, 0, 0, px(44))}
				Size={new UDim2(1, -px(26), 1, -px(58))}
				AutomaticCanvasSize={Enum.AutomaticSize.Y}
				CanvasSize={new UDim2(0, 0, 0, 0)}
				ScrollBarImageTransparency={1}
				ScrollBarThickness={0}
			>
				<uipadding
					PaddingLeft={new UDim(0, px(6))}
					PaddingRight={new UDim(0, px(6))}
					PaddingTop={new UDim(0, px(6))}
				/>
				<uilistlayout Padding={new UDim(0, px(8))} SortOrder={Enum.SortOrder.LayoutOrder} />
				{playerCards}
			</scrollingframe>

			<frame
				BackgroundTransparency={1}
				Size={new UDim2(1, 0, 1, 0)}
				Visible={users.size() === 0 && !isRefreshing}
			>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						AnchorPoint: new Vector2(0.5, 0.5),
						Position: new UDim2(0.5, 0, 0.5, 0),
						Size: new UDim2(0, px(300), 0, px(30)),
						Text: "No leaderboard data yet",
						TextSize: px(22),
						TextColor3: palette.darkerText,
					}}
				/>
			</frame>
		</frame>
	);
}
