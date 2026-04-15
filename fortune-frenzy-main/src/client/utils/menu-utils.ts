import { activeMenuAtom, previousMenuAtom } from "./global-state";
import { peek } from "@rbxts/charm";
import { isTutorialBlockingMenuClose } from "client/tutorial/tutorial-state";

export const handleCloseButton = () => {
	if (isTutorialBlockingMenuClose()) return;

	const currentMenu = peek(activeMenuAtom);
	if (currentMenu === "") return;

	previousMenuAtom(currentMenu);
	activeMenuAtom("");
};

export const changeMenu = (menu: string) => {
	const currentMenu = peek(activeMenuAtom);
	if (currentMenu === menu) return;

	previousMenuAtom(currentMenu);
	activeMenuAtom(menu);
};
