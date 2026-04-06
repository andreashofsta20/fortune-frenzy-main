import { HttpService, ReplicatedStorage } from "@rbxts/services";

export function getConfig<T>(key: string): T | undefined {
	const json: string | unknown = ReplicatedStorage.GetAttribute(`_config_${key}`);
	if (typeIs(json, "string")) return (HttpService.JSONDecode(json) as { value: T }).value;
	return undefined;
}
