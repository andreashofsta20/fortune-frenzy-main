// FORCE HIDE LOADING SCREEN ON STARTUP
import { isLoadingAtom } from "client/utils/global-state";
isLoadingAtom(false);
// Pairs with server `import "server/network"`: attach to remotes before controllers load.
import "client/network";
import { Flamework } from "@flamework/core";
import { RunService } from "@rbxts/services";

Flamework.addPaths("src/client/components");
Flamework.addPaths("src/client/controllers");
Flamework.addPaths("src/shared/components");
Flamework.ignite();

if (!RunService.IsStudio()) {
	print(`
		███╗░░██╗░█████╗░██╗░░░██╗░█████╗░░██╗░░░░░░░██╗░█████╗░██████╗░███████╗
		████╗░██║██╔══██╗██║░░░██║██╔══██╗░██║░░██╗░░██║██╔══██╗██╔══██╗██╔════╝
		██╔██╗██║██║░░██║╚██╗░██╔╝███████║░╚██╗████╗██╔╝███████║██████╔╝█████╗░░
		██║╚████║██║░░██║░╚████╔╝░██╔══██║░░████╔═████║░██╔══██║██╔══██╗██╔══╝░░
		██║░╚███║╚█████╔╝░░╚██╔╝░░██║░░██║░░╚██╔╝░╚██╔╝░██║░░██║██║░░██║███████╗
		╚═╝░░╚══╝░╚════╝░░░░╚═╝░░░╚═╝░░╚═╝░░░╚═╝░░░╚═╝░░╚═╝░░╚═╝╚═╝░░╚═╝╚══════╝
	`);
	print("");
	print("");
	print("            			Fortune Frenzy by Novaware.");
	print("     	Made with Flamework using Roblox-TS. Powered by React.");
}
