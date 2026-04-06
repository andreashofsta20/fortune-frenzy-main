import { RunService } from "@rbxts/services";

export default function log(level: "print" | "warn" = "print", ...args: unknown[]) {
	if (!RunService.IsStudio()) return;

	if (level === "print") {
		print(...args);
	} else {
		warn(...args);
	}
}
