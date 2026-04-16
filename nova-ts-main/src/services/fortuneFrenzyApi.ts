import { amountJsonValue } from "../utils/parseHumanInt.js";

/**
 * HTTP client for fortune-frenzy-internal-go (same auth as game servers: server-id + api-key,
 * or packeter-master-key bypass — keep bypass secret and never commit it).
 */
export class FortuneFrenzyApiError extends Error {
	constructor(
		public status: number,
		message: string,
		public body?: string,
	) {
		super(message);
		this.name = "FortuneFrenzyApiError";
	}
}

function getBaseUrl(): string {
	const u =
		(process.env.FORTUNE_FRENZY_API_BASE_URL ?? process.env.FF_API_URL ?? "http://127.0.0.1:3004").trim();
	return u.replace(/\/$/, "");
}

/**
 * Auth for the Go API (see fortune-frenzy-internal-go `middleware/authentication.go`).
 * Easiest on a shared Docker network: set `PACKETER_BYPASS_KEY` to the **same value** as in the API `.env`.
 */
export function getFortuneFrenzyAuthHeaders(): Record<string, string> {
	const bypass = (
		process.env.FORTUNE_FRENZY_PACKETER_BYPASS_KEY ??
		process.env.PACKETER_BYPASS_KEY ??
		""
	).trim();
	if (bypass.length > 0) {
		return { "packeter-master-key": bypass };
	}
	const serverId = (process.env.FORTUNE_FRENZY_SERVER_ID ?? process.env.FF_SERVER_ID ?? "").trim();
	const apiKey = (process.env.FORTUNE_FRENZY_API_KEY ?? process.env.FF_API_KEY ?? "").trim();
	if (!serverId || !apiKey) {
		throw new Error(
			"FF API auth: set PACKETER_BYPASS_KEY (same as the Go API .env), or FORTUNE_FRENZY_SERVER_ID + FORTUNE_FRENZY_API_KEY (or FF_SERVER_ID + FF_API_KEY).",
		);
	}
	return { "server-id": serverId, "api-key": apiKey };
}

async function doFetch(path: string, init?: RequestInit): Promise<Response> {
	let authHeaders: Record<string, string>;
	try {
		authHeaders = getFortuneFrenzyAuthHeaders();
	} catch (e) {
		// Misconfiguration — do not wrap as "network" error
		throw e;
	}
	const headers = {
		...authHeaders,
		...(init?.headers as Record<string, string> | undefined),
	};
	return fetch(`${getBaseUrl()}${path}`, { ...init, headers });
}

/** Fetch with network errors turned into FortuneFrenzyApiError (so Discord can show hints). */
async function ffFetch(path: string, init?: RequestInit): Promise<Response> {
	try {
		return await doFetch(path, init);
	} catch (err: unknown) {
		if (err instanceof Error && err.message.includes("FF API auth:")) {
			throw err;
		}
		const base = getBaseUrl();
		const msg = err instanceof Error ? err.message : String(err);
		const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : "";
		const detail = `${msg}${cause}`;
		let hint = "";
		if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|socket|network/i.test(detail)) {
			const loopback =
				/\b127\.0\.0\.1\b|\blocalhost\b/i.test(detail) && /ECONNREFUSED/i.test(detail);
			const loopbackNote = loopback
				? `\n\n**Why:** Inside a **Docker container**, \`127.0.0.1\` / \`localhost\` is **this container only**, not your host and not the API.`
				: "";
			hint = `${loopbackNote}\n\n**Fix:** Point the bot at the API by **Docker DNS name** on the shared network: \`FORTUNE_FRENZY_API_BASE_URL=http://ff-api:3004\` (match the \`services:\` name in the API \`docker-compose.yml\`). \`nova-ts-main/docker-compose.yml\` sets this for you—remove \`127.0.0.1\` from \`.env\` or let Compose override. On the **host** (bot not in Docker), \`http://127.0.0.1:3004\` is correct. Restart after changes.`;
		} else if (/ENOTFOUND|getaddrinfo/i.test(detail)) {
			hint = `\n\n**Likely fix:** Hostname in \`FORTUNE_FRENZY_API_BASE_URL\` does not resolve from where the bot runs.`;
		}
		throw new FortuneFrenzyApiError(-1, `${detail.slice(0, 800)}${hint}`);
	}
}

