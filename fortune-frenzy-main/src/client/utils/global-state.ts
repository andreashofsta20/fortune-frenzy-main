import { atom } from "@rbxts/charm";

/** Navigation State */
export const activeMenuAtom = atom<string>("");
export const previousMenuAtom = atom("");
export const isNavigationVisibleAtom = atom<boolean>(true);
export const marketplaceBackContextAtom = atom<string>("marketplace");

/** UI Effects & Overlays */
export const overlayTransparencyAtom = atom<number>(1);
export const isLoadingAtom = atom<boolean>(false);
export const menuUpscaledAtom = atom<boolean>(false);

/** Marketplace State */
export const marketplaceStatusAtom = atom<string>("none");
export const activeMarketplacePageAtom = atom<string>("Resellers");

/** Coinflip Menu State */
export const coinflipStateAtom = atom<"default" | "create" | "joining" | "viewing" | "loading">("default");
export const coinflipIdAtom = atom<string>("none");
export const coinAtom = atom<"Heads" | "Tails">("Heads");
export const selectionDataAtom = atom<
	| {
			maximumValue: number;
			maximumPerItem: number;
			totalMaximum: number;
			autoSelectButtonMode?: "random" | "max";
			autoSelectButtonText?: string;
			minimumValue: number;
			title?: string;
			buttonText?: string;
			autoSelectButtonVisible?: boolean;
	  }
	| undefined
>(undefined);

/** Inventory Menu State */
export const inventorySearchAtom = atom<string>("");
export const inventorySortOrderAtom = atom<"value_high" | "value_low" | "rarity_high" | "rarity_low">("value_high");
export const inventorySelectedTileAtom = atom<string>("");
export const inventoryHoveringTileAtom = atom<string>("");
export const inventoryCanvasPositionAtom = atom<Vector2>(new Vector2(0, 0));
export const inventorySelectionAtom = atom<Record<string, number>>({});
export const inventoryOverlayStateAtom = atom<
	| {
			visible: boolean;
			selectionData?: unknown;
			inventoryOverwrite?: Map<string, string[]>;
			handleCloseButton?: () => void;
			scale?: boolean;
	  }
	| undefined
>(undefined);

/** Profiles Menu State */
export const currentSelectedPlayerAtom = atom<string | undefined>(undefined);

export const newTradeStateAtom = atom({
	selectedPlayerInventory: undefined as Map<string, string[]> | undefined,
	currentlySelectingFor: "none" as "none" | "local" | "other",
	localSelection: {} as Record<string, number>,
	otherSelection: {} as Record<string, number>,
	otherPlayerInfo: {
		userId: "",
		username: "",
		display_name: "",
	},
});

/** Jackpot Menu State */
export const jackpotSelectionDataAtom = atom<
	| {
			maximumValue: number;
			maximumPerItem: number;
			totalMaximum: number;
			minimumValue: number;
			title?: string;
			buttonText?: string;
			autoSelectButtonMode?: "random" | "max";
			autoSelectButtonText?: string;
			autoSelectButtonVisible?: boolean;
	  }
	| undefined
>(undefined);

