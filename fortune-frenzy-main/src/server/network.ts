import { GlobalEvents, GlobalFunctions } from "shared/network";

export const Events = GlobalEvents.createServer({});
export const Functions = GlobalFunctions.createServer({
	defaultTimeout: -1,
	middleware: {},
});
