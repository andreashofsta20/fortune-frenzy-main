import Signal from "@rbxts/signal";
import { HttpService, ReplicatedStorage, ServerScriptService } from "@rbxts/services";
import Base64 from "./base64";
import { setDecimalPlaces } from "shared/util/number-utils";
import log from "shared/util/log";

export class Packeter {
	public NewRequestQueued = new Signal<(requestId: string) => void>();
	public RequestCompleted = new Signal<(requestId: string) => void>();

	private _requestQueue = new Map<string, Request>();
	private _packeterUrl = "";
	/**
	 * Min seconds between outbound HttpService calls (each /packet batch = one call, often many routes).
	 * Roblox ~500 HttpService requests/min/server → ~8/s max; 0.1s allows ~10/s with headroom when batches combine routes.
	 * Was 0.5s — felt very slow for purchases while polls shared the same queue.
	 */
	private _requestDelay = 0.1;
	private _status: "alive" | "alive" = "alive";
	private _currentlyProcessing = false;
	private _lastHttpRequest = tick();
	/** When Roblox returns "Number of requests exceeded limit", pause batching to recover. */
	private _rateLimitUntil = 0;
	private _apiKey: Secret | undefined;
	/** False when GetSecret failed — outbound HTTP must not hang on auth errors. */
	private _apiKeyUsable = false;

	public _jobId = game.JobId || `ROBLOX_STUDIO_${os.clock()}`;

	constructor(packeterUrl: string, requestDelay?: number) {
		this._packeterUrl = packeterUrl;

		this._requestDelay = requestDelay ?? 0.1;
		Request.currentInstance = this;
		this.Start();
	}

	private async Start() {
		ServerScriptService.SetAttribute("server_id", this._jobId);
		ReplicatedStorage.SetAttribute("server_id", this._jobId);

		let registerOk = await this._RegisterWithServer();
		if (!registerOk) {
			warn(
				"[Packeter] POST /register failed (wrong _backend_url, HttpService not allowed to API host, bad X_API_KEY, or API down). " +
					"Keeping the request loop alive so players do not hang forever on \"Registering with backend\". Retrying register every 30s.",
			);
		}

		let nextRegisterAttempt = registerOk ? math.huge : tick() + 5;

		this._status = "alive";
		while (this._status === "alive") {
			if (!registerOk && tick() >= nextRegisterAttempt) {
				registerOk = await this._RegisterWithServer();
				nextRegisterAttempt = tick() + 30;
				if (registerOk) {
					log("print", `[Packeter] Registered with Packeter API (after retry).`);
				}
			}

			if (this._IsReadyToProcessRequests()) {
				this._currentlyProcessing = true;
				const packet = this._CreatePacket();
				await this._ProcessPacket(packet);
				this._currentlyProcessing = false;
			} else {
				this._WaitForNextInterval();
			}
		}
	}

	private async _RegisterWithServer(): Promise<boolean> {
		const [apiKeySuccess, apiKey] = pcall(() => HttpService.GetSecret("X_API_KEY"));

		if (!apiKeySuccess) {
			warn("[Packeter] Failed to retrieve ApiKey from secrets store:", apiKey);
			this._apiKeyUsable = false;
			return true;
		}

		this._apiKey = apiKey;
		this._apiKeyUsable = true;

		const [success, result, _registerFailHint] = await this._DoHttpRequest({
			Url: `${this._packeterUrl}/register/${this._jobId}`,
			Method: "POST",
			Headers: {
				"x-api-key": this._apiKey as unknown as string,
			},
		});

		if (!success || result.StatusCode !== 200) return false;

		log("print", `[Packeter] Registered with Packeter API.`);
		return true;
	}

	private _IsReadyToProcessRequests(): boolean {
		if (tick() < this._rateLimitUntil) return false;
		const ready =
			tick() - this._lastHttpRequest >= this._requestDelay &&
			!this._currentlyProcessing &&
			this._requestQueue.size() > 0;

		return ready;
	}

