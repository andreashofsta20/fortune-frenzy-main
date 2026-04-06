import React, { useCallback, useEffect, useMemo } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { MenuCore } from "../navigation/MenuCore";
import { CoinflipGrid } from "../coinflip/CoinflipGrid";
import { inventoryOverlayStateAtom } from "client/utils/global-state";
import { Functions } from "client/network";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { usePx } from "client/hooks/use-px";
import { usePxScale } from "client/hooks/use-scale";
import { CoinflipViewing } from "../coinflip/CoinflipViewing";
import { COINFLIP_SELECTION_TITLE } from "shared/util/strings";
import { isLoadingAtom } from "client/utils/global-state";
import {
	coinflipStateAtom,
	coinflipIdAtom,
	coinAtom,
	inventorySelectionAtom,
	selectionDataAtom,
} from "client/utils/global-state";
import { palette } from "client/utils/palette";
import { requestServer } from "client/utils/send-function";
import { getCoinflipJoinValueRange } from "shared/util/coinflip-join-range";

// Custom hook to manage coinflip state transitions
const useCoinflipMenuLogic = (flashMenu: () => void) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const coinflipState = useAtom(coinflipStateAtom);
	const coinflipId = useAtom(coinflipIdAtom);
	const coin = useAtom(coinAtom);

	const calculateTotalValue = useCallback((items: string[]) => {
		return items.reduce((acc, item) => {
			const itemId = item.split(":")[1];
			const itemData = clientStateController.ItemInfo.get(itemId);
			return itemData ? acc + itemData.value : acc;
		}, 0);
	}, []);

	// Removed overlay handling from hook; will manage in component

	useEffect(() => {
		let isMounted = true;

		flashMenu();

		if (coinflipState === "create") {
			selectionDataAtom({
				maximumValue: math.huge,
				maximumPerItem: math.huge,
				totalMaximum: 10,
				minimumValue: 0,
				title: COINFLIP_SELECTION_TITLE,
				buttonText: "Next",
				autoSelectButtonVisible: false,
			});
		} else if (coinflipState === "default" || coinflipState === "viewing") {
			selectionDataAtom(undefined);
			inventorySelectionAtom({});
		} else if (coinflipState === "joining") {
			const coinflipData = clientStateController.Coinflips.find((coinflip) => coinflip.id === coinflipId);
			const totalValue = calculateTotalValue(coinflipData?.player1_items ?? []);
			const { minimumValue, maximumValue } = getCoinflipJoinValueRange(totalValue);

			if (isMounted) {
				selectionDataAtom({
					maximumValue,
					maximumPerItem: math.huge,
					totalMaximum: 10,
					minimumValue,
					title: COINFLIP_SELECTION_TITLE,
					autoSelectButtonVisible: true,
				});
			}
		}

		return () => {
			isMounted = false;
		};
	}, [coinflipState, coinflipId, flashMenu]);

	const confirmButtonEvent = useCallback(async () => {
		if (coinflipState === "loading") return;
		isLoadingAtom(true);
		try {
			if (coinflipState === "create") {
				const result = await requestServer(
					Functions.Coinflip.CreateCoinflip,
					"Failed to create coinflip",
					inventorySelectionAtom(),
					coin,
				);
				if (result === -1) return;
				if (result.code === 200 && result.message) {
					await new Promise<void>((resolve) => {
						const isCoinflipAdded = () => {
							const currentCoinflips = clientStateController.Coinflips.find(
								(coinflip) => coinflip.id === result.message,
							);
							return currentCoinflips;
						};

						if (isCoinflipAdded()) {
							resolve();
							return;
						}

						const connection = clientStateController.CoinflipChangedEvent.Connect((cfs) => {
							if (cfs.find((cf) => cf.id === result.message)) {
								connection.Disconnect();
								resolve();
							}
						});

						task.delay(5, () => {
							connection.Disconnect();
							resolve();
						});
					});

					coinflipIdAtom(result.message);
					coinflipStateAtom("viewing");
				} else {
					const notificationMessage =
						result.message ??
						`Failed to create coinflip${result.code !== undefined ? ` (Code ${result.code})` : ""}`;
					clientStateController.NotificationEvent.Fire(
						`<font color="#${palette.lossRed.ToHex()}">${notificationMessage}</font>`,
						"rbxassetid://134904801170653",
					);
				}
			} else if (coinflipState === "joining") {
				const result = await requestServer(
					Functions.Coinflip.JoinCoinflip,
					"Failed to join coinflip",
					coinflipId,
					inventorySelectionAtom(),
				);
				coinflipStateAtom("viewing");
				if (result === -1) return;
				if (result.code !== 200) {
					const notificationMessage =
						result.message ??
						`Failed to join coinflip${result.code !== undefined ? ` (Code ${result.code})` : ""}`;
					clientStateController.NotificationEvent.Fire(
						`<font color="#${palette.lossRed.ToHex()}">${notificationMessage}</font>`,
						"rbxassetid://134904801170653",
					);
				}
			}
		} finally {
			isLoadingAtom(false);
		}
	}, [coinflipState, coinflipId, coin]);

	return { confirmButtonEvent };
};

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

