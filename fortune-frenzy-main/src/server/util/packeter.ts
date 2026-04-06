import Signal from "@rbxts/signal";
import { HttpService, ReplicatedStorage, ServerScriptService } from "@rbxts/services";
import Base64 from "./base64";
import { setDecimalPlaces } from "shared/util/number-utils";
import log from "shared/util/log";
import LocalBackend from "./local-backend";

export class Packeter {
	public NewRequestQueued = new Signal<(requestId: string) => void>();
	public RequestCompleted = new Signal<(requestId: string) => void>();

	private _requestQueue = new Map<string, Request>();
	private _packeterUrl = "";
	private _requestDelay = 400 / 60;
	private _status: "alive" | "alive" = "alive";
	private _currentlyProcessing = false;
	private _lastHttpRequest = tick();
	private _apiKey: Secret | undefined;
	private _localOnly = false;

	public _jobId = game.JobId || `ROBLOX_STUDIO_${os.clock()}`;

	constructor(packeterUrl: string, requestDelay?: number) {
		this._packeterUrl = packeterUrl;
		this._localOnly = packeterUrl === "local";

		if (!this._localOnly) {
			warn(`[Packeter] External backend is disabled in this build. Forcing local mode (requested: ${packeterUrl}).`);
			this._packeterUrl = "local";
			this._localOnly = true;
		}

		this._requestDelay = requestDelay ?? 60 / 480;
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

		   if (!apiKeySuccess) {
			   warn("[Packeter] Failed to retrieve ApiKey from secrets store:", apiKey);
			   // Always allow the server to run and pretend registration succeeded
			   return true;
		   }

		this._apiKey = apiKey;

		const [success, result] = await this._DoHttpRequest({
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
		let attempts = 0;
		let success = false;
		let response: RequestAsyncResponse;

		do {
			attempts++;
			[success, response] = await this._DoHttpRequest({
				Url: `${this._packeterUrl}/packet/${this._jobId}`,
				Method: "POST",
				Headers: {
					"Content-Type": "application/json",
					"server-id": this._jobId,
					"x-api-key": this._apiKey as unknown as string,
				},
				Body: HttpService.JSONEncode({ Packet: packet }),
			});
		} while (!success && attempts < 3);

		if (!success || !response.Body) {
			this._HandleFailedRequests();
		} else {
			this._HandleResponse(response);
		}
	}

	private async _HandleFailedRequests() {
		this._requestQueue.forEach((request) => {
			request.status = "ready";
		});
	}

	private _HandleResponse(response: RequestAsyncResponse) {
		const responseBody = HttpService.JSONDecode(response.Body) as {
			responses: Array<{ request_id: string; response: [number, unknown] }>;
			status: string;
		};

		for (const result of responseBody.responses) {
			const request = this._requestQueue.get(result.request_id);
			if (request) {
				request.status = "completed";
				request._event.Fire(
					result.response[0],
					result.response[1],
					result.response[0] >= 200 && result.response[0] <= 299,
				);
				this._requestQueue.delete(result.request_id);
			}
		}
	}

	private _WaitForNextInterval() {
		task.wait(this._requestDelay - (tick() - this._lastHttpRequest));
	}

	private async _DoHttpRequest(requestData: RequestAsyncRequest): Promise<[boolean, RequestAsyncResponse]> {
		this._lastHttpRequest = tick();
		const [success, response] = pcall(() => HttpService.RequestAsync(requestData));

		if (success && response.Success) {
			return [true, response as RequestAsyncResponse];
		} else {
			warn(`[Packeter] Failed to send request to ${requestData.Url}:`, response);
			return [false, response as RequestAsyncResponse];
		}
	}

	public async AddRequest(data: Request) {
		this._requestQueue.set(data.requestId, data);
		this.NewRequestQueued.Fire(data.requestId);
	}

	public IsLocalMode() {
		return this._localOnly;
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