function safeJson<T>(text: string, path: string): T {
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new FortuneFrenzyApiError(
			-2,
			`Expected JSON from the API but got something else (wrong URL or HTML error page). Request: \`${path}\`\nPreview: ${text.slice(0, 280).replace(/\s+/g, " ")}`,
			text,
		);
	}
}

export interface FfSearchResult {
	id: string;
	name: string;
	display_name: string;
	current_cash: number;
	current_value: number;
}

export async function ffSearchUsers(params: {
	keywords: string;
	limit?: number;
	sort?: "name_a-z" | "name_z-a" | "value_high" | "value_low";
}): Promise<FfSearchResult[]> {
	const q = new URLSearchParams();
	if (params.keywords !== "") q.set("keywords", params.keywords);
	q.set("limit", String(params.limit ?? 20));
	q.set("sort", params.sort ?? "name_a-z");
	const path = `/search/users?${q.toString()}`;
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `search failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ status?: string; results?: FfSearchResult[] }>(text, path);
	return data.results ?? [];
}

export interface FfUserPayload {
	user_id: string;
	name: string;
	display_name: string;
	statistics: {
		total_cash_earned: number;
		total_cash_spent: number;
		win_rate: number;
		biggest_win: number;
		total_plays: number;
		favourite_mode: string;
		time_played: number;
		xp: number;
		current_cash: string;
	};
	created_at: string;
	updated_at: string;
}

export async function ffGetUser(userId: string): Promise<FfUserPayload | null> {
	const path = `/users/${encodeURIComponent(userId)}`;
	const res = await ffFetch(path);
	const text = await res.text();
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `get user failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{
		status?: string;
		data?: { data?: FfUserPayload; recent_activity?: unknown[] };
	}>(text, path);
	const inner = data.data?.data;
	return inner ?? null;
}

export async function ffGetActive(userId: string): Promise<boolean> {
	const path = `/users/${encodeURIComponent(userId)}/active`;
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `active check failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ active?: boolean }>(text, path);
	return data.active === true;
}

export async function ffInventoryCount(userId: string): Promise<number> {
	const path = `/users/${encodeURIComponent(userId)}/inventory`;
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `inventory failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ inventory?: string[][] }>(text, path);
	return data.inventory?.length ?? 0;
}

export interface FfLeaderboards {
	cash: unknown[][];
	value: unknown[][];
}

export async function ffGetLeaderboards(): Promise<FfLeaderboards> {
	const path = "/leaderboard";
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `leaderboard failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{
		status?: string;
		leaderboards?: { cash?: unknown[][]; value?: unknown[][] };
	}>(text, path);
	const lb = data.leaderboards;
	return {
		cash: lb?.cash ?? [],
		value: lb?.value ?? [],
	};
}

export async function ffWipeProfile(userId: string): Promise<void> {
	const path = `/users/${encodeURIComponent(userId)}/wipe-profile`;
	const res = await ffFetch(path, { method: "POST" });
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `wipe failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
}

export async function ffAddCash(userId: string, amount: bigint): Promise<unknown> {
	const path = `/users/${encodeURIComponent(userId)}/add-cash`;
	const res = await ffFetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ amount: amountJsonValue(amount) }),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `add-cash failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	return safeJson<unknown>(text, path);
}

export async function ffRemoveCash(userId: string, amount: bigint): Promise<unknown> {
	const path = `/users/${encodeURIComponent(userId)}/remove-cash`;
	const res = await ffFetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ amount: amountJsonValue(amount) }),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `remove-cash failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	return safeJson<unknown>(text, path);
}

export interface FfWalletResponse {
	mongo_wallet?: boolean;
	cash?: number | string;
	gems?: number;
	wallet_exists?: boolean;
}

export async function ffGetWallet(userId: string): Promise<FfWalletResponse> {
	const path = `/users/${encodeURIComponent(userId)}/wallet`;
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `wallet failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	return safeJson<FfWalletResponse>(text, path);
}

export interface FfCatalogItem {
	id: string;
	value: number;
	name?: string;
}

export async function ffGetCatalogItems(): Promise<FfCatalogItem[]> {
	const path = "/marketplace/items";
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `marketplace items failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ status?: string; data?: FfCatalogItem[] }>(text, path);
	return data.data ?? [];
}