export const CoinflipMenu = React.memo(({ visible, flashMenu }: Props) => {
	const pxScale = usePxScale();
	const coinflipState = useAtom(coinflipStateAtom);
	const coinflipId = useAtom(coinflipIdAtom);
	const inventorySelection = useAtom(inventorySelectionAtom);
	const selectionData = useAtom(selectionDataAtom);
	const { confirmButtonEvent } = useCoinflipMenuLogic(flashMenu);

	const inventoryMenuSelectionData = useMemo(() => {
		return {
			maximumValue: selectionData?.maximumValue ?? 0,
			maximumPerItem: selectionData?.maximumPerItem ?? 0,
			totalMaximum: selectionData?.totalMaximum ?? 0,
			minimumValue: selectionData?.minimumValue ?? 0,
			title: selectionData?.title,
			buttonText: selectionData?.buttonText,
			currentSelection: inventorySelection,
			setCurrentSelection: inventorySelectionAtom,
			autoSelectButtonVisible: selectionData?.autoSelectButtonVisible,
			confirmButtonEvent,
		};
	}, [selectionData, inventorySelection, confirmButtonEvent]);

	const handleCloseInventory = useCallback(() => {
		coinflipStateAtom(coinflipState === "create" ? "default" : "viewing");
	}, [coinflipState]);

	const handleCloseViewing = useCallback(() => {
		coinflipStateAtom("default");
		coinflipIdAtom("none");
	}, []);

	// Keep overlay in sync without flicker
	const showOverlay = visible && (coinflipState === "create" || coinflipState === "joining");

	// Mount / unmount overlay when showOverlay changes
	React.useEffect(() => {
		if (!showOverlay) return;

		// create overlay
		inventoryOverlayStateAtom({
			visible: true,
			selectionData: inventoryMenuSelectionData,
			handleCloseButton: handleCloseInventory,
			scale: true,
		});

		return () => {
			// cleanup when overlay no longer needed
			inventoryOverlayStateAtom(undefined);
			inventorySelectionAtom({});
		};
	}, [showOverlay]);

	// keep overlay synced with current selectionData
	React.useEffect(() => {
		if (showOverlay) {
			inventoryOverlayStateAtom({
				visible: true,
				selectionData: inventoryMenuSelectionData,
				handleCloseButton: handleCloseInventory,
				scale: true,
			});
		}
	}, [inventoryMenuSelectionData]);

	return (
		<MenuCore scale={false}>
			<CoinflipGrid visible={coinflipState === "default" && visible} flashMenu={flashMenu}>
				<uiscale Scale={pxScale()} />
			</CoinflipGrid>
			<CoinflipViewing
				CoinflipId={coinflipId}
				visible={coinflipState === "viewing" && visible}
				handleCloseButton={handleCloseViewing}
			>
				<uiscale Scale={pxScale()} />
			</CoinflipViewing>
		</MenuCore>
	);
});
