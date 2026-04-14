#!/usr/bin/env bash
# Wipe marketplace listings, open trades (MariaDB), and ephemeral minigame state (Redis).
# Does NOT remove: api_key:*, rolimons:catalog, user/inventory data, or item_copies.
#
# Usage (from fortune-frenzy-internal-go-main, with .env present):
#   ./scripts/wipe-game-state.sh
# Optional: also clear coinflip history table:
#   WIPE_COINFLIP_HISTORY=1 ./scripts/wipe-game-state.sh
#
# Manual Redis (password required — same as REDIS_PASSWORD in .env):
#   export REDISCLI_AUTH='your_redis_password'
#   for p in 'coinflip:*' 'coinflips:*' 'jackpot:*' 'casebattle*' 'packet:*' 'marketplace:items:last_seen:*'; do
#     redis-cli -h HOST -p 6379 --scan --pattern "$p" | xargs -r -n 50 redis-cli -h HOST -p 6379 DEL
#     (-n works on BusyBox/Alpine; GNU xargs -L is not available there.)
#   done
# (redis-cli reads REDISCLI_AUTH automatically; no -a on the command line.)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
	set -a
	# shellcheck disable=SC1091
	source .env
	set +a
fi

: "${MARIADB_HOST:=localhost}"
: "${MARIADB_PORT:=3306}"
: "${MARIADB_USER:=fortunefrenzy}"
: "${MARIADB_PASSWORD:?Set MARIADB_PASSWORD in .env or environment}"
: "${REDIS_HOST:=localhost}"
: "${REDIS_PORT:=6379}"

MARIADB_DB="${MARIADB_DATABASE:-Game1}"

if command -v mariadb >/dev/null 2>&1; then
	MYSQL_BIN=mariadb
elif command -v mysql >/dev/null 2>&1; then
	MYSQL_BIN=mysql
else
	echo "error: need mariadb or mysql client on PATH" >&2
	exit 1
fi

redis_del_pattern() {
	local pattern=$1
	local -a rargs=(-h "$REDIS_HOST" -p "$REDIS_PORT" --raw)
	if [[ -n "${REDIS_PASSWORD:-}" ]]; then
		rargs+=(-a "$REDIS_PASSWORD" --no-auth-warning)
	fi
	while IFS= read -r key; do
		[[ -z "$key" ]] && continue
		redis-cli "${rargs[@]}" DEL "$key" >/dev/null
	done < <(redis-cli "${rargs[@]}" --scan --pattern "$pattern")
}

echo "== MariaDB ($MARIADB_DB @ $MARIADB_HOST): listings + trades =="
"$MYSQL_BIN" -h"$MARIADB_HOST" -P"$MARIADB_PORT" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DB" <<SQL
DELETE FROM item_listings;
DELETE FROM trades;
SQL

if [[ "${WIPE_COINFLIP_HISTORY:-}" == "1" ]]; then
	echo "== MariaDB: truncating past_coinflips (WIPE_COINFLIP_HISTORY=1) =="
	"$MYSQL_BIN" -h"$MARIADB_HOST" -P"$MARIADB_PORT" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DB" \
		-e "TRUNCATE TABLE past_coinflips;"
fi

echo "== Redis ($REDIS_HOST:$REDIS_PORT): coinflips, jackpots, case battles, packet hashes, listing poll cache, item stakes =="
for pattern in 'coinflip:*' 'coinflips:*' 'jackpot:*' 'casebattle*' 'packet:*' 'marketplace:items:last_seen:*' 'itemstake:*'; do
	echo "  -- $pattern"
	redis_del_pattern "$pattern"
done

echo "Done. Roblox servers keep api_key:* until they re-register; in-flight packet responses were cleared."
