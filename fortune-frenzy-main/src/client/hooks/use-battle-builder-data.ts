import { useCallback, useState, useMemo, useEffect } from "@rbxts/react";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import { addCommasToNumber } from "shared/util/number-utils";
import {
	BattleData,
	CASES_LIMIT,
	UNIQUE_CASES_LIMIT,
	parseCaseValue,
	formatCaseValue,
	calculateCasesStats,
	reindexCases,
} from "client/utils/battle-builder-utils";
import { CaseBattleData } from "typings/APIResponses";

export const useBattleData = (setCurrentPage: (page: "grid" | "builder" | "case-selector") => void) => {
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	const [battleData, setBattleData] = useState<BattleData>({
		mode: "Standard",
		cases: {},
		team_mode: "1v1",
		crazy: false,
		fast_mode: false,
	});

	const totalCostValue = useMemo(() => {
		let value = 0;
		for (const [caseId, quantityIndexStr] of pairs(battleData.cases)) {
			const { quantity } = parseCaseValue(quantityIndexStr);
			const caseData = clientStateController.CaseBattleCases.find((c) => c.id === caseId);
			if (caseData) {
				value += caseData.price * quantity;
			}
		}
		return value;
	}, [battleData.cases, clientStateController.CaseBattleCases]);

	const totalCost = useMemo(() => `Total Cost: $${addCommasToNumber(totalCostValue)}`, [totalCostValue]);

	const currentCasesCount = useMemo(() => {
		const { totalCases } = calculateCasesStats(battleData.cases);
		return totalCases;
	}, [battleData.cases]);

	const handleCaseChange = useCallback(
		(method: "add" | "sub", caseId: string, quantity: number) => {
			setBattleData((prev) => {
				const newCases = { ...prev.cases };
				const currentValue = newCases[caseId];
				const { quantity: currentQuantity, index: currentIndex } = currentValue
					? parseCaseValue(currentValue)
					: { quantity: 0, index: 0 };

				const { totalCases, uniqueCases, maxIndex } = calculateCasesStats(newCases);

				if (method === "add") {
					const maxCanAdd = CASES_LIMIT - totalCases;
					const toAdd = math.min(quantity, maxCanAdd);
					if (currentQuantity === 0 && uniqueCases >= UNIQUE_CASES_LIMIT) return prev;
					if (toAdd > 0) {
						const assignedIndex = currentQuantity === 0 ? maxIndex + 1 : currentIndex;
						newCases[caseId] = formatCaseValue(currentQuantity + toAdd, assignedIndex);
					}
				} else if (method === "sub") {
					const toRemove = math.min(quantity, currentQuantity);
					const newQuantity = currentQuantity - toRemove;

					if (newQuantity <= 0) {
						delete newCases[caseId];
						return { ...prev, cases: reindexCases(newCases) };
					} else {
						newCases[caseId] = formatCaseValue(newQuantity, currentIndex);
					}
				}

				return { ...prev, cases: newCases };
			});

			setCurrentPage("builder");
		},
		[setCurrentPage],
	);

	const handleTeamModeChange = useCallback((order: string) => {
		setBattleData((prev) => ({
			...prev,
			team_mode: order as CaseBattleData["team_mode"],
		}));
	}, []);

	const handleCrazyModeChange = useCallback((value: string) => {
		setBattleData((prev) => ({
			...prev,
			crazy: value === "crazy_on",
		}));
	}, []);

	const handleGameModeChange = useCallback((value: string) => {
		setBattleData((prev) => ({
			...prev,
			mode: value as CaseBattleData["mode"],
		}));
	}, []);

	const resetBattleData = useCallback(() => {
		setBattleData({
			mode: "Standard",
			cases: {},
			team_mode: "1v1",
			crazy: false,
			fast_mode: false,
		});
	}, []);

	useEffect(() => {
		const connection = clientStateController.CaseBattleCaseChangedEvent.Connect(handleCaseChange);
		return () => connection.Disconnect();
	}, [clientStateController, handleCaseChange]);

	return {
		battleData,
		totalCost,
		totalCostValue,
		currentCasesCount,
		handleCaseChange,
		handleTeamModeChange,
		handleCrazyModeChange,
		handleGameModeChange,
		resetBattleData,
	};
};
