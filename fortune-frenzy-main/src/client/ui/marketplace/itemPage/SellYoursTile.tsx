import React, { useEffect, useRef, useState } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { ItemPageReseller } from "./Reseller";
import { useMotion } from "@rbxts/pretty-react-hooks";
import { TextInputBox } from "client/ui/core/TextInputBox";
import { MARKETPLACE_SELL_PRICE_PLACEHOLDER } from "shared/util/strings";
import { Button } from "client/ui/core/Button";
import { palette } from "client/utils/palette";
import { smartStringToNumber } from "shared/util/string-utils";
import { addCommasToNumber } from "shared/util/number-utils";
import { Functions } from "client/network";
import { isLoadingAtom } from "client/utils/global-state";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { requestServer } from "client/utils/send-function";

interface Props {
	subtitle: string;
	title: string;
	image: string;
	LayoutOrder: number;
	buttonText: string;
	buttonIcon?: string;
	uaid: string;
	unlistMode?: boolean;
	activated: (rbx: ImageButton, inputObject: InputObject, clickCount: number) => void;
	itemId: string;
}

export function SellYoursTile({
	subtitle,
	title,
	image,
	LayoutOrder,
	activated,
	buttonIcon,
	buttonText,
	uaid,
	unlistMode,
	itemId,
}: Props) {
	const px = usePx();
	const [status, setStatus] = useState(false);
	const [loading, setLoading] = useState(false);
	const [currentPrice, setCurrentPrice] = useState(0);
	const [size, sizeMotion] = useMotion(new UDim2(1, 0, 0, px(100)));
	const [mainButtonTransparency, mainButtonTransparencyMotion] = useMotion(0);
	const textInputBox = useRef<TextBox>(undefined);
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	useEffect(() => {
		if (status && textInputBox.current) {
			textInputBox.current.CaptureFocus();
		}

		sizeMotion.tween(new UDim2(1, 0, 0, px(status ? 108 : 70)), {
			time: 0.15,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
		mainButtonTransparencyMotion.tween(status ? 1 : 0, {
			time: 0.15,
			style: Enum.EasingStyle.Quad,
			direction: Enum.EasingDirection.Out,
		});
	}, [status]);

	useEffect(() => {
		if (!status && textInputBox.current) {
			textInputBox.current.Text = "";
		}
	}, [status]);

	return (
		<ItemPageReseller
			subtitle={subtitle}
			title={title}
			image={image}
			LayoutOrder={LayoutOrder}
			activated={async () => {
				isLoadingAtom(true);
				if (unlistMode) {
					await requestServer(
						Functions.Marketplace.ListItemForSale,
						"Failed to list item for sale",
						uaid,
						undefined,
					);

					await new Promise<void>((resolve) => {
						const isListingRemoved = () => {
							const currentListings = clientStateController.ItemListings.get(itemId);
							return !currentListings || !currentListings.some((l) => l.user_asset_id === uaid);
						};

						if (isListingRemoved()) {
							resolve();
							return;
						}

						const connection = clientStateController.ListingsEvent.Connect((updatedItemId) => {
							if (updatedItemId !== itemId) return;
							if (isListingRemoved()) {
								connection.Disconnect();
								resolve();
							}
						});

						task.delay(5, () => {
							connection.Disconnect();
							resolve();
						});
					});

					isLoadingAtom(false);
					return;
				}

				isLoadingAtom(false);

				if (!status) {
					setStatus(!status);
				}
			}}
			buttonIcon={buttonIcon}
			buttonText={buttonText}
			buttonBackgroundColor={unlistMode ? palette.red : palette.blue}
			buttonTextColor={unlistMode ? palette.redText : palette.blueText}
			buttonTransparency={mainButtonTransparency}
			size={size}
			key={uaid}
		>
			<TextInputBox
				ref={textInputBox}
				placeholder={MARKETPLACE_SELL_PRICE_PLACEHOLDER}
				size={new UDim2(0, px(460), 0, px(30))}
				position={new UDim2(0, px(246), 0, px(68))}
				image="rbxassetid://133730286428245"
				typeface="Sans"
				weight="Medium"
				visible={status}
				textEditable={!loading}
				native={{
					Visible: status,
					AnchorPoint: new Vector2(0.5, 0),
				}}
				event={{
					FocusLost: (rbx) => {
						if (!status || loading) return;

						const text = rbx.Text;
						const number = smartStringToNumber(text);
						if (number === undefined || number <= 0) {
							sizeMotion.tween(new UDim2(1, 0, 0, px(70)), {
								time: 0.15,
								style: Enum.EasingStyle.Quad,
								direction: Enum.EasingDirection.Out,
							});
							mainButtonTransparencyMotion.tween(0, {
								time: 0.15,
								style: Enum.EasingStyle.Quad,
								direction: Enum.EasingDirection.Out,
							});

							task.delay(0.1, () => {
								setStatus(false);
								rbx.Text = "";
							});

							return;
						} else {
							rbx.Text = addCommasToNumber(number);
							setCurrentPrice(number);
						}
					},
				}}
			/>
			<Button
				size={new UDim2(0, px(134), 0, px(30))}
				position={new UDim2(0, px(486), 0, px(68))}
				typeface="Sans"
				weight="Bold"
				visible={status}
				text="Confirm"
				backgroundColor={palette.blue}
				textColor={palette.blueText}
				event={{
					Activated: async () => {
						if (loading) return;
						setLoading(true);
						isLoadingAtom(true);

						const result = await requestServer(
							Functions.Marketplace.ListItemForSale,
							"Failed to list item for sale",
							uaid,
							currentPrice,
						);

						setLoading(false);
						isLoadingAtom(false);

						if (result === -1) return;
						if (result.status === "success") {
							// Wait until the new listing is visible in the cache
							await new Promise<void>((resolve) => {
								const isListingAdded = () => {
									const currentListings = clientStateController.ItemListings.get(itemId);
									return currentListings && currentListings.some((l) => l.user_asset_id === uaid);
								};

								if (isListingAdded()) {
									resolve();
									return;
								}

								const connection = clientStateController.ListingsEvent.Connect((updatedItemId) => {
									if (updatedItemId !== itemId) return;
									if (isListingAdded()) {
										connection.Disconnect();
										resolve();
									}
								});

								// Safety timeout to avoid hanging indefinitely (5 seconds)
								task.delay(5, () => {
									connection.Disconnect();
									resolve();
								});
							});

							setStatus(false);
							setCurrentPrice(0);
						} else {
							clientStateController.NotificationEvent.Fire(
								`<font color="#${palette.lossRed.ToHex()}">${result.message ?? "Failed to list item for sale"}; Code ${result.code}</font>`,
								"rbxassetid://134904801170653",
							);
						}
					},
				}}
			/>
		</ItemPageReseller>
	);
}
