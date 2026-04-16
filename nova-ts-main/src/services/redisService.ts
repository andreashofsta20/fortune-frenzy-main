import { createClient, RedisClientType } from "redis";

let client: RedisClientType | undefined;

function buildRedisUrl(): string {
	if (process.env.REDIS_URL !== undefined && process.env.REDIS_URL !== "") {
		return process.env.REDIS_URL;
	}
	const host = process.env.REDIS_HOST ?? "127.0.0.1";
	const port = process.env.REDIS_PORT ?? "6379";
	const password = process.env.REDIS_PASSWORD;
	if (password !== undefined && password !== "") {
		const enc = encodeURIComponent(password);
		return `redis://:${enc}@${host}:${port}`;
	}
	return `redis://${host}:${port}`;
}

async function initialize(): Promise<void> {
	const url = buildRedisUrl();
	client = createClient({
		url,
		socket: {
			reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
		},
	});

	client.on("error", (error) => {
		console.error("Redis Client Error:", error);
	});

	await client.connect();
}

export async function getRedisConnection(): Promise<RedisClientType> {
	if (!client) {
		await initialize();
	}
	return client!;
}
