import Signal from "@rbxts/signal";
import { HttpService, Players, ReplicatedStorage, ServerScriptService } from "@rbxts/services";
import { Events } from "server/network";
import log from "shared/util/log";

type OutboundPacketEntry = {
	request_id: string;
	method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	route: string;
	headers?: Record<string, string>;
	body?: unknown;
};

export class Packeter {
	public NewRequestQueued = new Signal<(requestId: string) => void>();
	public RequestCompleted = new Signal<(requestId: string) => void>();

	private _requestQueue = new Map<string, Request>();
	private _packeterUrl = "";

	private _requestDelay = 0.1;
	private _status: "alive" | "dead" = "alive"; // ✅ FIXED

	private _currentlyProcessing = false;
	private _lastHttpRequest = tick();

	private _rateLimitUntil = 0;

	private _apiDownBroadcast = false;

	/** GET `/health` when backend is considered healthy (less noisy). */
	private static readonly _healthPollHealthySec = 10;
	/** GET `/health` while down — faster reconnect checks. */
	private static readonly _healthPollDownSec = 3;

	private _apiKey: Secret | undefined;
	private _apiKeyUsable = false;

	/** When false, we do not register or call `/packet` — only `/health` is polled. */
	private _backendHealthOk = false;
	private _initialHealthGateDone = false;
	private _lastHealthProbeAt = 0;

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

		Players.PlayerAdded.Connect((player) => {
			if (this._apiDownBroadcast) {
				Events.BackendApiConnectivity.fire(player, {
					online: false,
					clientMessage: "Reconnecting to services...",
					serverMessage: "Fortune Frenzy API is temporarily unavailable.",
				});
			}
		});

		await this._runInitialHealthGate();

		let registerOk = false;
		if (this._backendHealthOk) {
			registerOk = await this._RegisterWithServer();
			if (!registerOk) {
				warn("[Packeter] Register failed, retrying...");
			} else {
				this._markApiReachable();
			}
		}

		let nextRegisterAttempt = registerOk ? math.huge : tick() + 5;

