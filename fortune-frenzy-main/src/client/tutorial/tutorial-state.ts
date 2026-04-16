import { atom, peek } from "@rbxts/charm";
import { Item } from "typings/APIResponses";
import { isItemDirectShopPurchaseBlocked } from "shared/util/is-item-direct-shop-blocked";
import {
	activeMenuAtom,
	activeMarketplacePageAtom,
	coinflipStateAtom,
	inventoryOverlayStateAtom,
	isNavigationVisibleAtom,
} from "client/utils/global-state";
import { MARKETPLACE_ITEM_PAGE_BUY } from "shared/util/strings";

/** Prefer an item near this value (~$1k) for the forced direct-buy tutorial step. */
const TUTORIAL_DIRECT_BUY_TARGET_VALUE = 1000;
const TUTORIAL_DIRECT_BUY_VALUE_MIN = 400;
const TUTORIAL_DIRECT_BUY_VALUE_MAX = 2500;

/**
 * Picks one catalog item suitable for the direct-buy tutorial: near target value, shop-eligible, shown in grid.
 */
export function resolveTutorialMarketplaceDirectBuyItemId(items: ReadonlyMap<string, Item>): string | undefined {
	let bestId: string | undefined;
	let bestScore = math.huge;
	items.forEach((item, id) => {
		const value = item.value ?? 0;
		if (value < TUTORIAL_DIRECT_BUY_VALUE_MIN || value > TUTORIAL_DIRECT_BUY_VALUE_MAX) return;
		if (item.total_unboxed === 0 && item.category === "classic") return;
		if (isItemDirectShopPurchaseBlocked(item)) return;
		const score = math.abs(value - TUTORIAL_DIRECT_BUY_TARGET_VALUE);
		if (score < bestScore) {
			bestScore = score;
			bestId = id;
		}
	});
	if (bestId) return bestId;

	bestScore = math.huge;
	items.forEach((item, id) => {
		if (isItemDirectShopPurchaseBlocked(item)) return;
		const value = item.value ?? 0;
		if (value <= 0) return;
		const score = math.abs(value - TUTORIAL_DIRECT_BUY_TARGET_VALUE);
		if (score < bestScore) {
			bestScore = score;
			bestId = id;
		}
	});
	return bestId;
}

export type TutorialActionId =
	| "open_minigames_menu"
	| "open_item_cases_menu"
	| "select_case"
	| "open_case"
	| "claim_case"
	| "open_inventory_menu"
	| "open_marketplace_menu"
	| "marketplace_pick_tutorial_item"
	| "marketplace_open_buy_tab"
	| "marketplace_click_direct_purchase"
	| "marketplace_confirm_direct_buy"
	| "open_minigames_menu_coinflip"
	| "open_coinflip_hub"
	| "coinflip_create_complete"
	| "coinflip_call_bot_success";

/** Overlay dims the whole screen with no cutout (instructions-only step). */
export const TUTORIAL_NO_HIGHLIGHT_TARGET = "__tutorial_no_highlight__" as const;

export const TUTORIAL_TARGET_IDS = {
	sidebarMinigames: "tutorial-target-sidebar-minigames",
	sidebarInventory: "tutorial-target-sidebar-inventory",
	sidebarMarketplace: "tutorial-target-sidebar-marketplace",
	minigamesItemCases: "tutorial-target-minigames-itemcases",
	minigamesCoinflip: "tutorial-target-minigames-coinflip",
	caseSelectorPrimary: "tutorial-target-case-selector-primary",
	caseOpenButton: "tutorial-target-case-open",
	caseClaimButton: "tutorial-target-case-claim",
	coinflipCreateButton: "tutorial-target-coinflip-create",
	coinflipCallBotButton: "tutorial-target-coinflip-call-bot",
	marketplaceTutorialItemTile: "tutorial-target-marketplace-tutorial-item",
	marketplaceBuyTab: "tutorial-target-marketplace-buy-tab",
	marketplaceDirectPurchaseButton: "tutorial-target-marketplace-direct-purchase",
	marketplaceConfirmPurchaseButton: "tutorial-target-marketplace-confirm-purchase",
	/** Coinflip stake overlay: the item bought during the marketplace tutorial step. */
	coinflipStakePurchasedItem: "tutorial-target-coinflip-stake-purchased-item",
} as const;

