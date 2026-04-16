import { ClientStateController } from "client/controllers/ClientStateController";
import { requestServer } from "client/utils/send-function";
import { Functions } from "client/network";
import { Case } from "typings/APIResponses";

/**
 * Loads missing marketplace rows for case line ids (e.g. `limited_<assetId>`) so
 * ItemInfo is populated before spin / tiles render with real names and thumbs.
 */
export function prefetchMissingCaseItemRows(caseData: Case, clientStateController: ClientStateController) {
	const seen = new Set<string>();
	task.spawn(async () => {
		for (const row of caseData.items) {
			if (seen.has(row.id)) continue;
			seen.add(row.id);
			if (clientStateController.ItemInfo.get(row.id)) continue;
			await requestServer(Functions.Marketplace.RefreshMarketplaceItemFromApi, "", row.id);
			task.wait(0.06);
		}
	});
}
