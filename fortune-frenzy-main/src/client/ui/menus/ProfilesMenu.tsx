/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useCallback, useEffect } from "@rbxts/react";
import { useAtom } from "@rbxts/react-charm";
import { Modding } from "@flamework/core";
import { MenuCore } from "../navigation/MenuCore";
import { PlayerGrid } from "../profiles/PlayerGrid";
import { PlayerProfile } from "../profiles/PlayerProfile";
import { CreateTrade } from "../profiles/CreateTrade";
import { ClientStateController } from "client/controllers/ClientStateController";
import { inventoryOverlayStateAtom } from "client/utils/global-state";
import { usePxScale } from "client/hooks/use-scale";
import { Functions } from "client/network";
import { currentSelectedPlayerAtom, newTradeStateAtom, isLoadingAtom } from "client/utils/global-state";
import { requestServer } from "client/utils/send-function";
import { Players } from "@rbxts/services";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

const MAX_TRADE_UNIQUE_ITEMS = 8;
const MAX_TRADE_ITEM_QUANTITY = 999;
const MAX_TRADE_TOTAL_ITEMS = MAX_TRADE_UNIQUE_ITEMS * MAX_TRADE_ITEM_QUANTITY;

function normalizeTradeSelection(
	selection: Record<string, number>,
	previousSelection: Record<string, number>,
	availableInventory: Map<string, string[]> | undefined,
): Record<string, number> {
	const orderedItemIds = new Array<string>();
	const seenItemIds = {} as Record<string, true>;

	const pushItemId = (rawItemId: unknown) => {
		const itemId = tostring(rawItemId ?? "");
		if (itemId.size() === 0 || seenItemIds[itemId]) return;
		seenItemIds[itemId] = true;
		orderedItemIds.push(itemId);
	};

	for (const [itemId] of pairs(previousSelection)) {
		pushItemId(itemId);
	}

	for (const [itemId] of pairs(selection)) {
		pushItemId(itemId);
	}

	const normalizedSelection = {} as Record<string, number>;
	let uniqueItemCount = 0;

	for (const itemId of orderedItemIds) {
		if (uniqueItemCount >= MAX_TRADE_UNIQUE_ITEMS) break;

		const requestedQuantity = math.max(0, math.floor(tonumber(selection[itemId]) ?? 0));
		if (requestedQuantity <= 0) continue;

		const availableQuantity = availableInventory?.get(itemId)?.size() ?? 0;
		const clampedQuantity = math.min(requestedQuantity, availableQuantity, MAX_TRADE_ITEM_QUANTITY);
		if (clampedQuantity <= 0) continue;

		normalizedSelection[itemId] = clampedQuantity;
		uniqueItemCount += 1;
	}

	return normalizedSelection;
}

