import { useEffect, useMemo, useState } from "@rbxts/react";
import { ClientStateController } from "client/controllers/ClientStateController";
import { Modding } from "@flamework/core/out/modding";

/**
 * Handles battle selection state and live updates coming from ClientStateController events.
 *
 * @param onBattleSelected   Optional callback invoked any time a new battle is selected.
 */
export const useCaseBattleSelection = (onBattleSelected?: () => void) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);
	const [selectedBattleId, setSelectedBattleId] = useState<string | undefined>(undefined);
	const [updateCounter, setUpdateCounter] = useState(0);

	useEffect(() => {
		const selectionConn = clientStateController.CaseBattleSelectedEvent.Connect((id) => {
			if (id === selectedBattleId) return;
			setSelectedBattleId(id);
			onBattleSelected?.();
		});

		const changedConn = clientStateController.CaseBattleChangedEvent.Connect((battles) => {
			if (!selectedBattleId) return;
			const hasUpdate = battles.some((b) => b.id === selectedBattleId);
			if (hasUpdate) setUpdateCounter((v) => v + 1);
		});

		return () => {
			selectionConn.Disconnect();
			changedConn.Disconnect();
		};
	}, [selectedBattleId]);

	const currentBattle = useMemo(() => {
		if (!selectedBattleId) return undefined;
		return clientStateController.CaseBattles.find((b) => b.id === selectedBattleId);
	}, [selectedBattleId, updateCounter]);

	const deselectBattle = () => setSelectedBattleId(undefined);

	return {
		selectedBattleId,
		currentBattle,
		deselectBattle,
	};
};