	private _CreatePacket(): Array<{
		request_id: string;
		method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
		route: string;
		headers?: Record<string, string>;
		body?: unknown;
		Result?: { Code: number; Response: unknown; Success?: boolean };
	}> {
		const packet: {
			request_id: string;
			method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
			route: string;
			headers?: Record<string, string>;
			body?: unknown;
			Result?: { Code: number; Response: unknown; Success?: boolean };
		}[] = [];

		type ReadyItem = { requestId: string; request: Request };
		const readyItems = new Array<ReadyItem>();
		for (const [requestId, request] of this._requestQueue) {
			if (request.status === "ready") {
				readyItems.push({ requestId, request });
			}
		}

		// Never batch GET /users/get-cash-changes with other routes. The API uses a DB
		// transaction; if it errors or the whole packet fails, it would block case battles,
		// jackpots, marketplace polls, etc. in the same batch.
		const isCashChangesRoute = (route: string) => string.find(route, "get-cash-changes", 1, true) !== undefined;
		const cashItems = readyItems.filter((x) => isCashChangesRoute(x.request.route));
		const otherItems = readyItems.filter((x) => !isCashChangesRoute(x.request.route));

		const selected =
			otherItems.size() > 0 ? otherItems : cashItems.size() > 0 ? [cashItems[0]] : [];

		for (const { requestId, request } of selected) {
			request.status = "pending";
			packet.push({
				request_id: requestId,
				method: request.method,
				route: request.route,
				headers: request.headers,
				body: request.body,
			});
		}

		return packet;
	}

	private async _ProcessPacket(
		packet: Array<{
			request_id: string;
			method: string;
			route: string;
			headers?: Record<string, string>;
			body?: unknown;
		}>,
	) {
		const batchIds = packet.map((p) => p.request_id);

		let attempts = 0;
		let success = false;
		let response: RequestAsyncResponse;
		let lastFailureHint = "";

		do {
			attempts++;
			[success, response, lastFailureHint] = await this._DoHttpRequest({
				Url: `${this._packeterUrl}/packet/${this._jobId}`,
				Method: "POST",
				Headers: {
					"Content-Type": "application/json",
					"server-id": this._jobId,
					"x-api-key": this._apiKey as unknown as string,
				},
				Body: HttpService.JSONEncode({ Packet: packet }),
			});
			if (!success && this._isRobloxHttpThrottleHint(lastFailureHint)) {
				this._rateLimitUntil = tick() + 3;
				break;
			}
		} while (!success && attempts < 2);

		if (!success || !response.Body) {
			const isThrottle = this._isRobloxHttpThrottleHint(lastFailureHint);
			if (isThrottle) {
				this._rateLimitUntil = math.max(this._rateLimitUntil, tick() + 3);
			}

			this._rejectBatch(batchIds, 503, {
				error: isThrottle
					? "Roblox HttpService request budget exceeded (not your API)"
					: "Packeter could not reach the API after retries",
				message: isThrottle
					? lastFailureHint !== ""
						? lastFailureHint
						: "Number of requests exceeded limit — slow down outbound HTTP"
					: "Packeter could not reach the API after retries",
			});
			return;
		}

		if (response.StatusCode !== 200) {
			const errPayload = this._tryParseErrorBody(response.Body);
			this._rejectBatch(batchIds, response.StatusCode, errPayload);
			return;
		}

		this._dispatchPacketResponses(batchIds, response.Body);
	}

	/** Unblocks every waiter in this batch — required because Signal.Wait() never yields otherwise. */
	private _rejectBatch(batchIds: readonly string[], code: number, body: unknown) {
		for (const id of batchIds) {
			const request = this._requestQueue.get(id);
			if (request && request.status === "pending") {
				request.status = "completed";
				request._event.Fire(code, body, false);
				this._requestQueue.delete(id);
			}
		}
	}

	private _tryParseErrorBody(raw: string): { error?: string; message?: string } {
		const [ok, decoded] = pcall(() => HttpService.JSONDecode(raw));
		if (!ok || decoded === undefined || !typeIs(decoded, "table")) {
			return { error: "Request failed", message: "Request failed" };
		}
		const t = decoded as { error?: string; message?: string };
		return {
			error: t.error ?? t.message ?? "Request failed",
			message: t.message ?? t.error ?? "Request failed",
		};
	}

	private _dispatchPacketResponses(batchIds: readonly string[], rawBody: string) {
		const [decodeOk, decoded] = pcall(() => HttpService.JSONDecode(rawBody));
		if (!decodeOk || decoded === undefined || !typeIs(decoded, "table")) {
			this._rejectBatch(batchIds, 502, {
				error: "Invalid JSON from packet endpoint",
				message: "Invalid JSON from packet endpoint",
			});
			return;
		}

		const responseBody = decoded as {
			responses?: Array<{ request_id: string; response: [number, unknown] }>;
			status?: string;
		};

		const responses = responseBody.responses;
		if (responses === undefined || !typeIs(responses, "table")) {
			this._rejectBatch(batchIds, 502, {
				error: "Packet response missing sub-responses",
				message: "Packet response missing sub-responses",
			});
			return;
		}

		for (const result of responses) {
			const tuple = result.response;
			if (tuple === undefined) {
				continue;
			}
			const statusCode = tuple[0] as number | undefined;
			const responsePayload = tuple[1];
			if (statusCode === undefined) {
				continue;
			}

			const request = this._requestQueue.get(result.request_id);
			if (request) {
				request.status = "completed";
				request._event.Fire(statusCode, responsePayload, statusCode >= 200 && statusCode <= 299);
				this._requestQueue.delete(result.request_id);
			}
		}

		for (const id of batchIds) {
			const leftover = this._requestQueue.get(id);
			if (leftover && leftover.status === "pending") {
				leftover.status = "completed";
				leftover._event.Fire(502, {
					error: "No sub-response for this request in packet",
					message: "No sub-response for this request in packet",
				}, false);
				this._requestQueue.delete(id);
			}
		}
	}

