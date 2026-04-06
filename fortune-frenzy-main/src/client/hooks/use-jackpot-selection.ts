import { useEffect, useMemo, useState } from "@rbxts/react";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core/out/modding";

/**
 * Handles jackpot selection state and live updates coming from ClientStateController events.
 *
 * @param onJackpotSelected   Optional callback invoked any time a new jackpot is selected.
 */
export const useJackpotSelection = (onJackpotSelected?: () => void) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [selectedJackpotId, setSelectedJackpotId] = useState<string | undefined>(undefined);
	const [updateCounter, setUpdateCounter] = useState(0);

	useEffect(() => {
		const selectionConn = clientStateController.JackpotSelectedEvent.Connect((id) => {
			if (id === selectedJackpotId) return;
			setSelectedJackpotId(id);
			onJackpotSelected?.();
		});

		const changedConn = clientStateController.JackpotChangedEvent.Connect((jackpots) => {
			if (!selectedJackpotId) return;
			const hasUpdate = jackpots.some((j) => j.id === selectedJackpotId);
			if (hasUpdate) {
				setUpdateCounter((v) => v + 1);
				return;
			}

			// If the selected pot was removed, clear the selection so UI can return to the grid.
			setSelectedJackpotId(undefined);
		});

		return () => {
			selectionConn.Disconnect();
			changedConn.Disconnect();
		};
	}, [selectedJackpotId]);

	const currentJackpot = useMemo(() => {
		if (!selectedJackpotId) return undefined;
		return clientStateController.Jackpots.find((j) => j.id === selectedJackpotId);
	}, [selectedJackpotId, updateCounter]);

	const deselectJackpot = () => setSelectedJackpotId(undefined);

	return {
		selectedJackpotId,
		currentJackpot,
		deselectJackpot,
	};
};
