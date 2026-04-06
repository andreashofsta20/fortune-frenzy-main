import { activeMenuAtom, previousMenuAtom } from "./global-state";
import { peek } from "@rbxts/charm";

export const handleCloseButton = () => {
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
