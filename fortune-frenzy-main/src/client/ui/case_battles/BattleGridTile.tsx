import React, { memo, useEffect } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { CaseBattleData } from "typings/APIResponses";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core";
import { SquareRatio } from "../tools/SquareRatio";
import { TextLabel } from "../core/TextLabel";
import { palette } from "client/utils/palette";
import { addCommasToNumber } from "shared/util/number-utils";
import { Corner } from "../tools/Corner";
import { useMotion } from "client/hooks/use-motion";

export const BattleGridTile = memo(
	({ battleData, layoutOrder }: { battleData: CaseBattleData; layoutOrder: number }) => {
		const px = usePx();
		const clientStateController = Modding.resolveSingleton(ClientStateController);

		const caseImages = () => {
			const images = battleData.cases.map((caseId) => {
				const caseData = clientStateController.CaseBattleCases.find((caseData) => caseData.id === caseId);
				if (!caseData) return "";
				return caseData.image;
			});

			return images.map((image, index) => {
				return (
					<imagelabel
						Image={image}
						BackgroundTransparency={1}
						Size={new UDim2(1, 0, 1, 0)}
						LayoutOrder={index}
					>
						<SquareRatio />
					</imagelabel>
				);
			});
		};

		const totalPrice = battleData.cases.reduce((acc, caseId) => {
			const caseData = clientStateController.CaseBattleCases.find((c) => c.id === caseId);
			if (caseData) return acc + caseData.price;
			return acc;
		}, 0);

		const modeText = battleData.crazy
			? `${battleData.team_mode} | <font color="#f6a6ff">Crazy</font>`
			: `${battleData.team_mode} | Normal`;

		const subtitleText = () => {
			if (battleData.status === "waiting_for_players") {
				return `Waiting for ${
					battleData.team_mode
						.split("v")
						.map((str) => tonumber(str) || 0)
						.reduce((sum, players) => sum + players, 0) - battleData.players.size()
				} more ${
					battleData.team_mode
						.split("v")
						.map((str) => tonumber(str) || 0)
						.reduce((sum, players) => sum + players, 0) -
						battleData.players.size() ===
					1
						? "player"
						: "players"
				}...`;
			} else if (battleData.status === "in_progress") {
				const currentCase = battleData.current_spin_data.case_id;
				const caseData = clientStateController.CaseBattleCases.find((c) => c.id === currentCase);
				if (!caseData) return "Opening case...";
				return `Opening ${caseData.name}...`;
			} else if (battleData.status === "completed") {
				return `Completed!`;
			}
		};

		const baseYOffset = px(-15);
		const [caseFramePosition, caseFrameMotion] = useMotion<UDim2>(new UDim2(1, 0, 0.5, baseYOffset));

		useEffect(() => {
			const currentIndex = battleData.current_spin_data.current_case_index;
			const containerHeight = px(65);
			const padding = px(3);
			const targetOffset = -(currentIndex * (containerHeight + padding));
			caseFrameMotion.tween(new UDim2(1, math.min(targetOffset, 0), 0.5, baseYOffset), {
				time: 0.35,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
		}, [battleData.current_spin_data.current_case_index]);

		const [subtitleTransparency, subtitleTransparencyMotion] = useMotion(1);

		useEffect(() => {
			subtitleTransparencyMotion.set(1);
			subtitleTransparencyMotion.tween(0.4, {
				time: 0.35,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
		}, [battleData.status, battleData.current_spin_data.case_id, battleData.current_spin_data.progress]);

		const [fadeTransparency, fadeTransparencyMotion] = useMotion(0);

		useEffect(() => {
			fadeTransparencyMotion.tween(1, {
				time: 0.35,
				style: Enum.EasingStyle.Quad,
				direction: Enum.EasingDirection.Out,
			});
		}, []);

		return (
			<imagebutton
				Image={"rbxassetid://110247325843938"}
				BackgroundTransparency={1}
				LayoutOrder={layoutOrder}
				Size={new UDim2(0.5, -px(6), 0, px(120))}
				ClipsDescendants={true}
				Event={{
					Activated: () => {
						clientStateController.CaseBattleSelectedEvent.Fire(battleData.id);
					},
				}}
			>
				<frame
					BackgroundTransparency={1}
					AnchorPoint={new Vector2(1, 0.5)}
					Position={caseFramePosition}
					Size={new UDim2(0, px(290), 0, px(65))}
					ZIndex={-2}
				>
					<uilistlayout
						Padding={new UDim(0, px(3))}
						FillDirection={Enum.FillDirection.Horizontal}
						SortOrder={Enum.SortOrder.LayoutOrder}
						VerticalAlignment={Enum.VerticalAlignment.Center}
					/>
					{caseImages()}
				</frame>
				<imagebutton
					Image={"rbxassetid://119031303326843"}
					ImageColor3={Color3.fromRGB(140, 140, 140)}
					AnchorPoint={new Vector2(0, 0.5)}
					BackgroundTransparency={1}
					Position={new UDim2(0, px(15), 0.5, -px(15))}
					Size={UDim2.fromOffset(px(20), px(20))}
				/>
				<TextLabel
					typeface="Sans"
					weight="Bold"
					native={{
						Text: `$${addCommasToNumber(totalPrice)}`,
						TextSize: px(21),
						TextColor3: palette.primaryText,
						TextTransparency: 0.2,
						AnchorPoint: new Vector2(0, 0.5),
						Position: new UDim2(0, px(42), 0.5, -px(23)),
						Size: new UDim2(0, px(100), 0, px(21)),
						TextXAlignment: Enum.TextXAlignment.Left,
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
					weight="Medium"
					native={{
						Text: `Case ${battleData.current_spin_data.progress}`,
						TextSize: px(17),
						TextColor3: palette.primaryText,
						TextTransparency: 0.4,
						AnchorPoint: new Vector2(0, 0.5),
						Position: new UDim2(0, px(42), 0.5, -px(3)),
						Size: new UDim2(0, px(100), 0, px(17)),
						TextXAlignment: Enum.TextXAlignment.Left,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						Text: modeText,
						TextSize: px(15),
						TextColor3: palette.primaryText,
						TextTransparency: 0.45,
						AnchorPoint: new Vector2(0, 0.5),
						Position: new UDim2(0, px(42), 0.5, px(16)),
						Size: new UDim2(0, px(150), 0, px(15)),
						TextXAlignment: Enum.TextXAlignment.Left,
						TextTruncate: Enum.TextTruncate.AtEnd,
						RichText: true,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="SemiBold"
					native={{
						Text: subtitleText(),
						TextSize: px(17),
						TextColor3: palette.primaryText,
						TextTransparency: subtitleTransparency,
						AnchorPoint: new Vector2(0, 1),
						Position: new UDim2(0, px(15), 1, -px(15)),
						Size: new UDim2(0, px(165), 0, px(17)),
						TextXAlignment: Enum.TextXAlignment.Left,
						TextTruncate: Enum.TextTruncate.SplitWord,
					}}
				/>
				<TextLabel
					typeface="Sans"
					weight="Medium"
					native={{
						Text: `Created by @${battleData.players[0].username}`,
						TextSize: px(17),
						TextColor3: palette.primaryText,
						TextTransparency: 0.4,
						AnchorPoint: new Vector2(1, 1),
						Position: new UDim2(1, -px(50), 1, -px(15)),
						Size: new UDim2(0, px(180), 0, px(17)),
						TextXAlignment: Enum.TextXAlignment.Right,
					}}
				/>
				<imagelabel
					BackgroundTransparency={1}
					Position={new UDim2(1, -px(10), 1, -px(10))}
					AnchorPoint={new Vector2(1, 1)}
					Size={new UDim2(0, px(30), 0, px(30))}
					Image={`rbxthumb://type=AvatarHeadShot&id=${battleData.players[0].id}&w=150&h=150`}
				>
					<Corner roundness="small" />
				</imagelabel>
				<imagelabel
					BackgroundColor3={palette.background1}
					Size={new UDim2(1, 0, 1, 0)}
					Image={"rbxassetid://110247325843938"}
					BorderSizePixel={0}
					ZIndex={-1}
				>
					<uigradient
						Transparency={
							new NumberSequence([
								new NumberSequenceKeypoint(0, 1),
								new NumberSequenceKeypoint(0.6, 1),
								new NumberSequenceKeypoint(0.945, 0.1),
								new NumberSequenceKeypoint(1, 0),
							])
						}
					/>
				</imagelabel>
				<imagelabel
					BackgroundColor3={palette.background1}
					Size={new UDim2(1, 0, 1, 0)}
					Image={"rbxassetid://110247325843938"}
					BorderSizePixel={0}
					ZIndex={-1}
				>
					<uigradient
						Transparency={
							new NumberSequence([
								new NumberSequenceKeypoint(0, 1),
								new NumberSequenceKeypoint(0.66, 1),
								new NumberSequenceKeypoint(0.7, 0),
								new NumberSequenceKeypoint(1, 0),
							])
						}
						Rotation={180}
					/>
				</imagelabel>
				<frame
					BackgroundColor3={palette.background1}
					BackgroundTransparency={fadeTransparency}
					Size={new UDim2(1, 0, 1, 0)}
					Position={new UDim2(0, 0, 0, 0)}
					BorderSizePixel={0}
					ZIndex={5}
				/>
			</imagebutton>
		);
	},
);
