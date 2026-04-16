import mariadb from "mariadb";

let pools: { [key: string]: mariadb.Pool | undefined } = {};
type DatabaseName = "NovawareDiscord" | "Game1";

const credentials = {
	NovawareDiscord: [process.env.DISCORD_MARIADB_USER, process.env.DISCORD_MARIADB_PASSWORD] as const,
	Game1: [process.env.GAME1_MARIADB_USER, process.env.GAME1_MARIADB_PASSWORD] as const,
};

/** Default matches upstream Novaware ProxySQL; set DISCORD_MARIADB_HOST / DISCORD_MARIADB_PORT if you self-host. */
function dbHost(): string {
	return (process.env.DISCORD_MARIADB_HOST ?? "proxysql").trim() || "proxysql";
}

function dbPort(): number {
	const p = parseInt(process.env.DISCORD_MARIADB_PORT ?? "6033", 10);
	return Number.isFinite(p) ? p : 6033;
}

function initializePool(database: DatabaseName): void {
	if (pools[database]) {
		return;
	}
	const user = credentials[database][0]?.trim();
	const password = credentials[database][1]?.trim();
	if (!user || !password) {
		console.warn(
			`[mariaService] No pool for "${database}" — DB-backed Novaware commands are disabled. Fortune Frenzy /ff* commands do not use MariaDB.`,
		);
		return;
	}

	console.log(`[mariaService] Initialising MariaDB pool for ${database}`);
	pools[database] = mariadb.createPool({
		host: dbHost(),
		port: dbPort(),
		user,
		password,
		database: database,
		connectionLimit: 30,
	});
}

export async function getMariaConnection(database: DatabaseName = "NovawareDiscord") {
	initializePool(database);
	const pool = pools[database];
	if (!pool) {
		throw new Error(
			`MariaDB "${database}" is not configured. Set DISCORD_MARIADB_USER/PASSWORD (and optional DISCORD_MARIADB_HOST) or GAME1_* only if you use those features.`,
		);
	}
	return pool.getConnection();
}

/** True if credentials are present for that logical DB (Novaware levelling/verify vs Game1 tools). */
export function isMariaPoolConfigured(database: DatabaseName = "NovawareDiscord"): boolean {
	const user = credentials[database][0]?.trim();
	const password = credentials[database][1]?.trim();
	return Boolean(user && password);
}
