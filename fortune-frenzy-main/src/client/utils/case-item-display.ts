import { Item } from "typings/APIResponses";

/** One row from `Case.items` (API). */
export type CaseItemLine = {
	id: string;
	chance: number;
	claimed: number;
	value?: number;
};

export function assetIdFromCaseItemId(itemId: string): string {
	const segs = itemId.split("_");
	if (segs[0] === "limited" && segs[1] !== undefined) {
		const n = tonumber(segs[1]);
		if (n !== undefined) return tostring(n);
	}
	return "0";
}

export function fallbackItemForCaseLine(line: CaseItemLine): Item {
	const aid = assetIdFromCaseItemId(line.id);
	const label = aid !== "0" ? `Limited #${aid}` : line.id;
	return {
		id: line.id,
		asset_id: aid,
		name: label,
		creator: "",
		description: "",
		average_price: 0,
		total_unboxed: 0,
		maximum_copies: 0,
		value: line.value ?? 0,
		created_at: "",
		updated_at: "",
		color: "#9aa6b2",
		category: aid !== "0" ? "limited" : "default",
	};
}

export function resolveDisplayItemForCaseLine(line: CaseItemLine, catalog: Item | undefined): Item {
	if (catalog) {
		return { ...catalog, value: line.value !== undefined ? line.value : catalog.value };
	}
	return fallbackItemForCaseLine(line);
}
