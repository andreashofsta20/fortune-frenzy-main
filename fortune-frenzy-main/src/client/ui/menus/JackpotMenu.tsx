import React, { useEffect, useMemo, useRef, useState } from "@rbxts/react";
import { MenuCore } from "../navigation/MenuCore";
import { palette } from "client/utils/palette";
import { usePx } from "client/hooks/use-px";
import { Corner } from "../tools/Corner";
import { JackpotGrid } from "../jackpot/JackpotGrid";
import { JackpotViewing } from "../jackpot/JackpotViewing";
import { useAtom } from "@rbxts/react-charm";
import {
	inventorySelectionAtom,
	jackpotSelectionDataAtom,
	inventoryOverlayStateAtom,
	isLoadingAtom,
} from "client/utils/global-state";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { requestServer } from "client/utils/send-function";
import { Functions } from "client/network";
import { Players } from "@rbxts/services";
import { JackpotData } from "typings/APIResponses";

interface Props {
	visible: boolean;
	flashMenu: () => void;
}

function JackpotMenuComponent({ visible, flashMenu }: Props) {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const px = usePx();
	const [currentPage, setCurrentPage] = useState<"grid" | "viewing" | "inventory">("grid");

	useEffect(() => {
		flashMenu();
	}, [currentPage]);

	const jackpotSelectionData = useAtom(jackpotSelectionDataAtom);
	const inventorySelection = useAtom(inventorySelectionAtom);
	const currentJackpotId = useRef<string | undefined>(undefined);

	const inventoryMenuSelectionData = useMemo(() => {
		return {
			maximumValue: jackpotSelectionData?.maximumValue ?? 0,
			maximumPerItem: jackpotSelectionData?.maximumPerItem ?? 0,
			totalMaximum: jackpotSelectionData?.totalMaximum ?? 0,
			minimumValue: jackpotSelectionData?.minimumValue ?? 0,
			title: jackpotSelectionData?.title,
			buttonText: jackpotSelectionData?.buttonText,
			autoSelectButtonMode: jackpotSelectionData?.autoSelectButtonMode,
			autoSelectButtonText: jackpotSelectionData?.autoSelectButtonText,
			currentSelection: inventorySelection,
			setCurrentSelection: inventorySelectionAtom,
			autoSelectButtonVisible: jackpotSelectionData?.autoSelectButtonVisible,
			confirmButtonEvent: async () => {
				if (!currentJackpotId.current) return;
				isLoadingAtom(true);
				const request = await requestServer(
					Functions.Jackpot.JoinPot,
					"Failed to join jackpot",
					currentJackpotId.current,
					inventorySelection,
				);

				if (request === -1) return isLoadingAtom(false);
				if (request.code !== 200) {
					isLoadingAtom(false);
					const notificationMessage =
						request.message ??
						`Failed to join jackpot${request.code !== undefined ? ` (Code ${request.code})` : ""}`;
					clientStateController.NotificationEvent.Fire(
						`<font color="#${palette.lossRed.ToHex()}">${notificationMessage}</font>`,
						"rbxassetid://134904801170653",
					);
				} else {
					await new Promise<void>((resolve) => {
						let resolved = false;
						const finish = () => {
							if (resolved) return;
							resolved = true;
							resolve();
						};

						const didJoinJackpot = (jp?: JackpotData) => {
							const currentJackpot =
								jp ??
								clientStateController.Jackpots.find(
									(jackpot) => jackpot.id === currentJackpotId.current,
								);

							return !!(
								currentJackpot &&
								currentJackpot.members.find(
									(member) => member.player.id === tostring(Players.LocalPlayer.UserId),
								) !== undefined
							);
						};

						if (didJoinJackpot()) {
							finish();
							return;
						}

						const connection = clientStateController.JackpotChangedEvent.Connect((jackpots) => {
							if (didJoinJackpot(jackpots.find((jackpot) => jackpot.id === currentJackpotId.current))) {
								connection.Disconnect();
								finish();
							}
						});

						task.delay(5, () => {
							connection.Disconnect();
							finish();
						});
					});

					isLoadingAtom(false);
					setCurrentPage("viewing");
					jackpotSelectionDataAtom(undefined);
					inventorySelectionAtom({});
				}
			},
			showMinOrMax: "max" as "min" | "max" | undefined,
		};
	}, [jackpotSelectionData, inventorySelection]);

	const showOverlay = visible && currentPage === "inventory";
	useEffect(() => {
		if (!showOverlay) return;

		inventoryOverlayStateAtom({
			visible: true,
			selectionData: inventoryMenuSelectionData,
			handleCloseButton: () => setCurrentPage("grid"),
			scale: true,
		});

		return () => {
			inventoryOverlayStateAtom(undefined);
			inventorySelectionAtom({});
		};
	}, [showOverlay]);

	useEffect(() => {
		if (!visible) return;

		const connection = clientStateController.JackpotSelectedEvent.Connect((id) => {
			currentJackpotId.current = id;
			setCurrentPage("viewing");
		});

		return () => connection.Disconnect();
	}, [visible]);

	useEffect(() => {
		if (showOverlay) {
			inventoryOverlayStateAtom({
				visible: true,
				selectionData: inventoryMenuSelectionData,
				handleCloseButton: () => setCurrentPage("grid"),
				scale: true,
			});
		}
	}, [inventoryMenuSelectionData]);

	return (
		<MenuCore>
			<JackpotGrid visible={currentPage === "grid" && visible} setCurrentPage={setCurrentPage} />
			<JackpotViewing visible={currentPage === "viewing" && visible} setCurrentPage={setCurrentPage} />
		</MenuCore>
	);
}

export const JackpotMenu = React.memo(JackpotMenuComponent);
