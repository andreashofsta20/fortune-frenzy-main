/*

loganmc
awn
matetsss
Skibidi95189
d0x1ns
VickRice
levacc2nd
Lukasbisse
LunaPuffy2
envymightyy
Viper_syx
currentlyforgiving

*/

// Create Flamework remotes in ReplicatedStorage before anything else. If the client runs
// `GlobalEvents.createClient` before the server has called `createServer`, it blocks on
// `shared/network@GlobalEvents` (see createRemoteInstance.lua).
import "server/network";

import { ServerScriptService, MarketplaceService } from "@rbxts/services";
import { Flamework } from "@flamework/core";

ServerScriptService.SetAttribute(`StartTime`, tick());

MarketplaceService.ProcessReceipt = (receiptInfo) => {
	warn(`Processing receipt for ${receiptInfo.PlayerId}`);
	return Enum.ProductPurchaseDecision.NotProcessedYet;
};

Flamework.addPaths("src/server/components");
Flamework.addPaths("src/server/services");
Flamework.addPaths("src/shared/components");

Flamework.ignite();