	private _WaitForNextInterval() {
		const remaining = this._requestDelay - (tick() - this._lastHttpRequest);
		task.wait(remaining > 0 ? remaining : 0);
	}

	private _isRobloxHttpThrottleHint(text: string): boolean {
		const lower = string.lower(text);
		return (
			string.find(lower, "exceeded limit", 1, true) !== undefined ||
			string.find(lower, "too many requests", 1, true) !== undefined
		);
	}

	private _httpFailureHint(response: unknown): string {
		if (!typeIs(response, "table")) return tostring(response);
		const t = response as { StatusMessage?: string; Body?: string };
		const parts = new Array<string>();
		if (typeIs(t.StatusMessage, "string")) parts.push(t.StatusMessage);
		if (typeIs(t.Body, "string") && t.Body.size() < 200) parts.push(t.Body);
		return parts.size() > 0 ? parts.join(" ") : tostring(response);
	}

	private async _DoHttpRequest(
		requestData: RequestAsyncRequest,
	): Promise<[boolean, RequestAsyncResponse, string]> {
		this._lastHttpRequest = tick();
		const [success, response] = pcall(() => HttpService.RequestAsync(requestData));
		const res = response as RequestAsyncResponse;

		if (success && res.Success) {
			return [true, res, ""];
		} else {
			const hint = success ? this._httpFailureHint(res) : this._httpFailureHint(response);
			warn(`[Packeter] Failed to send request to ${requestData.Url}:`, response);
			return [false, res, hint];
		}
	}

	public async AddRequest(data: Request) {
		this._requestQueue.set(data.requestId, data);
		this.NewRequestQueued.Fire(data.requestId);
	}

	public HasOutboundApiKey() {
		return this._apiKeyUsable;
	}

	/** Optional override from /settings `packeter_min_interval` (seconds), clamped to a safe range. */
	public setMinRequestInterval(seconds: number) {
		if (typeIs(seconds, "number") && seconds >= 0.05 && seconds <= 1.5) {
			this._requestDelay = seconds;
		}
	}

}

export class Request {
	static currentInstance: Packeter;

	public readonly requestId: string;
	public readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	public readonly route: string;
	public headers?: Record<string, string>;
	public body?: unknown;
	public status: "ready" | "completed" | "pending" = "ready";
	public _event: Signal<(code: number, response: unknown, success: boolean) => void, false>;
	private _response?: { Code: number; Response: unknown; Success: boolean };

	constructor(
		method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
		route: string,
		headers?: Record<string, string>,
		body?: unknown,
		query?: Record<string, string>,
	) {
		let url = route;
		if (query) {
			const queryString = new Array<string>();
			for (const [key, value] of pairs(query)) {
				queryString.push(`${key}=${value}`);
			}
			url = `${route}?${queryString.join("&")}`;
		}

		this.requestId = HttpService.GenerateGUID(false);
		this.method = method;
		this.route = url;
		this.headers = headers;
		this.body = body;
		this._event = new Signal();
	}

	public async GetResponse<T = unknown>(): Promise<{ Code: number; Response: T; Success: boolean }> {
		const instance = Request.currentInstance;
		if (!instance) {
			return {
				Code: 500,
				Response: ({ status: "error", message: "Packeter not initialized" } as unknown) as T,
				Success: false,
			};
		}

		if (!instance.HasOutboundApiKey()) {
			return {
				Code: 503,
				Response: ({
					status: "error",
					message: "X_API_KEY secret missing or failed to load — enable HttpService and configure Secrets",
					error: "API key unavailable",
				} as unknown) as T,
				Success: false,
			};
		}

		instance.AddRequest(this);
		const [code, response, success] = this._event.Wait();
		this.status = "completed";
		this._response = { Code: code, Response: response as T, Success: success };

		if (code !== 200) {
			warn(`[Packeter] Request to ${this.route} failed with code ${code}`, response);
		}

		return this._response as { Code: number; Response: T; Success: boolean };
	}
}
