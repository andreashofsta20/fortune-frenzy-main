import React, { useCallback, useState } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "client/ui/core/TextLabel";
import { Button } from "client/ui/core/Button";
import { Corner } from "client/ui/tools/Corner";
import { MenuCore } from "client/ui/navigation/MenuCore";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Functions } from "client/network";
import { requestServer } from "client/utils/send-function";
import { applyTutorialServerState, startTutorialFlow, tutorialOfferVisibleAtom } from "./tutorial-state";

const MODAL_Z = 600;

/**
 * Shown after Daily Reward when the server says the guided tour is available.
 */
export function TutorialOfferModal() {
	const px = usePx();
	const visible = useAtom(tutorialOfferVisibleAtom);
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [declining, setDeclining] = useState(false);

	const runDecline = useCallback(() => {
		if (declining) return;
		setDeclining(true);
		task.spawn(async () => {
			const result = await requestServer(
				Functions.Loading.DeclineGuidedTutorial,
				"Could not update tutorial preference",
			);
			setDeclining(false);
			if (result === -1 || result.status !== "success") {
				clientStateController.NotificationEvent.Fire(
					`<font color="#${palette.lossRed.ToHex()}">Something went wrong. You can try again.</font>`,
				);
				return;
			}
			applyTutorialServerState(
				{
					completed: result.completed,
					shouldShow: result.should_show,
					rewardPreview: result.reward_preview,
				},
				false,
			);
			tutorialOfferVisibleAtom(false);
		});
	}, [clientStateController, declining]);

	if (!visible) {
		return undefined;
	}

	return (
		<frame
			key="TutorialOfferModal"
			BackgroundColor3={Color3.fromRGB(0, 0, 0)}
			BackgroundTransparency={0.35}
			Size={new UDim2(1, 0, 1, 0)}
			ZIndex={MODAL_Z}
		>
			<MenuCore>
				<frame
					BackgroundColor3={palette.background1}
					AutomaticSize={Enum.AutomaticSize.Y}
					Size={new UDim2(0, px(500), 0, 0)}
					AnchorPoint={new Vector2(0.5, 0.5)}
					Position={new UDim2(0.5, 0, 0.5, 0)}
					ZIndex={MODAL_Z + 1}
				>
					<Corner roundness="small" />
					<uilistlayout
						FillDirection={Enum.FillDirection.Vertical}
						SortOrder={Enum.SortOrder.LayoutOrder}
						Padding={new UDim(0, 0)}
					/>

					<frame
						BackgroundColor3={palette.background2}
						Size={new UDim2(1, 0, 0, 0)}
						AutomaticSize={Enum.AutomaticSize.Y}
						BorderSizePixel={0}
						LayoutOrder={1}
					>
						<Corner roundness="small" />
						<frame
							BackgroundColor3={palette.background2}
							Size={new UDim2(1, 0, 0, px(14))}
							Position={new UDim2(0, 0, 1, -px(14))}
							BorderSizePixel={0}
						/>
						<uipadding
							PaddingLeft={new UDim(0, px(24))}
							PaddingRight={new UDim(0, px(24))}
							PaddingTop={new UDim(0, px(22))}
							PaddingBottom={new UDim(0, px(20))}
						/>
						<uilistlayout
							FillDirection={Enum.FillDirection.Vertical}
							SortOrder={Enum.SortOrder.LayoutOrder}
							Padding={new UDim(0, px(8))}
						/>
						<TextLabel
							typeface="Sans"
							weight="Bold"
							native={{
								Text: "Welcome to Fortune Frenzy",
								TextSize: px(22),
								Size: new UDim2(1, 0, 0, 0),
								AutomaticSize: Enum.AutomaticSize.Y,
								TextXAlignment: Enum.TextXAlignment.Left,
								ZIndex: MODAL_Z + 3,
								LayoutOrder: 1,
							}}
						/>
						<TextLabel
							weight="Regular"
							typeface="Sans"
							native={{
								Text: "Would you like a quick guided tutorial for a reward? It only takes a few minutes.",
								TextSize: px(14),
								TextColor3: palette.midText,
								Size: new UDim2(1, 0, 0, 0),
								AutomaticSize: Enum.AutomaticSize.Y,
								TextXAlignment: Enum.TextXAlignment.Left,
								TextYAlignment: Enum.TextYAlignment.Top,
								TextWrapped: true,
								ZIndex: MODAL_Z + 3,
								LayoutOrder: 2,
							}}
						/>
					</frame>

					<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, 0)} AutomaticSize={Enum.AutomaticSize.Y} LayoutOrder={2}>
						<uipadding
							PaddingLeft={new UDim(0, px(24))}
							PaddingRight={new UDim(0, px(24))}
							PaddingTop={new UDim(0, px(20))}
							PaddingBottom={new UDim(0, px(22))}
						/>
						<frame BackgroundTransparency={1} Size={new UDim2(1, 0, 0, px(44))}>
							<uilistlayout
								FillDirection={Enum.FillDirection.Horizontal}
								HorizontalAlignment={Enum.HorizontalAlignment.Center}
								VerticalAlignment={Enum.VerticalAlignment.Center}
								Padding={new UDim(0, px(12))}
								SortOrder={Enum.SortOrder.LayoutOrder}
							/>
							<Button
								text="Start tutorial"
								size={new UDim2(0.5, -px(6), 1, 0)}
								position={new UDim2(0, 0, 0, 0)}
								anchorPoint={new Vector2(0, 0)}
								backgroundColor={palette.blue}
								textColor={palette.blueText}
								weight="SemiBold"
								enabled={!declining}
								layoutOrder={1}
								event={{
									Activated: () => {
										startTutorialFlow();
									},
								}}
							/>
							<Button
								text={declining ? "…" : "Not now"}
								size={new UDim2(0.5, -px(6), 1, 0)}
								position={new UDim2(0, 0, 0, 0)}
								anchorPoint={new Vector2(0, 0)}
								backgroundColor={palette.background3}
								textColor={palette.midText}
								weight="SemiBold"
								enabled={!declining}
								layoutOrder={2}
								event={{
									Activated: runDecline,
								}}
							/>
						</frame>
					</frame>
				</frame>
			</MenuCore>
		</frame>
	);
}
