import React, { useEffect, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { palette } from "client/utils/palette";
import { TextLabel } from "../core/TextLabel";
import { ItemListing } from "typings/APIResponses";
import {
	MARKETPLACE_BUY_CONFIRMATION_CONFIRM,
	MARKETPLACE_BUY_CONFIRMATION_DESCRIPTION,
	MARKETPLACE_BUY_CONFIRMATION_TITLE,
	MARKETPLACE_BUY_CONFIRMATION_CANCEL,
	MARKETPLACE_PURCHASE_SUCCESS,
	MARKETPLACE_PURCHASE_FAILED,
} from "shared/util/strings";
import { Button } from "../core/Button";
import { addCommasToNumber } from "shared/util/number-utils";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { Functions } from "client/network";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Corner } from "../tools/Corner";
import { replacePlaceholder } from "shared/util/string-utils";
import { isLoadingAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";
import { peek } from "@rbxts/charm";
import {
	TUTORIAL_STEPS,
	TUTORIAL_TARGET_IDS,
	advanceTutorialAction,
	tutorialPurchasedItemIdAtom,
	tutorialStateAtom,
} from "client/tutorial/tutorial-state";

interface Props {
	currentConfirmationPrompt: {
		enabled: boolean;
		listing: ItemListing | undefined;
		directItemId?: string;
		directPrice?: number;
		directItemName?: string;
	};
	setCurrentConfirmationPrompt: React.Dispatch<
		React.SetStateAction<{
			enabled: boolean;
			listing: ItemListing | undefined;
			directItemId?: string;
			directPrice?: number;
			directItemName?: string;
		}>
	>;
	transparency: React.Binding<number>;
	backgroundTransparency: React.Binding<number>;
	confirmationPromptTransparencyMotion: Ripple.Motion<number>;
	backgroundTransparencyMotion: Ripple.Motion<number>;
}

export function ConfirmationPrompt({
	currentConfirmationPrompt,
	setCurrentConfirmationPrompt,
	transparency,
	confirmationPromptTransparencyMotion,
	backgroundTransparencyMotion,
	backgroundTransparency,
}: Props) {
	const px = usePx();
	const [confirmationButtonText, setConfirmationButtonText] = useState(MARKETPLACE_BUY_CONFIRMATION_CONFIRM);
	const [successTextTransparency, successTextTransparencyMotion] = useMotion(1);
	const [successText, setSuccessText] = useState("");
	const [confirmationDescription, setConfirmationDescription] = useState("");
	const confirmationButtonColors = {
		backgroundColor: useState(palette.blue),
		textColor: useState(palette.blueText),
	};
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	useEffect(() => {
		let purchasePrice: number | undefined;
		if (typeIs(currentConfirmationPrompt.listing, "table")) {
			purchasePrice = tonumber(currentConfirmationPrompt.listing.price) || 0;
		} else if (currentConfirmationPrompt.directPrice !== undefined) {
			purchasePrice = currentConfirmationPrompt.directPrice;
		}

		const remainingCash =
			purchasePrice !== undefined ? clientStateController.Cash - purchasePrice : clientStateController.Cash;

		setConfirmationDescription(
			MARKETPLACE_BUY_CONFIRMATION_DESCRIPTION.gsub("{{s}}", addCommasToNumber(remainingCash))[0],
		);
	}, [currentConfirmationPrompt, clientStateController.Cash]);

	return (
		<frame
			Size={new UDim2(1, 0, 1, 0)}
			Position={new UDim2(0, 0, 0, 0)}
			BackgroundTransparency={1}
			BackgroundColor3={palette.background1}
			ZIndex={2}
			Transparency={backgroundTransparency}
		>
			<Corner roundness="small" />
			<TextLabel
				typeface="Sans"
				weight="Bold"
				native={{
					Text: MARKETPLACE_BUY_CONFIRMATION_TITLE,
					TextSize: px(28),
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, px(167)),
					Size: new UDim2(1, 0, 0, px(28)),
					TextColor3: palette.primaryText,
					TextTransparency: transparency,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: confirmationDescription,
					TextSize: px(20),
					AnchorPoint: new Vector2(0.5, 0),
					Position: new UDim2(0.5, 0, 0, px(204)),
					Size: new UDim2(0, px(360), 0, px(46)),
					TextColor3: palette.midText,
					TextTransparency: transparency,
				}}
			/>
			<TextLabel
				typeface="Sans"
				weight="SemiBold"
				native={{
					Text: successText,
					TextSize: px(20),
					AnchorPoint: new Vector2(0.5, 0.5),
					Position: new UDim2(0.5, 0, 0.5, 0),
					Size: new UDim2(0, px(500), 0, px(20)),
					TextColor3: palette.midText,
					RichText: true,
					TextTransparency: successTextTransparency,
				}}
			/>
			<Button
				size={new UDim2(0, px(134), 0, px(35))}
				position={new UDim2(0, px(310), 0, px(283))}
				anchorPoint={new Vector2(0, 0.5)}
				text={confirmationButtonText}
				typeface="Sans"
				weight="Bold"
				image="rbxassetid://11833005733"
				imageSize={px(15)}
				imagePadding={px(7)}
				backgroundColor={confirmationButtonColors.backgroundColor[0]}
				textColor={palette.blueText}
				imageColor={palette.blueText}
				transparency={transparency}
				zindex={2}
				tutorialActionId="marketplace_confirm_direct_buy"
				tutorialTargetId={TUTORIAL_TARGET_IDS.marketplaceConfirmPurchaseButton}
				event={{
					Activated: async () => {
						if (!currentConfirmationPrompt.enabled) return;
						setCurrentConfirmationPrompt({ ...currentConfirmationPrompt, enabled: false });
						confirmationPromptTransparencyMotion.tween(1, {
							time: 0.3 / 2,
							style: Enum.EasingStyle.Quad,
							direction: Enum.EasingDirection.Out,
						});

						isLoadingAtom(true);

						const purchaseTarget = typeIs(currentConfirmationPrompt.listing, "table")
							? `listing:${currentConfirmationPrompt.listing.user_asset_id}`
							: currentConfirmationPrompt.directItemId
								? `item:${currentConfirmationPrompt.directItemId}`
								: "";

						let result;
						if (
							purchaseTarget.size() > 0
						) {
							result = await requestServer(
								Functions.Marketplace.BuyListedItem,
								"Failed to buy listed item",
								purchaseTarget,
							);
						} else {
							result = { status: "error", code: 400 };
						}

						isLoadingAtom(false);

						if (result !== -1 && result.status === "success") {
							if (currentConfirmationPrompt.directItemId) {
								const tut = peek(tutorialStateAtom);
								const step = TUTORIAL_STEPS[tut.stepIndex];
								if (tut.active && step?.actionId === "marketplace_confirm_direct_buy") {
									tutorialPurchasedItemIdAtom(currentConfirmationPrompt.directItemId);
									advanceTutorialAction("marketplace_confirm_direct_buy");
								}
							}
							setSuccessText(MARKETPLACE_PURCHASE_SUCCESS);
						} else if (result !== -1) {
							setSuccessText(
								replacePlaceholder(
									MARKETPLACE_PURCHASE_FAILED,
									"{{code}}",
									tostring(result?.code ?? 0),
								),
							);
						} else {
							setSuccessText(MARKETPLACE_PURCHASE_FAILED);
						}

						const tween_options = {
							time: 0.3 / 2,
							style: Enum.EasingStyle.Quad,
							direction: Enum.EasingDirection.Out,
						};

						successTextTransparencyMotion.tween(0, tween_options);
						task.wait(0.5);
						confirmationPromptTransparencyMotion.tween(1, tween_options);
						backgroundTransparencyMotion.tween(1, tween_options);
						successTextTransparencyMotion.tween(1, tween_options);
						task.wait(0.3);
						setCurrentConfirmationPrompt({ enabled: false, listing: undefined });
					},
				}}
			/>
			<Button
				size={new UDim2(0, px(134), 0, px(35))}
				position={new UDim2(0, px(455), 0, px(283))}
				anchorPoint={new Vector2(0, 0.5)}
				text={MARKETPLACE_BUY_CONFIRMATION_CANCEL}
				typeface="Sans"
				weight="Bold"
				backgroundColor={palette.background3}
				textColor={palette.primaryText}
				transparency={transparency}
				event={{
					Activated: () => {
						if (!currentConfirmationPrompt.enabled) return;
						setCurrentConfirmationPrompt({ ...currentConfirmationPrompt, enabled: false });
						confirmationPromptTransparencyMotion.tween(1, {
							time: 0.15,
							style: Enum.EasingStyle.Quad,
							direction: Enum.EasingDirection.Out,
						});
						backgroundTransparencyMotion.tween(1, {
							time: 0.15,
							style: Enum.EasingStyle.Quad,
							direction: Enum.EasingDirection.Out,
						});
						setConfirmationButtonText(MARKETPLACE_BUY_CONFIRMATION_CONFIRM);
						task.wait(0.15);
						setCurrentConfirmationPrompt({ enabled: false, listing: undefined });
					},
				}}
			/>
		</frame>
	);
}
