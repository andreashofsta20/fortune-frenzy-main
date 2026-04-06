import { RunService, ReplicatedStorage } from "@rbxts/services";

export default function (): "Public" | "Private" | "Reserved" {
	if (RunService.IsClient()) {
		return ReplicatedStorage.GetAttribute("ServerType") as "Public" | "Private" | "Reserved";
	}

	if (game.PrivateServerId !== "") {
		if (game.PrivateServerOwnerId !== 0) {
			return "Private";
		} else {
			return "Reserved";
		}
	} else {
		return "Public";
	}
}
