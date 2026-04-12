import { RunService } from "@rbxts/services";

export default function log(level: "print" | "warn" | "info" = "print", ...args: unknown[]) {
	if (!RunService.IsStudio()) return;

	if (level === "warn") {
		warn(...args);
	} else {
		print(...args);
	}
}
