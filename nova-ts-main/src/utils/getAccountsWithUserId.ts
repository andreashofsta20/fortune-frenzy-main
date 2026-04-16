import { PoolConnection } from "mariadb";
import query from "./smartQuery.js";

export default async function (
	connection: PoolConnection,
	user_id: string,
): Promise<
	{
		discord_id: string;
		claims_cache: {
			preferred_username: string;
			sub: number;
		};
		public_fingerprint: string;
	}[]
> {
	const accounts = await query(
		connection,
		"SELECT discord_id, claims_cache, public_fingerprint FROM `roblox_oauth_data` WHERE JSON_EXTRACT(claims_cache, '$.sub') = ?",
		[user_id],
	);

	return accounts;
}