export const ProfilesMenu = React.memo(({ visible, flashMenu }: Props) => {
	const pxScale = usePxScale();
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const currentSelectedPlayer = useAtom(currentSelectedPlayerAtom);
	const newTradeState = useAtom(newTradeStateAtom);

	const notifyNeverPlayed = useCallback(() => {
		clientStateController.NotificationEvent.Fire(
			'<font color="#f56a6a">That player has never played this game before.</font>',
			"rbxassetid://134904801170653",
		);
	}, [clientStateController]);

	const handleProfileCardClicked = useCallback(
		async (userId: string) => {
			isLoadingAtom(true);
			const targetUserId = tonumber(userId) || 0;
			const targetInfo = await clientStateController.GetPlayerInformation(targetUserId);
			if (!targetInfo) {
				notifyNeverPlayed();
				isLoadingAtom(false);
				return;
			}

			currentSelectedPlayerAtom(targetInfo.pData.user_id);
			isLoadingAtom(false);
		},
		[clientStateController, notifyNeverPlayed],
	);

	const handleTradeButtonClicked = useCallback(
		async (playerData: { userId: string; username: string; display_name: string }) => {
			isLoadingAtom(true);
			const targetUserId = tonumber(playerData.userId) || 0;
			const targetInfo = await clientStateController.GetPlayerInformation(targetUserId);
			if (!targetInfo) {
				notifyNeverPlayed();
				isLoadingAtom(false);
				return;
			}

			const otherInventory = await requestServer(
				Functions.Users.GetUserInventory,
				"Failed to get user inventory",
				targetUserId,
			);
			if (otherInventory === -1) {
				isLoadingAtom(false);
				return;
			}
			newTradeStateAtom({
				selectedPlayerInventory: otherInventory,
				currentlySelectingFor: "none",
				localSelection: {},
				otherSelection: {},
				otherPlayerInfo: {
					userId: targetInfo.pData.user_id,
					username: targetInfo.pData.name,
					display_name: targetInfo.pData.display_name,
				},
			});
			currentSelectedPlayerAtom(targetInfo.pData.user_id);
			isLoadingAtom(false);
		},
		[clientStateController, notifyNeverPlayed],
	);

	// Handle closing the inventory selection screen while trading
	// Instead of closing the entire Profiles menu, simply return to the trade builder
	const handleCloseInventory = useCallback(() => {
		newTradeStateAtom((prev) => ({ ...prev, currentlySelectingFor: "none" }));
	}, []);

	// Compute selectionData for inventory overlay
	const inventoryMenuSelectionData = {
		maximumValue: math.huge,
		maximumPerItem: MAX_TRADE_ITEM_QUANTITY,
		totalMaximum: MAX_TRADE_TOTAL_ITEMS,
		minimumValue: 0,
		title: newTradeState.currentlySelectingFor === "local" ? "Your Inventory" : "Their Inventory",
		buttonText: "Confirm",
		currentSelection:
			newTradeState.currentlySelectingFor === "local"
				? newTradeState.localSelection
				: newTradeState.otherSelection,
		setCurrentSelection: (newSelection: Record<string, number>) => {
			newTradeStateAtom((prev) => {
				if (prev.currentlySelectingFor === "none") return prev;

				const selectionKey = prev.currentlySelectingFor === "local" ? "localSelection" : "otherSelection";
				const previousSelection = prev[selectionKey];
				const availableInventory =
					prev.currentlySelectingFor === "local"
						? clientStateController.Inventory
						: prev.selectedPlayerInventory;

				return {
					...prev,
					[selectionKey]: normalizeTradeSelection(newSelection, previousSelection, availableInventory),
				};
			});
		},
		autoSelectButtonVisible: false,
		excludeListedCopies: true,
		listedCopiesSellerUserId:
			newTradeState.currentlySelectingFor === "local"
				? tostring(Players.LocalPlayer.UserId)
				: newTradeState.otherPlayerInfo.userId,
		confirmButtonEvent: () => {
			newTradeStateAtom((prev) => ({ ...prev, currentlySelectingFor: "none" }));
		},
	};

	const showOverlay =
		visible &&
		currentSelectedPlayer !== undefined &&
		newTradeState.currentlySelectingFor !== "none" &&
		newTradeState.selectedPlayerInventory !== undefined;

	// keep overlay updated with current selectionData
	useEffect(() => {
		if (showOverlay) {
			inventoryOverlayStateAtom({
				visible: true,
				selectionData: inventoryMenuSelectionData,
				inventoryOverwrite:
					newTradeState.currentlySelectingFor === "other" ? newTradeState.selectedPlayerInventory : undefined,
				handleCloseButton: handleCloseInventory,
				scale: true,
			});
		}
	}, [inventoryMenuSelectionData]);

	// Retain original behaviour of flashing menu on relevant state changes
	useEffect(() => {
		flashMenu();
	}, [currentSelectedPlayer, newTradeState.currentlySelectingFor, newTradeState.selectedPlayerInventory, flashMenu]);

	// mount/unmount cleanup
	useEffect(() => {
		if (!showOverlay) return;
		return () => {
			inventoryOverlayStateAtom(undefined);
		};
	}, [showOverlay]);

	return (
		<MenuCore scale={false}>
			<PlayerGrid
				visible={
					visible &&
					currentSelectedPlayer === undefined &&
					newTradeState.selectedPlayerInventory === undefined
				}
				openProfileClicked={handleProfileCardClicked}
				tradeButtonClicked={handleTradeButtonClicked}
			>
				<uiscale Scale={pxScale()} />
			</PlayerGrid>
			<PlayerProfile
				visible={
					visible &&
					currentSelectedPlayer !== undefined &&
					newTradeState.selectedPlayerInventory === undefined
				}
			>
				<uiscale Scale={pxScale()} />
			</PlayerProfile>
			<CreateTrade
				visible={
					visible &&
					currentSelectedPlayer !== undefined &&
					newTradeState.currentlySelectingFor === "none" &&
					newTradeState.selectedPlayerInventory !== undefined
				}
				flashMenu={flashMenu}
			>
				<uiscale Scale={pxScale()} />
			</CreateTrade>
		</MenuCore>
	);
});