export type TutorialTargetId = (typeof TUTORIAL_TARGET_IDS)[keyof typeof TUTORIAL_TARGET_IDS];

export type TutorialStep = {
	actionId: TutorialActionId;
	targetId: TutorialTargetId | typeof TUTORIAL_NO_HIGHLIGHT_TARGET;
	title: string;
	description: string;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
	{
		actionId: "open_minigames_menu",
		targetId: TUTORIAL_TARGET_IDS.sidebarMinigames,
		title: "Open Minigames",
		description: "Tap the Minigames button on the sidebar to open the games hub.",
	},
	{
		actionId: "open_item_cases_menu",
		targetId: TUTORIAL_TARGET_IDS.minigamesItemCases,
		title: "Enter Item Cases",
		description: "Tap Item Cases in this list to open the case menu.",
	},
	{
		actionId: "select_case",
		targetId: TUTORIAL_TARGET_IDS.caseSelectorPrimary,
		title: "Pick Your First Case",
		description: "Select this starter case to preview its drops and opening price.",
	},
	{
		actionId: "open_case",
		targetId: TUTORIAL_TARGET_IDS.caseOpenButton,
		title: "Open The Case",
		description: "Tap Open to spin. Case odds are value-weighted, so lower-value drops appear more often.",
	},
	{
		actionId: "claim_case",
		targetId: TUTORIAL_TARGET_IDS.caseClaimButton,
		title: "Claim Your Drop",
		description: "Claim your item to add it into your inventory.",
	},
	{
		actionId: "open_inventory_menu",
		targetId: TUTORIAL_TARGET_IDS.sidebarInventory,
		title: "Open Inventory",
		description: "Tap Inventory to see the item you just unboxed.",
	},
	{
		actionId: "open_marketplace_menu",
		targetId: TUTORIAL_TARGET_IDS.sidebarMarketplace,
		title: "Open Marketplace",
		description: "Open Marketplace to browse the item catalog (every tradeable item).",
	},
	{
		actionId: "marketplace_pick_tutorial_item",
		targetId: TUTORIAL_TARGET_IDS.marketplaceTutorialItemTile,
		title: "Pick the highlighted item",
		description:
			"Only the highlighted tile can be tapped. It is a ~$1k-style direct-buy deal — other items are locked until you finish this step.",
	},
	{
		actionId: "marketplace_open_buy_tab",
		targetId: TUTORIAL_TARGET_IDS.marketplaceBuyTab,
		title: "Open the Buy tab",
		description: "Switch from Resellers to Buy to use the shop’s instant purchase (100% fee over value).",
	},
	{
		actionId: "marketplace_click_direct_purchase",
		targetId: TUTORIAL_TARGET_IDS.marketplaceDirectPurchaseButton,
		title: "Direct purchase",
		description: "Tap Purchase to review the price (value + 100% fee), then confirm.",
	},
	{
		actionId: "marketplace_confirm_direct_buy",
		targetId: TUTORIAL_TARGET_IDS.marketplaceConfirmPurchaseButton,
		title: "Confirm purchase",
		description: "Tap Confirm to complete your direct buy.",
	},
	{
		actionId: "open_minigames_menu_coinflip",
		targetId: TUTORIAL_TARGET_IDS.sidebarMinigames,
		title: "Back to Minigames",
		description: "Open Minigames again — next you'll try Coinflip.",
	},
	{
		actionId: "open_coinflip_hub",
		targetId: TUTORIAL_TARGET_IDS.minigamesCoinflip,
		title: "Open Coinflip",
		description: "Tap Coinflip here to open the coinflip lobby.",
	},
	{
		actionId: "coinflip_create_complete",
		targetId: TUTORIAL_TARGET_IDS.coinflipCreateButton,
		title: "Create a coinflip",
		description:
			"Tap Create, then select the highlighted item you bought in the tutorial (tap Next when ready).",
	},
	{
		actionId: "coinflip_call_bot_success",
		targetId: TUTORIAL_TARGET_IDS.coinflipCallBotButton,
		title: "Call a bot",
		description:
			"While you're learning, Call Bot works once without VIP. After the tutorial, Call Bot needs VIP.",
	},
];