		while (this._status === "alive") {
			const healthInterval = this._backendHealthOk
				? Packeter._healthPollHealthySec
				: Packeter._healthPollDownSec;
			if (tick() - this._lastHealthProbeAt >= healthInterval) {
				const healthy = await this._probeHealth();
				if (healthy) {
					this._backendHealthOk = true;
					this._markApiReachable();
				} else {
					this._backendHealthOk = false;
					this._broadcastApiDownNow();
					this._drainQueueBackendUnreachable();
				}
				this._lastHealthProbeAt = tick();
			}

			if (!this._backendHealthOk) {
				this._drainQueueBackendUnreachable();
				task.wait(0.25);
				continue;
			}

			if (!registerOk && tick() >= nextRegisterAttempt) {
				registerOk = await this._RegisterWithServer();
				nextRegisterAttempt = tick() + 30;

				if (registerOk) {
					log("print", `[Packeter] Registered after retry.`);
					this._markApiReachable();
				} else {
					warn("[Packeter] Register retry failed.");
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

	/** InitializationService awaits this so nothing uses `Request` until the first `/health` result exists. */
	public async waitForInitialHealthGate(): Promise<void> {
		while (!this._initialHealthGateDone && this._status === "alive") {
			task.wait(0.05);
		}
	}

	private async _runInitialHealthGate() {
		const healthy = await this._probeHealth();
		this._backendHealthOk = healthy;
		if (healthy) {
			this._markApiReachable();
		} else {
			this._broadcastApiDownNow();
			this._drainQueueBackendUnreachable();
		}
		this._lastHealthProbeAt = tick();
		this._initialHealthGateDone = true;
	}

	/** True when `/health` last reported OK (or Roblox HTTP throttle — do not treat as down). */
	public isBackendHealthy(): boolean {
		return this._backendHealthOk;
	}

	private async _probeHealth(): Promise<boolean> {
		if (this._packeterUrl === "") {
			return true;
		}

		const [success, response, hint] = await this._DoHttpRequest({
			Url: `${this._packeterUrl}/health`,
			Method: "GET",
		});

		const throttle = this._isRobloxHttpThrottleHint(hint);
		let healthy = false;
		if (!success) {
			healthy = throttle;
			return healthy;
		}

		healthy = response.StatusCode === 200 && this._healthPayloadIndicatesApiOk(response.Body);
		return healthy;
	}

	private _broadcastApiDownNow() {
		if (this._apiDownBroadcast) return;

		this._apiDownBroadcast = true;
		ReplicatedStorage.SetAttribute("__FF_API_DOWN", true);

		for (const p of Players.GetPlayers()) {
			Events.BackendApiConnectivity.fire(p, {
				online: false,
				clientMessage: "Reconnecting to services...",
				serverMessage: "Fortune Frenzy API is temporarily unavailable.",
			});
		}
	}

	private _drainQueueBackendUnreachable() {
		const payload = {
			error: "backend_unreachable",
			message: "API health check failed — backend is not accepting traffic.",
		};
		for (const [id, req] of this._requestQueue) {
			if (req.status === "ready" || req.status === "pending") {
				req.status = "completed";
				req._event.Fire(503, payload, false);
				this._requestQueue.delete(id);
			}
		}
	}

	private _onPacketTransportFailure(fromThrottle: boolean) {
		if (fromThrottle) {
			this._rateLimitUntil = tick() + 3;
			return;
		}
		this._backendHealthOk = false;
		this._broadcastApiDownNow();
		this._drainQueueBackendUnreachable();
	}

	private _healthPayloadIndicatesApiOk(body: string | undefined): boolean {
		if (!body || body === "") return false;

		const [ok, decoded] = pcall(() => HttpService.JSONDecode(body));
		if (!ok || !typeIs(decoded, "table")) return false;

		const data = decoded as { status?: unknown };
		return typeIs(data.status, "string") && string.lower(data.status) === "ok";
	}

	private async _RegisterWithServer(): Promise<boolean> {
		const [ok, key] = pcall(() => HttpService.GetSecret("X_API_KEY"));

		if (!ok) {
			this._apiKeyUsable = false;
			return false;
		}

		this._apiKey = key;
		this._apiKeyUsable = true;

		const [success, result] = await this._DoHttpRequest({
			Url: `${this._packeterUrl}/register/${this._jobId}`,
			Method: "POST",
			Headers: {
				"x-api-key": this._apiKey as unknown as string,
			},
		});

		return success && result.StatusCode === 200;
	}

	private _IsReadyToProcessRequests(): boolean {
		if (tick() < this._rateLimitUntil) return false;

		return (
			tick() - this._lastHttpRequest >= this._requestDelay &&
			!this._currentlyProcessing &&
			this._requestQueue.size() > 0
		);
	}

	private _CreatePacket(): OutboundPacketEntry[] {
		const packet = new Array<OutboundPacketEntry>();

		for (const [id, req] of this._requestQueue) {
			if (req.status !== "ready") continue;

			req.status = "pending";

			packet.push({
				request_id: id,
				method: req.method,
				route: req.route,
				headers: req.headers,
				body: req.body,
			});
		}

		return packet;
	}

	private async _ProcessPacket(packet: OutboundPacketEntry[]) {
		const ids = packet.map((p) => p.request_id);

		const [success, response, hint] = await this._DoHttpRequest({
			Url: `${this._packeterUrl}/packet/${this._jobId}`,
			Method: "POST",
			Headers: {
				"Content-Type": "application/json",
				"x-api-key": this._apiKey as unknown as string,
			},
			Body: HttpService.JSONEncode({ Packet: packet }),
		});

		if (!success || !response.Body) {
			this._onPacketTransportFailure(this._isRobloxHttpThrottleHint(hint));
			this._rejectBatch(ids, 503, "Request failed");
			return;
		}

		if (response.StatusCode !== 200) {
			if (response.StatusCode >= 500) {
				this._onPacketTransportFailure(false);
			}
			this._rejectBatch(ids, response.StatusCode, response.Body);
			return;
		}

		this._dispatchPacketResponses(ids, response.Body);
	}

	private _rejectBatch(ids: string[], code: number, body: unknown) {
		for (const id of ids) {
			const req = this._requestQueue.get(id);
			if (!req) continue;

			req.status = "completed";
			req._event.Fire(code, body, false);
			this._requestQueue.delete(id);
		}
	}

	private _dispatchPacketResponses(ids: string[], raw: string) {
		const [ok, decoded] = pcall(() => HttpService.JSONDecode(raw));
		if (!ok || !typeIs(decoded, "table")) {
			this._rejectBatch(ids, 502, "Invalid JSON");
			return;
		}

		type Sub = { request_id: string; response: [number, unknown] };
		const responses = (decoded as { responses?: Sub[] }).responses;
		if (responses === undefined) {
			this._rejectBatch(ids, 502, "Packet response missing sub-responses");
			return;
		}

		for (const res of responses) {
			const req = this._requestQueue.get(res.request_id);
			if (!req) continue;

			const tuple = res.response;
			const code = tuple[0];
			const body = tuple[1];

			req.status = "completed";
			req._event.Fire(code, body, code >= 200 && code < 300);
			this._requestQueue.delete(res.request_id);
		}
	}

	private _WaitForNextInterval() {
		const remaining = this._requestDelay - (tick() - this._lastHttpRequest);
		task.wait(remaining > 0 ? remaining : 0);
	}

	/** Plain-text substrings Roblox uses for HttpService game-wide limits (not connection/DNS failures). */
	private _isRobloxHttpThrottleHint(text: string): boolean {
		if (text === "" || text.size() < 8) return false;
		const lower = string.lower(text);
		if (string.find(lower, "timed out", 1, true)[0] !== undefined) return false;
		if (string.find(lower, "could not connect", 1, true)[0] !== undefined) return false;
		if (string.find(lower, "connection refused", 1, true)[0] !== undefined) return false;
		if (string.find(lower, "connectfail", 1, true)[0] !== undefined) return false;
		if (string.find(lower, "name resolution", 1, true)[0] !== undefined) return false;
		if (string.find(lower, "ssl", 1, true)[0] !== undefined && string.find(lower, "handshake", 1, true)[0] !== undefined)
			return false;
		return (
			string.find(lower, "http requests exceed", 1, true)[0] !== undefined ||
			string.find(lower, "too many requests", 1, true)[0] !== undefined ||
			string.find(lower, "exceeded limit", 1, true)[0] !== undefined
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
		const [success, response] = pcall(() => HttpService.RequestAsync(requestData));
		this._lastHttpRequest = tick(); // ✅ FIXED placement

		if (success && response.Success) {
			return [true, response, ""];
		}

		const hint = success ? this._httpFailureHint(response) : tostring(response);
		return [false, response as RequestAsyncResponse, hint];
	}

	private _markApiReachable() {
		if (this._apiDownBroadcast) {
			this._apiDownBroadcast = false;
			ReplicatedStorage.SetAttribute("__FF_API_DOWN", false);

			for (const p of Players.GetPlayers()) {
				Events.BackendApiConnectivity.fire(p, { online: true });
			}
		}
	}

	public async AddRequest(req: Request) {
		this._requestQueue.set(req.requestId, req);
		this.NewRequestQueued.Fire(req.requestId);
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

	public readonly requestId = HttpService.GenerateGUID(false);
	public readonly method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	public readonly route: string;

	public headers?: Record<string, string>;
	public body?: unknown;

	public status: "ready" | "pending" | "completed" = "ready";

	public _event = new Signal<(code: number, response: unknown, success: boolean) => void>();

	constructor(
		method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
		route: string,
		headers?: Record<string, string>,
		body?: unknown,
		query?: Record<string, string>,
	) {
		this.method = method;
		let url = route;
		if (query) {
			const queryString = new Array<string>();
			for (const entry of pairs(query)) {
				const key = entry[0];
				const value = entry[1];
				queryString.push(`${key}=${value}`);
			}
			url = `${route}?${queryString.join("&")}`;
		}
		this.route = url;
		this.headers = headers;
		this.body = body;
	}

	public async GetResponse<T = unknown>(): Promise<{ Code: number; Response: T; Success: boolean }> {
		const instance = Request.currentInstance;

		if (!instance) {
			return {
				Code: 500,
				Response: undefined as unknown as T,
				Success: false,
			};
		}

		if (!instance.isBackendHealthy()) {
			return {
				Code: 503,
				Response: undefined as unknown as T,
				Success: false,
			};
		}

		if (!instance.HasOutboundApiKey()) {
			return {
				Code: 503,
				Response: undefined as unknown as T,
				Success: false,
			};
		}

		instance.AddRequest(this);

		let resolved = false;
		let result: LuaTuple<[number, unknown, boolean]> | undefined;

		task.spawn(() => {
			result = this._event.Wait();
			resolved = true;
		});

		const start = tick();
		while (!resolved && tick() - start < 10) {
			task.wait();
		}

		if (!resolved) {
			return { Code: 504, Response: undefined as unknown as T, Success: false };
		}

		const [code, response, success] = result!;

		return {
			Code: code,
			Response: response as T,
			Success: success,
		};
	}
}