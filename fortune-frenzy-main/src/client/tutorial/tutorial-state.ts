import { atom, peek } from "@rbxts/charm";
import { activeMenuAtom, isNavigationVisibleAtom } from "client/utils/global-state";

export type TutorialActionId =
	| "open_minigames_menu"
	| "open_item_cases_menu"
	| "select_case"
	| "open_case"
	| "claim_case"
	| "open_inventory_menu";

export const TUTORIAL_TARGET_IDS = {
	sidebarMinigames: "tutorial-target-sidebar-minigames",
	minigamesItemCases: "tutorial-target-minigames-itemcases",
	sidebarInventory: "tutorial-target-sidebar-inventory",
	caseSelectorPrimary: "tutorial-target-case-selector-primary",
	caseOpenButton: "tutorial-target-case-open",
	caseClaimButton: "tutorial-target-case-claim",
} as const;

export type TutorialTargetId = (typeof TUTORIAL_TARGET_IDS)[keyof typeof TUTORIAL_TARGET_IDS];

export type TutorialStep = {
	actionId: TutorialActionId;
	targetId: TutorialTargetId;
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
		description: "Tap Inventory to view your newly claimed item.",
	},
];

export type TutorialRewardSummary = {
	cash: number;
	gems: number;
	itemId?: string;
};

export type TutorialState = {
	active: boolean;
	completed: boolean;
	completionPending: boolean;
	stepIndex: number;
	reward?: TutorialRewardSummary;
};

export const tutorialStateAtom = atom<TutorialState>({
	active: false,
	completed: false,
	completionPending: false,
	stepIndex: 0,
	reward: undefined,
});

export const tutorialCompletionRequestAtom = atom(0);

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
	}
}

export function startTutorialFlow() {
	const currentState = peek(tutorialStateAtom);
	if (currentState.completed) return;

	tutorialStateAtom({
		...currentState,
		active: true,
		completionPending: false,
		stepIndex: 0,
		reward: undefined,
	});
	applyTutorialStepState(0);
}

export function applyTutorialServerState(serverState: { completed: boolean; shouldShow: boolean }, autoStart = true) {
	const currentState = peek(tutorialStateAtom);
	tutorialStateAtom({
		...currentState,
		active: false,
		completed: serverState.completed,
		completionPending: false,
		stepIndex: 0,
		reward: undefined,
	});

	if (serverState.shouldShow && !serverState.completed && autoStart) {
		startTutorialFlow();
	}
}

export function isTutorialInteractionBlocked(actionId?: TutorialActionId) {
	const state = peek(tutorialStateAtom);
	if (!state.active) return false;

	const currentStep = TUTORIAL_STEPS[state.stepIndex];
	if (!currentStep) return false;
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
	tutorialStateAtom({
		...state,
		active: false,
		completionPending: false,
		completed: success,
		reward,
	});

	isNavigationVisibleAtom(true);
}
