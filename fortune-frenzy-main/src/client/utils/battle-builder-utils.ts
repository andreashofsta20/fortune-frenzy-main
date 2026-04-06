import { CaseBattleData } from "typings/APIResponses";

// Constants
export const CASES_LIMIT = 40;
export const UNIQUE_CASES_LIMIT = 6;
export const MAX_CASE_SLOTS = 6;

// Types
export interface CaseEntry {
	id: string;
	quantity: number;
	index: number;
}

export type BattleData = {
	mode: CaseBattleData["mode"];
	cases: Record<string, string>;
	team_mode: CaseBattleData["team_mode"];
	crazy: boolean;
	fast_mode: boolean;
};

// Utility functions
export const parseCaseValue = (value: string): { quantity: number; index: number } => {
	const [quantityStr, indexStr] = value.split("-");
	return {
		quantity: tonumber(quantityStr) || 0,
		index: tonumber(indexStr) || 0,
	};
};

export const formatCaseValue = (quantity: number, index: number): string => {
	return `${quantity}-${index}`;
};

export const parseCasesData = (cases: Record<string, string>): CaseEntry[] => {
	const entries: CaseEntry[] = [];
	for (const [caseId, value] of pairs(cases)) {
		const { quantity, index } = parseCaseValue(value);
		entries.push({ id: caseId, quantity, index });
	}
	return entries.sort((a, b) => a.index < b.index);
};

export const calculateCasesStats = (cases: Record<string, string>) => {
	let totalCases = 0;
	let uniqueCases = 0;
	let maxIndex = -1;

	for (const [_, value] of pairs(cases)) {
		const { quantity, index } = parseCaseValue(value);
		totalCases += quantity;
		uniqueCases++;
		maxIndex = math.max(maxIndex, index);
	}

	return { totalCases, uniqueCases, maxIndex };
};

export const reindexCases = (cases: Record<string, string>): Record<string, string> => {
	const entries = parseCasesData(cases);
	const newCases: Record<string, string> = {};

	entries.forEach((entry, index) => {
		newCases[entry.id] = formatCaseValue(entry.quantity, index);
	});

	return newCases;
};
