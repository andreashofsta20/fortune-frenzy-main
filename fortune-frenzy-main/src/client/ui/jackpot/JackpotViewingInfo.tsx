import React, { useEffect, useState, useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { Corner } from "../tools/Corner";
import { SectionStroke } from "../tools/SectionStroke";
import { JackpotData } from "typings/APIResponses";
import { JackpotSlice, PlayerSliceRotationRange } from "client/hooks/use-jackpot-wheel";
import { TextLabel } from "../core/TextLabel";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { Button } from "../core/Button";
import { FONTS } from "shared/util/strings";
import Ripple from "@rbxts/ripple";
import { addCommasToNumber, formatWithSuffix, setDecimalPlaces } from "shared/util/number-utils";
import { Players } from "@rbxts/services";
import { renderItem } from "../coinflip/CoinflipViewing";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";

interface Props {
	jackpot: JackpotData;
	playerSliceInfo: PlayerSliceRotationRange[];
}

export function JackpotViewingInfo({ jackpot, playerSliceInfo }: Props) {
	const px = usePx();
	const [tab, setTab] = useState<"info" | "members" | "items">("members");
	const [membersButtonTransparency, membersButtonTransparencyMotion] = useMotion(0);
	const [infoButtonTransparency, infoButtonTransparencyMotion] = useMotion(0.5);
	const [itemsButtonTransparency, itemsButtonTransparencyMotion] = useMotion(0.5);
	const [membersPagePosition, membersPagePositionMotion] = useMotion(new UDim2(0, 0, 0, 0));
	const [infoPagePosition, infoPagePositionMotion] = useMotion(new UDim2(1, 0, 0, 0));
	const [itemsPagePosition, itemsPagePositionMotion] = useMotion(new UDim2(2, 0, 0, 0));

	const totalPotValue = jackpot.members.reduce((sum, member) => sum + member.total_value, 0);
	const myStake =
		jackpot.members.find((member) => member.player.id === `${Players.LocalPlayer.UserId}`)?.total_value ?? 0;
	const myOdds = totalPotValue > 0 ? setDecimalPlaces((myStake / totalPotValue) * 100, 2) : 0;

	// Prepare a flattened and value-sorted list of all items in the pot (highest value first)
	const sortedItems = useMemo(() => {
		const csc = Modding.resolveSingleton(ClientStateController);
		const itemInfo = csc.ItemInfo;
		const inventory = csc.Inventory;
		const combined: { item: string; owner: string; value: number }[] = [];

		const resolveItemId = (stakeToken: string) => {
			const parts = stakeToken.split(":");
			if (parts.size() >= 2) return parts[1];
			for (const [itemId, uaids] of inventory) {
				if (uaids.includes(stakeToken)) return itemId;
			}
			return undefined;
		};

		jackpot.members.forEach((member) => {
			member.items.forEach((item) => {
				const itemId = resolveItemId(item);
				const value = itemId !== undefined ? (itemInfo.get(itemId)?.value ?? 0) : 0;
				combined.push({ item, owner: member.player.username, value });
			});
		});
		combined.sort((a, b) => b.value < a.value);
		return combined;
	}, [jackpot]);

	useEffect(() => {
		const tweenOptions: Ripple.TweenOptions = {
			time: 0.2,
			style: Enum.EasingStyle.Quint,
			direction: Enum.EasingDirection.Out,
		};

		if (tab === "members") {
			membersButtonTransparencyMotion.tween(0, tweenOptions);
			infoButtonTransparencyMotion.tween(0.5, tweenOptions);
			itemsButtonTransparencyMotion.tween(0.5, tweenOptions);
			membersPagePositionMotion.tween(new UDim2(0, 0, 0, 0), tweenOptions);
			infoPagePositionMotion.tween(new UDim2(1, 0, 0, 0), tweenOptions);
			itemsPagePositionMotion.tween(new UDim2(2, 0, 0, 0), tweenOptions);
		} else if (tab === "info") {
			membersButtonTransparencyMotion.tween(0.5, tweenOptions);
			infoButtonTransparencyMotion.tween(0, tweenOptions);
			itemsButtonTransparencyMotion.tween(0.5, tweenOptions);
			membersPagePositionMotion.tween(new UDim2(-1, 0, 0, 0), tweenOptions);
			infoPagePositionMotion.tween(new UDim2(0, 0, 0, 0), tweenOptions);
			itemsPagePositionMotion.tween(new UDim2(1, 0, 0, 0), tweenOptions);
		} else {
			membersButtonTransparencyMotion.tween(0.5, tweenOptions);
			infoButtonTransparencyMotion.tween(0.5, tweenOptions);
			itemsButtonTransparencyMotion.tween(0, tweenOptions);
			membersPagePositionMotion.tween(new UDim2(-2, 0, 0, 0), tweenOptions);
			infoPagePositionMotion.tween(new UDim2(-1, 0, 0, 0), tweenOptions);
			itemsPagePositionMotion.tween(new UDim2(0, 0, 0, 0), tweenOptions);
		}
	}, [tab]);

	return (
		<frame
			BackgroundColor3={palette.background2}
			AnchorPoint={new Vector2(1, 1)}
			Position={new UDim2(1, -px(34), 1, -px(34))}
			Size={new UDim2(0, px(411), 0, px(376))}
		>
			<Corner roundness="small" />
			<SectionStroke />
			<frame
				BackgroundColor3={palette.stroke}
				Position={new UDim2(0, 0, 0, px(55))}
				Size={new UDim2(1, 0, 0, px(1))}
				BorderSizePixel={0}
			/>
			<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(55))}>
				<uilistlayout
					HorizontalFlex={Enum.UIFlexAlignment.Fill}
					FillDirection={Enum.FillDirection.Horizontal}
					HorizontalAlignment={Enum.HorizontalAlignment.Center}
					SortOrder={Enum.SortOrder.LayoutOrder}
					VerticalAlignment={Enum.VerticalAlignment.Center}
				/>
				<textbutton
					FontFace={new Font(FONTS.Sans, Enum.FontWeight.Bold, Enum.FontStyle.Normal)}
					Text="Members"
					TextColor3={palette.midText}
					TextSize={px(23)}
					Size={new UDim2(0, px(28), 1, 0)}
					TextTransparency={membersButtonTransparency}
					BackgroundTransparency={1}
					Event={{ Activated: () => setTab("members") }}
				>
					<frame
						AnchorPoint={new Vector2(1, 0)}
						BackgroundColor3={palette.stroke}
						BorderSizePixel={0}
						Position={new UDim2(1, 0, 0, 0)}
						Size={new UDim2(0, px(1), 1, 0)}
					/>
				</textbutton>
				<textbutton
					FontFace={new Font(FONTS.Sans, Enum.FontWeight.Bold, Enum.FontStyle.Normal)}
					Text="Info"
					TextColor3={palette.midText}
					TextSize={px(23)}
					Size={new UDim2(0, px(28), 1, 0)}
					TextTransparency={infoButtonTransparency}
					BackgroundTransparency={1}
					Event={{ Activated: () => setTab("info") }}
				>
					<frame
						AnchorPoint={new Vector2(1, 0)}
						BackgroundColor3={palette.stroke}
						BorderSizePixel={0}
						Position={new UDim2(1, 0, 0, 0)}
						Size={new UDim2(0, px(1), 1, 0)}
					/>
				</textbutton>
				<textbutton
					FontFace={new Font(FONTS.Sans, Enum.FontWeight.Bold, Enum.FontStyle.Normal)}
					Text="Items"
					TextColor3={palette.midText}
					TextSize={px(23)}
					Size={new UDim2(0, px(28), 1, 0)}
					TextTransparency={itemsButtonTransparency}
					BackgroundTransparency={1}
					Event={{ Activated: () => setTab("items") }}
				/>
			</frame>
			<frame
				BackgroundTransparency={1}
				Position={new UDim2(0, 0, 0, px(55))}
				Size={new UDim2(1, 0, 1, -px(55))}
				ClipsDescendants={true}
			>
				<frame // members
					BackgroundTransparency={1}
					Position={membersPagePosition}
					Size={new UDim2(1, 0, 1, 0)}
				>
					{jackpot.members.size() === 0 ? (
						<>
							<imagelabel
								BackgroundTransparency={1}
								Size={new UDim2(0, px(128), 0, px(128))}
								Image="rbxassetid://123361866154149"
								AnchorPoint={new Vector2(0.5, 0)}
								Position={new UDim2(0.5, 0, 0, px(30))}
							/>
							<TextLabel
								typeface="Sans"
								weight="Bold"
								native={{
									Text: "*blob blob*",
									TextSize: px(23),
									Size: new UDim2(1, 0, 0, px(23)),
									Position: new UDim2(0.5, 0, 0, px(158)),
									AnchorPoint: new Vector2(0.5, 0),
									TextColor3: palette.primaryText,
								}}
							/>
							<TextLabel
								typeface="Sans"
								weight="Bold"
								native={{
									Text: "No one has joined this Jackpot yet, so here's clownfish for now.",
									TextSize: px(20),
									Size: new UDim2(1, 0, 0, px(40)),
									Position: new UDim2(0.5, 0, 0, px(186)),
									AnchorPoint: new Vector2(0.5, 0),
									TextColor3: palette.midText,
								}}
							/>
						</>
					) : (
						<>
							<uilistlayout SortOrder={Enum.SortOrder.LayoutOrder} />
							<uipadding PaddingBottom={new UDim(0, px(5))} PaddingTop={new UDim(0, px(5))} />
							<>
								{jackpot.members
									.sort((a, b) => b.total_value < a.total_value)
									.map((member) => {
										const slice = playerSliceInfo.find(
											(slice) => slice.playerId === member.player.id,
										);
										if (!slice) return undefined;
										const percentage =
											(member.total_value /
												jackpot.members.reduce((sum, member) => sum + member.total_value, 0)) *
											100;

										return (
											<frame Size={new UDim2(1, 0, 0, px(44))} BackgroundTransparency={1}>
												<imagelabel
													BackgroundColor3={slice.colour}
													Size={new UDim2(0, px(35), 0, px(35))}
													Image={`rbxthumb://type=AvatarHeadShot&id=${member.player.id}&w=150&h=150`}
													AnchorPoint={new Vector2(0, 0.5)}
													Position={new UDim2(0, px(10), 0.5, 0)}
												>
													<Corner roundness="full" />
												</imagelabel>
												<TextLabel
													typeface="Sans"
													weight="Bold"
													native={{
														Text: `@${member.player.username}`,
														TextSize: px(20),
														Size: new UDim2(0, px(163), 0, px(20)),
														Position: new UDim2(0, px(55), 0.5, 0),
														AnchorPoint: new Vector2(0, 0.5),
														TextColor3: slice.colour,
														TextXAlignment: Enum.TextXAlignment.Left,
													}}
												/>
												<TextLabel
													typeface="Sans"
													weight="Bold"
													native={{
														Text: formatWithSuffix(member.total_value, 2),
														TextSize: px(20),
														Size: new UDim2(0, px(77), 0, px(20)),
														Position: new UDim2(1, -px(116), 0.5, 0),
														AnchorPoint: new Vector2(1, 0.5),
														TextColor3: palette.primaryText,
														TextXAlignment: Enum.TextXAlignment.Center,
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
												<TextLabel
													typeface="Sans"
													weight="Bold"
													native={{
														Text: `${setDecimalPlaces(percentage, 2)}%`,
														TextSize: px(20),
														Size: new UDim2(0, px(72), 0, px(20)),
														Position: new UDim2(1, -px(44), 0.5, 0),
														AnchorPoint: new Vector2(1, 0.5),
														TextColor3: palette.primaryText,
														TextXAlignment: Enum.TextXAlignment.Right,
													}}
												/>
											</frame>
										);
									})}
							</>
						</>
					)}
				</frame>
				<frame BackgroundTransparency={1} Position={infoPagePosition} Size={new UDim2(1, 0, 1, 0)}>
					<uilistlayout VerticalFlex={Enum.UIFlexAlignment.Fill} SortOrder={Enum.SortOrder.LayoutOrder} />
					<uipadding PaddingBottom={new UDim(0, px(5))} PaddingTop={new UDim(0, px(5))} />
					{[
						{
							icon: "rbxassetid://73085039465680",
							label: "Creator",
							value: `@${jackpot.creator.username}`,
						},
						{
							icon: "rbxassetid://97435883027463",
							label: "Current Participants",
							value: tostring(jackpot.members.size()),
						},
						{
							icon: "rbxassetid://99471079515598",
							label: "Minimum Value Per Player",
							value: addCommasToNumber(jackpot.value_floor ?? 5),
						},
						{
							icon: "rbxassetid://96603603989077",
							label: "Maximum Value Per Player",
							value: `${jackpot.value_cap > 1000000000000 ? "∞" : formatWithSuffix(jackpot.value_cap, 2)}`,
						},
						{
							icon: "rbxassetid://118624283178308",
							label: "Your Stake",
							value: addCommasToNumber(myStake),
							valueGlow: true,
							greyedOut: myStake === 0,
						},
						{
							icon: "rbxassetid://130409024497219",
							label: "Your Odds (%)",
							value: `${myOdds}%`,
							greyedOut: myStake === 0,
						},
						{
							icon: "rbxassetid://120000048331921",
							label: "Current Pot Value",
							value: addCommasToNumber(
								jackpot.members.reduce((sum, member) => sum + member.total_value, 0),
							),
							valueGlow: true,
						},
					].map((stat) => {
						return (
							<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(53))}>
								{stat.greyedOut !== undefined && stat.greyedOut && (
									<frame
										BackgroundColor3={palette.background2}
										BackgroundTransparency={0.3}
										BorderSizePixel={0}
										Size={new UDim2(1, 0, 1, 0)}
										ZIndex={2}
									/>
								)}
								<imagelabel
									AnchorPoint={new Vector2(0, 0.5)}
									BackgroundTransparency={1}
									Position={new UDim2(0, px(20), 0.5, 0)}
									Size={new UDim2(0, px(25), 0, px(25))}
									Image={stat.icon}
									ImageColor3={palette.blue}
								/>
								<TextLabel
									typeface="Sans"
									weight="Bold"
									native={{
										Text: stat.label,
										TextSize: px(20),
										Size: new UDim2(1, -px(130), 0, px(20)),
										Position: new UDim2(0, px(65), 0.5, 0),
										AnchorPoint: new Vector2(0, 0.5),
										TextColor3: palette.midText,
										TextXAlignment: Enum.TextXAlignment.Left,
									}}
								/>
								<TextLabel
									typeface="Sans"
									weight="Bold"
									native={{
										Text: stat.value,
										TextSize: px(20),
										Size: new UDim2(1, -px(130), 0, px(20)),
										Position: new UDim2(1, -px(20), 0.5, 0),
										AnchorPoint: new Vector2(1, 0.5),
										TextColor3: palette.primaryText,
										TextXAlignment: Enum.TextXAlignment.Right,
									}}
								>
									{stat.valueGlow && (
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
							</frame>
						);
					})}
				</frame>
				<scrollingframe
					BackgroundTransparency={1}
					Position={itemsPagePosition}
					Size={new UDim2(1, 0, 1, 0)}
					AutomaticCanvasSize={Enum.AutomaticSize.Y}
					CanvasSize={new UDim2(0, 0, 0, 0)}
					ScrollBarThickness={px(6)}
					ScrollBarImageTransparency={1}
				>
					<uilistlayout
						Padding={new UDim(0, px(10))}
						HorizontalAlignment={Enum.HorizontalAlignment.Center}
						SortOrder={Enum.SortOrder.LayoutOrder}
					/>
					<uipadding
						PaddingBottom={new UDim(0, px(10))}
						PaddingTop={new UDim(0, px(10))}
						PaddingLeft={new UDim(0, px(10))}
						PaddingRight={new UDim(0, px(10))}
					/>
					<>
						{sortedItems.map(({ item, owner }, index) =>
							renderItem(item, index, px, undefined, `@${owner}`),
						)}
					</>
				</scrollingframe>
			</frame>
		</frame>
	);
}