export type TutorialRewardSummary = {
	cash: number;
	gems: number;
	itemId?: string;
};

/** Shown on the pre-tutorial offer modal (from server). */
export type TutorialOfferRewardPreview = {
	cash: number;
	gems: number;
	itemName?: string;
};

export type TutorialState = {
	active: boolean;
	completed: boolean;
	/** Server says the guided tour may be offered (new player); used to defer mobile menu upscale until resolved. */
	should_show_guided: boolean;
	completionPending: boolean;
	stepIndex: number;
	reward?: TutorialRewardSummary;
	/** Bonus text for the login offer; cleared when the tour starts or is declined. */
	offerRewardPreview?: TutorialOfferRewardPreview;
};

export const tutorialStateAtom = atom<TutorialState>({
	active: false,
	completed: false,
	should_show_guided: false,
	completionPending: false,
	stepIndex: 0,
	reward: undefined,
	offerRewardPreview: undefined,
});

export const tutorialCompletionRequestAtom = atom(0);

/** Full-screen offer before `startTutorialFlow` (after Daily Reward). */
export const tutorialOfferVisibleAtom = atom(false);

/** Set when the player completes the tutorial direct buy; used to spotlight that item in the coinflip stake picker. */
export const tutorialPurchasedItemIdAtom = atom<string | undefined>(undefined);

/** While the tutorial overlay is visible or completion is in flight — block menu X / `handleCloseButton` dismissals. */
export function isTutorialBlockingMenuClose(): boolean {
	const s = peek(tutorialStateAtom);
	return s.active || s.completionPending;
}

const tutorialTargets = new Map<string, GuiObject>();

export function registerTutorialTarget(targetId: string, target: GuiObject) {
	tutorialTargets.set(targetId, target);
}

export function unregisterTutorialTarget(targetId: string, target?: GuiObject) {
	if (!target) {
		tutorialTargets.delete(targetId);
		return;
	}

	const currentTarget = tutorialTargets.get(targetId);
	if (currentTarget === target) {
		tutorialTargets.delete(targetId);
	}
}

export function getTutorialTarget(targetId: string) {
	if (targetId === TUTORIAL_NO_HIGHLIGHT_TARGET) return undefined;
	return tutorialTargets.get(targetId);
}

function applyTutorialStepState(stepIndex: number) {
	const step = TUTORIAL_STEPS[stepIndex];
	if (!step) return;

	switch (step.actionId) {
		case "open_minigames_menu":
			activeMenuAtom("");
			isNavigationVisibleAtom(true);
			break;
		case "open_item_cases_menu":
			activeMenuAtom("Minigames");
			isNavigationVisibleAtom(true);
			break;
		case "select_case":
		case "open_case":
		case "claim_case":
			activeMenuAtom("ItemCases");
			isNavigationVisibleAtom(true);
			break;
		case "open_inventory_menu":
			isNavigationVisibleAtom(true);
			break;
		// Do not call activeMenuAtom here for sidebar-driven steps — advancing would switch menus for the player
		// and force a second sidebar click (e.g. Inventory → auto Marketplace, or post-buy → auto Minigames).
		case "open_marketplace_menu":
			isNavigationVisibleAtom(true);
			break;
		case "marketplace_pick_tutorial_item":
			isNavigationVisibleAtom(true);
			break;
		case "marketplace_open_buy_tab":
			isNavigationVisibleAtom(true);
			break;
		case "marketplace_click_direct_purchase":
			isNavigationVisibleAtom(true);
			activeMarketplacePageAtom(MARKETPLACE_ITEM_PAGE_BUY);
			break;
		case "marketplace_confirm_direct_buy":
			isNavigationVisibleAtom(true);
			activeMarketplacePageAtom(MARKETPLACE_ITEM_PAGE_BUY);
			break;
		case "open_minigames_menu_coinflip":
			isNavigationVisibleAtom(true);
			break;
		case "open_coinflip_hub":
			isNavigationVisibleAtom(true);
			break;
		case "coinflip_create_complete":
		case "coinflip_call_bot_success":
			activeMenuAtom("Coinflip");
			isNavigationVisibleAtom(true);
			break;
	}
}

