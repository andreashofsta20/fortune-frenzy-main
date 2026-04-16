import { peek, subscribe } from "@rbxts/charm";
import { UserInputService, Workspace } from "@rbxts/services";
import { tutorialOfferVisibleAtom, tutorialStateAtom } from "client/tutorial/tutorial-state";
import { menuUpscaledAtom } from "client/utils/global-state";

/** Shortest viewport side (px) at or below this ⇒ treat as phone / small tablet for menu upscale. */
export const MOBILE_MENU_SHORT_SIDE_MAX = 820;

/** Menu UIScale when upscaled on keyboard-mouse primary devices. */
export const MENU_UPSCALE_DESKTOP = 1.12;

/** Menu UIScale when upscaled on touch-primary small screens (phones / most tablets in portrait). */
export const MENU_UPSCALE_MOBILE = 1.24;

/** Minimum side length (px) for close / upscale toolbar icons on touch-small UI (readable tap targets). */
export const MOBILE_TOOLBAR_ICON_MIN_PX = 44;

export function computeIsTouchMenuMobile(viewport: Vector2): boolean {
	return UserInputService.TouchEnabled && math.min(viewport.X, viewport.Y) <= MOBILE_MENU_SHORT_SIDE_MAX;
}

/** Snapshot using `Workspace.CurrentCamera` if available (e.g. before first React frame). */
export function computeIsTouchMenuMobileNow(): boolean {
	const cam = Workspace.CurrentCamera;
	if (!cam) return false;
	return computeIsTouchMenuMobile(cam.ViewportSize);
}

export function computeMenuHolderScale(upscaled: boolean, touchMobile: boolean): number {
	if (!upscaled) return 1;
	return touchMobile ? MENU_UPSCALE_MOBILE : MENU_UPSCALE_DESKTOP;
}

/** While the guided tour is pending or running, keep menus at 1x so mobile “upscale” does not break tutorial UI. */
export function shouldDeferTouchMobileMenuUpscaleForTutorial(): boolean {
	if (peek(tutorialOfferVisibleAtom)) return true;
	const t = peek(tutorialStateAtom);
	if (t.active) return true;
	if (t.should_show_guided && !t.completed) return true;
	return false;
}

/** Matches previous App startup behavior, but only after the guided tutorial is finished or declined. */
export function syncTouchMobileMenuDefaultUpscaleWithTutorial(): void {
	if (!computeIsTouchMenuMobileNow()) return;
	if (shouldDeferTouchMobileMenuUpscaleForTutorial()) {
		menuUpscaledAtom(false);
		return;
	}
	menuUpscaledAtom(true);
}

let touchMobileMenuUpscaleTutorialSyncStarted = false;

/** Subscribe once so touch-primary devices auto-upscale after onboarding (and turn off upscale during the tour). */
export function ensureTouchMobileMenuUpscaleTutorialSync(): void {
	if (touchMobileMenuUpscaleTutorialSyncStarted) return;
	touchMobileMenuUpscaleTutorialSyncStarted = true;
	const run = () => syncTouchMobileMenuDefaultUpscaleWithTutorial();
	subscribe(tutorialStateAtom, run);
	subscribe(tutorialOfferVisibleAtom, run);
	task.defer(run);
}
