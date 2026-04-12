import { ClientSender } from "@flamework/networking/out/functions/types";

/*
 * Utility helper that invokes a typed `ClientSender` while preserving its
 * parameter and return-types. The first argument is the `ClientSender` to call
 * (e.g. `Functions.Marketplace.GetInventory`). All subsequent arguments are
 * automatically inferred from that sender, providing full type-safety at the
 * call-site.
 *
 * Example:
 * ```ts
 * const inventory = await sendFunction(Functions.Marketplace.GetInventory);
 * const purchase = await sendFunction(Functions.Marketplace.BuyListedItem, uaid);
 * ```
 */
export async function requestServer<I extends unknown[], O>(
	clientSender: ClientSender<I, O>,
	errorMessage = "Something went wrong doing that",
	...args: I
): Promise<O | -1> {
	const [success, response] = pcall(() => clientSender(...args));
	if (!success) {
		warn(`[requestServer] ${errorMessage}:`, response);
		return -1;
	}

	return response as O;
}