export function startTutorialFlow() {
	const currentState = peek(tutorialStateAtom);
	if (currentState.completed) return;

	tutorialPurchasedItemIdAtom(undefined);
	tutorialOfferVisibleAtom(false);
	tutorialStateAtom({
		...currentState,
		active: true,
		completionPending: false,
		stepIndex: 0,
		reward: undefined,
		offerRewardPreview: undefined,
	});
	applyTutorialStepState(0);
}

export type TutorialServerState = {
	completed: boolean;
	shouldShow: boolean;
	rewardPreview?: { cash: number; gems: number; item_name?: string };
};

function mapRewardPreviewFromServer(
	preview?: { cash: number; gems: number; item_name?: string },
): TutorialOfferRewardPreview | undefined {
	if (!preview) return undefined;
	return {
		cash: preview.cash,
		gems: preview.gems,
		...(preview.item_name !== undefined && preview.item_name.size() > 0
			? { itemName: preview.item_name }
			: {}),
	};
}

export function applyTutorialServerState(serverState: TutorialServerState, autoStart = true) {
	const currentState = peek(tutorialStateAtom);
	tutorialPurchasedItemIdAtom(undefined);
	tutorialStateAtom({
		...currentState,
		active: false,
		completed: serverState.completed,
		should_show_guided: serverState.shouldShow,
		completionPending: false,
		stepIndex: 0,
		reward: undefined,
		offerRewardPreview: mapRewardPreviewFromServer(serverState.rewardPreview),
	});

	if (serverState.shouldShow && !serverState.completed && autoStart) {
		startTutorialFlow();
	}
}

/** After Daily Reward closes, show the guided tour offer instead of starting immediately. */
export function openTutorialOffer() {
	tutorialOfferVisibleAtom(true);
}

export function isTutorialInteractionBlocked(actionId?: TutorialActionId) {
	const state = peek(tutorialStateAtom);
	if (!state.active) return false;

	const currentStep = TUTORIAL_STEPS[state.stepIndex];
	if (!currentStep) return false;

	// Coinflip create: inventory tiles have no tutorialActionId — allow picking stakes while the overlay is open.
	if (
		!actionId &&
		currentStep.actionId === "coinflip_create_complete" &&
		peek(coinflipStateAtom) === "create" &&
		peek(inventoryOverlayStateAtom)?.visible === true
	) {
		return false;
	}

	if (!actionId) return true;

	return currentStep.actionId !== actionId;
}

export function advanceTutorialAction(actionId: TutorialActionId) {
	const state = peek(tutorialStateAtom);
	if (!state.active) return false;

	const currentStep = TUTORIAL_STEPS[state.stepIndex];
	if (!currentStep || currentStep.actionId !== actionId) return false;

	const nextStepIndex = state.stepIndex + 1;
	if (nextStepIndex >= TUTORIAL_STEPS.size()) {
		tutorialStateAtom({
			...state,
			active: false,
			should_show_guided: state.should_show_guided,
			completionPending: true,
			stepIndex: nextStepIndex,
		});
		tutorialCompletionRequestAtom(peek(tutorialCompletionRequestAtom) + 1);
		return true;
	}

	tutorialStateAtom({
		...state,
		stepIndex: nextStepIndex,
	});
	applyTutorialStepState(nextStepIndex);
	return true;
}

export function finishTutorialFlow(success: boolean, reward?: TutorialRewardSummary) {
	const state = peek(tutorialStateAtom);
	tutorialPurchasedItemIdAtom(undefined);
	tutorialOfferVisibleAtom(false);
	tutorialStateAtom({
		...state,
		active: false,
		should_show_guided: success ? false : state.should_show_guided,
		completionPending: false,
		completed: success,
		reward,
		offerRewardPreview: undefined,
	});

	isNavigationVisibleAtom(true);
}
