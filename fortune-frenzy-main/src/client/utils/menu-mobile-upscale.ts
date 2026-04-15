import { UserInputService, Workspace } from "@rbxts/services";

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
