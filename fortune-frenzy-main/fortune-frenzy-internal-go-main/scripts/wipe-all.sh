#!/usr/bin/env bash
# Wipe ALL Fortune Frenzy data: every MariaDB table (then minimal defaults) + Redis FLUSHDB.
# Destroys users, inventory, listings, catalog (items/cases), api keys in Redis, sessions, caches, etc.
#
# Usage (from fortune-frenzy-internal-go-main, with .env):
#   ./scripts/wipe-all.sh
# Re-apply item/case seeds after wipe (recommended):
#   ./scripts/wipe-all.sh --with-seeds
#
# Use Docker Compose services instead of host clients:
#   USE_DOCKER_COMPOSE=1 ./scripts/wipe-all.sh
#   USE_DOCKER_COMPOSE=1 ./scripts/wipe-all.sh --with-seeds
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

WITH_SEEDS=0
for arg in "$@"; do
	if [[ "$arg" == "--with-seeds" ]]; then
		WITH_SEEDS=1
	fi
done

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

SQL_FILE="$SCRIPT_DIR/wipe-all-data.sql"

run_sql_file() {
	local file=$1
	if [[ "${USE_DOCKER_COMPOSE:-}" == "1" ]]; then
		docker compose exec -T mariadb mariadb -h127.0.0.1 -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DB" <"$file"
	else
		if command -v mariadb >/dev/null 2>&1; then
			MYSQL_BIN=mariadb
		elif command -v mysql >/dev/null 2>&1; then
			MYSQL_BIN=mysql
		else
			echo "error: need mariadb or mysql client on PATH, or USE_DOCKER_COMPOSE=1" >&2
			exit 1
		fi
		"$MYSQL_BIN" -h"$MARIADB_HOST" -P"$MARIADB_PORT" -u"$MARIADB_USER" -p"$MARIADB_PASSWORD" "$MARIADB_DB" <"$file"
	fi
}

redis_flushdb() {
	if [[ "${USE_DOCKER_COMPOSE:-}" == "1" ]]; then
		: "${REDIS_PASSWORD:?Set REDIS_PASSWORD in .env for Redis auth}"
		docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" --no-auth-warning FLUSHDB
	else
		local -a rargs=(-h "$REDIS_HOST" -p "$REDIS_PORT")
		if [[ -n "${REDIS_PASSWORD:-}" ]]; then
			rargs+=(-a "$REDIS_PASSWORD" --no-auth-warning)
		fi
		redis-cli "${rargs[@]}" FLUSHDB
	fi
}

echo "== MariaDB: nuclear wipe ($MARIADB_DB) =="
run_sql_file "$SQL_FILE"

if [[ "$WITH_SEEDS" == "1" ]]; then
	echo "== MariaDB: applying migrations/002_seed_data.sql =="
	run_sql_file "$ROOT/migrations/002_seed_data.sql"
	echo "== MariaDB: applying migrations/003_seed_diceblox_cases.sql =="
	run_sql_file "$ROOT/migrations/003_seed_diceblox_cases.sql"
	echo "== MariaDB: applying migrations/004_fix_settings_and_tables.sql =="
	run_sql_file "$ROOT/migrations/004_fix_settings_and_tables.sql"
fi

echo "== Redis: FLUSHDB (all keys in selected logical DB) =="
redis_flushdb

echo "Done."
if [[ "$WITH_SEEDS" != "1" ]]; then
	echo "Catalog is empty (no items/cases). Re-run with --with-seeds or apply 002–004 manually."
fi
echo "Roblox/game servers must re-register (api_key:* and related Redis state were removed)."