export async function ffAddItemCopy(userId: string, itemId: string): Promise<void> {
	const path = "/items/add";
	const res = await ffFetch(path, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ user_id: userId, item_id: itemId }),
	});
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `add item failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
}

export interface FfCaseCatalogRow {
	id: string;
	price: number;
	items: { id: string; chance: number; claimed: number; value: number }[];
	next_rotation: string;
	ui_data: { primary: string; colour: string };
	opened_count: number;
	min_value: number;
	max_value: number;
	available_for_gems: boolean;
	dev_product: string;
	vip_only: boolean;
}

export async function ffGetCases(): Promise<FfCaseCatalogRow[]> {
	const path = "/cases";
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `cases failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ data?: FfCaseCatalogRow[] }>(text, path);
	return data.data ?? [];
}

export async function ffGetSettings(): Promise<Record<string, unknown>> {
	const path = "/settings";
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `settings failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ result?: Record<string, unknown> }>(text, path);
	return data.result ?? {};
}

export interface FfMinigameStatRow {
	current_ccu: number;
	total_spent: number;
	total_games_played: number;
	total_wins: number;
	total_losses: number;
}

export async function ffGetMinigameStats(): Promise<Record<string, FfMinigameStatRow>> {
	const path = "/statistics/minigames";
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `minigame stats failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ stats?: Record<string, FfMinigameStatRow> }>(text, path);
	return data.stats ?? {};
}

export async function ffGetInventoryRows(userId: string): Promise<string[][]> {
	const path = `/users/${encodeURIComponent(userId)}/inventory`;
	const res = await ffFetch(path);
	const text = await res.text();
	if (!res.ok) {
		throw new FortuneFrenzyApiError(res.status, `inventory failed (HTTP ${res.status}): ${text.slice(0, 400)}`, text);
	}
	const data = safeJson<{ inventory?: string[][] }>(text, path);
	return data.inventory ?? [];
}

/** Authenticated smoke test (`GET /leaderboard`) — verifies API keys / bypass work. */
export async function ffAuthedSmokePing(): Promise<{
	ok: boolean;
	latencyMs: number;
	statusCode: number;
	detail?: string;
}> {
	const t0 = Date.now();
	try {
		const path = "/leaderboard";
		const res = await ffFetch(path);
		const text = await res.text();
		const latencyMs = Date.now() - t0;
		if (!res.ok) {
			return { ok: false, latencyMs, statusCode: res.status, detail: text.slice(0, 240) };
		}
		safeJson(text, path);
		return { ok: true, latencyMs, statusCode: res.status };
	} catch (err: unknown) {
		const latencyMs = Date.now() - t0;
		if (err instanceof Error && err.message.includes("FF API auth:")) {
			return { ok: false, latencyMs, statusCode: 0, detail: err.message };
		}
		const msg = err instanceof FortuneFrenzyApiError ? err.message : err instanceof Error ? err.message : String(err);
		return { ok: false, latencyMs, statusCode: -1, detail: msg.slice(0, 400) };
	}
}

export interface FfHealthPingResult {
	baseUrl: string;
	ok: boolean;
	latencyMs: number;
	statusCode: number;
	bodyPreview?: string;
	error?: string;
}

/**
 * Unauthenticated `GET /health` — matches fortune-frenzy-internal-go (no API key or bypass).
 */
export async function ffPingHealth(): Promise<FfHealthPingResult> {
	const baseUrl = getBaseUrl();
	const url = `${baseUrl}/health`;
	const t0 = Date.now();
	try {
		const res = await fetch(url, { method: "GET" });
		const latencyMs = Date.now() - t0;
		const text = await res.text();
		return {
			baseUrl,
			ok: res.ok,
			latencyMs,
			statusCode: res.status,
			bodyPreview: text.slice(0, 280),
		};
	} catch (err: unknown) {
		const latencyMs = Date.now() - t0;
		const msg = err instanceof Error ? err.message : String(err);
		return { baseUrl, ok: false, latencyMs, statusCode: 0, error: msg };
	}
}
