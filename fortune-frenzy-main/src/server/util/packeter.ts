import Signal from "@rbxts/signal";
import { HttpService, ReplicatedStorage, ServerScriptService } from "@rbxts/services";
import Base64 from "./base64";
import { setDecimalPlaces } from "shared/util/number-utils";
import log from "shared/util/log";
import LocalBackend from "./local-backend";

declare const fetch: (url: string, init: defined) => Promise<unknown>;

function emitAgentDebugLog(
	location: string,
	message: string,
	data: Record<string, unknown>,
	runId: string,
	hypothesisId: string,
) {
	// #region agent log
	task.spawn(() => {
		pcall(() =>
			fetch("http://127.0.0.1:7528/ingest/1b6715ac-5dbe-4e21-b0fb-3326720d79ad", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-Debug-Session-Id": "4ef876",
				},
				body: HttpService.JSONEncode({
					sessionId: "4ef876",
					location,
					message,
					data,
					timestamp: DateTime.now().UnixTimestampMillis,
					runId,
					hypothesisId,
				}),
			}),
		);
	});
	// #endregion
}

export class Packeter {
	public NewRequestQueued = new Signal<(requestId: string) => void>();
	public RequestCompleted = new Signal<(requestId: string) => void>();

	private _requestQueue = new Map<string, Request>();
	private _packeterUrl = "";
	/** Min seconds between outbound HttpService calls. Roblox caps ~500 req/min per server. */
	private _requestDelay = 0.5;
	private _status: "alive" | "alive" = "alive";
	private _currentlyProcessing = false;
	private _lastHttpRequest = tick();
	/** When Roblox returns "Number of requests exceeded limit", pause batching to recover. */
	private _rateLimitUntil = 0;
	private _apiKey: Secret | undefined;
	/** False when GetSecret failed — outbound HTTP must not hang on auth errors. */
	private _apiKeyUsable = false;
	private _localOnly = false;

	public _jobId = game.JobId || `ROBLOX_STUDIO_${os.clock()}`;

	constructor(packeterUrl: string, requestDelay?: number) {
		this._packeterUrl = packeterUrl;
		this._localOnly = packeterUrl === "local";

		this._requestDelay = requestDelay ?? 0.5;
		Request.currentInstance = this;
		this.Start();
	}

	private async Start() {
		if (this._localOnly) {
			ServerScriptService.SetAttribute("server_id", this._jobId);
			ReplicatedStorage.SetAttribute("server_id", this._jobId);
			this._status = "alive";
			log("print", `[Packeter] Running in local Roblox-only mode.`);
			return;
		}

		const isRegistered = await this._RegisterWithServer();
		if (!isRegistered) return;
		ServerScriptService.SetAttribute("server_id", this._jobId);
		ReplicatedStorage.SetAttribute("server_id", this._jobId);

		this._status = "alive";
		while (this._status === "alive") {
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
		if (this._localOnly) return true;

		const [apiKeySuccess, apiKey] = pcall(() => HttpService.GetSecret("X_API_KEY"));
		// #region agent log
		emitAgentDebugLog(
			"src/server/util/packeter.ts:94",
			"packeter secret lookup",
			{ apiKeySuccess, localOnly: this._localOnly },
			"pre-fix",
			"H1",
		);
		// #endregion

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
		// #region agent log
		emitAgentDebugLog(
			"src/server/util/packeter.ts:113",
			"packeter register response",
			{ success, statusCode: result.StatusCode },
			"pre-fix",
			"H1",
		);
		// #endregion

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

		for (const [requestId, request] of this._requestQueue) {
			if (request.status === "ready") {
				request.status = "pending";
				packet.push({
					request_id: requestId,
					method: request.method,
					route: request.route,
					headers: request.headers,
					body: request.body,
				});
			}
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
			// #region agent log
			emitAgentDebugLog(
				"src/server/util/packeter.ts:188",
				"packeter packet send",
				{
					attempts,
					packetSize: packet.size(),
					firstRoutes: (() => {
						const routes = new Array<string>();
						for (let i = 0; i < math.min(5, packet.size()); i++) {
							routes.push(packet[i].route);
						}
						return routes;
					})(),
				},
				"pre-fix",
				"H2",
			);
			// #endregion
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
		// #region agent log
		emitAgentDebugLog(
			"src/server/util/packeter.ts:228",
			"packeter packet transport response",
			{
				success,
				statusCode: response.StatusCode,
				bodyPreview: response.Body.sub(1, math.min(200, response.Body.size())),
			},
			"pre-fix",
			"H2",
		);
		// #endregion

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
		task.wait(this._requestDelay - (tick() - this._lastHttpRequest));
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

	public IsLocalMode() {
		return this._localOnly;
	}

	public HasOutboundApiKey() {
		return this._apiKeyUsable;
	}

	private cloneLocalResponse<T>(payload: T): T {
		const [encodeSuccess, encodedPayload] = pcall(() => HttpService.JSONEncode(payload)) as LuaTuple<
			[boolean, unknown]
		>;
		if (!encodeSuccess || !typeIs(encodedPayload, "string")) return payload;

		const [decodeSuccess, decodedPayload] = pcall(() => HttpService.JSONDecode(encodedPayload)) as LuaTuple<
			[boolean, unknown]
		>;
		if (!decodeSuccess) return payload;

		return decodedPayload as T;
	}

	public ResolveLocalRequest(request: Request): { Code: number; Response: unknown; Success: boolean } {
		const localResponse = LocalBackend.handleRequest(request.method, request.route, request.headers, request.body);
		const clonedResponse = this.cloneLocalResponse(localResponse.response);
		return {
			Code: localResponse.code,
			Response: clonedResponse,
			Success: localResponse.code >= 200 && localResponse.code <= 299,
		};
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

		if (instance.IsLocalMode()) {
			const response = instance.ResolveLocalRequest(this) as { Code: number; Response: T; Success: boolean };
			this.status = "completed";
			this._response = response;

			if (response.Code !== 200) {
				warn(`[Packeter] Request to ${this.route} failed with code ${response.Code}`, response.Response);
			}

			return response;
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
