import React, { memo, useCallback, useMemo } from "@rbxts/react";
import { usePx } from "client/hooks/use-px";
import { Modding } from "@flamework/core";
import { ClientStateController } from "client/controllers/ClientStateController";
import {
	parseCasesData,
	calculateCasesStats,
	CASES_LIMIT,
	UNIQUE_CASES_LIMIT,
	MAX_CASE_SLOTS,
} from "../../utils/battle-builder-utils";
import { EmptySlot } from "./EmptySlot";
import { CaseSlot } from "./CaseSlot";

interface Props {
	cases: Record<string, string>;
	setCurrentPage: (page: "grid" | "builder" | "case-selector") => void;
	handleCaseChange: (method: "add" | "sub", caseId: string, quantity: number) => void;
}

export const CaseCards = memo(({ cases, setCurrentPage, handleCaseChange }: Props) => {
	const px = usePx();
	const clientStateController = Modding.resolveSingleton(ClientStateController);

	// Memoize case entries
	const caseEntries = useMemo(() => parseCasesData(cases), [cases]);

	// Memoize case stats
	const { totalCases, uniqueCases } = useMemo(() => calculateCasesStats(cases), [cases]);
	const canAddMoreCases = totalCases < CASES_LIMIT && uniqueCases < UNIQUE_CASES_LIMIT;

	// Memoize expanded cases array
	const expandedCases = useMemo(() => {
		const slots: Array<string | 0> = new Array(MAX_CASE_SLOTS);
		for (let i = 0; i < MAX_CASE_SLOTS; i++) {
			slots[i] = 0;
		}
		caseEntries.forEach((entry) => {
			if (entry.index < MAX_CASE_SLOTS) {
				slots[entry.index] = entry.id;
			}
		});
		return slots;
	}, [caseEntries]);

	const handleAddCase = useCallback(() => {
		setCurrentPage("case-selector");
	}, [setCurrentPage]);

	return (
		<frame
			BackgroundTransparency={1}
			Position={new UDim2(0, px(24), 0, px(133))}
			Size={new UDim2(0, px(670), 0, px(313))}
		>
			<uigridlayout
				CellPadding={UDim2.fromOffset(12, 12)}
				CellSize={UDim2.fromOffset(215, 153)}
				SortOrder={Enum.SortOrder.LayoutOrder}
			/>
			{expandedCases.map((caseId: string | 0, index: number) => {
				if (caseId === 0) {
					return <EmptySlot key={`empty-${index}`} onClick={handleAddCase} canAddMore={canAddMoreCases} />;
				}

				const caseData = clientStateController.CaseBattleCases.find((c) => c.id === caseId);
				const caseEntry = caseEntries.find((entry) => entry.id === caseId);

				if (!caseData || !caseEntry) {
					return <EmptySlot key={`invalid-${index}`} onClick={handleAddCase} canAddMore={canAddMoreCases} />;
				}

				const canAddMore = totalCases < CASES_LIMIT;

				return (
					<CaseSlot
						key={caseId}
						caseData={caseData}
						quantity={caseEntry.quantity}
						index={index}
						handleCaseChange={handleCaseChange}
						topEnabled={canAddMore}
						bottomEnabled={true}
					/>
				);
			})}
		</frame>
	);
});
