import { GlobalEvents, GlobalFunctions } from "shared/network";
import { FunctionCooldown } from "./util/middleware/cooldown";

export const Events = GlobalEvents.createServer({});
export const Functions = GlobalFunctions.createServer({
	defaultTimeout: -1,
	middleware: {},
});
