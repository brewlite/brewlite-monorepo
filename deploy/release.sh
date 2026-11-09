#!/usr/bin/env bash
# Run on the existing EC2 stack; no seed, reset, volume deletion or env rewriting.
set -Eeuo pipefail
umask 077
sha=${1:?commit SHA required}
prefix=${2:?GHCR image prefix required}
allow_migrations=${3:-false}
[[ "$sha" =~ ^[a-f0-9]{40}$ ]] || exit 2
[[ "$prefix" =~ ^ghcr.io/[a-z0-9_./-]+$ ]] || exit 2
deploy_dir=${BREWLITE_DEPLOY_DIR:-/home/ubuntu/brewlite}
[[ "$deploy_dir" == /* && "$deploy_dir" != / ]] || exit 2
cd "$deploy_dir"
[[ -f deploy/.env.production ]] || { echo 'Missing private runtime configuration'; exit 2; }
exec 9>.deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 2; }
compose=(docker compose --env-file deploy/.env.production -f compose.prod.yml)
old_api=$(docker inspect --format '{{.Image}}' brewlite-api-1)
old_web=$(docker inspect --format '{{.Image}}' brewlite-web-1)
# Incoming files are kept separate until the deployment lock is held.
incoming="$deploy_dir/.incoming/$sha"
test -f "$incoming/compose.prod.yml" && test -f "$incoming/smoke.mjs"
receipt="deploy/releases/$sha/$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$receipt"
cp compose.prod.yml "$receipt/previous-compose.yml"
cp "$incoming/compose.prod.yml" compose.prod.yml
cp "$incoming/smoke.mjs" deploy/smoke.mjs
export API_IMAGE="$prefix/api:$sha" WEB_IMAGE="$prefix/web:$sha"
"${compose[@]}" config --quiet
"${compose[@]}" pull api web
mkdir -p deploy/backups deploy/releases
mkdir -p "$receipt"
printf '%s\n' "$old_api" > "$receipt/previous-api"
printf '%s\n' "$old_web" > "$receipt/previous-web"
printf '%s\n' "$API_IMAGE" > "$receipt/api-image"
printf '%s\n' "$WEB_IMAGE" > "$receipt/web-image"
# Status is read-only. Any nonzero status requires explicit migration review.
needs_migration=false
"${compose[@]}" run --rm --no-deps api node node_modules/prisma/build/index.js migrate status >/dev/null 2>&1 || needs_migration=true
if [[ "$needs_migration" == true && "$allow_migrations" != true ]]; then
  echo 'Pending migration or database status error. Review migration and rerun with approval; no services changed.'; exit 3
fi
backup="deploy/backups/$sha-$(date -u +%Y%m%dT%H%M%SZ)-$$.dump"
"${compose[@]}" exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$backup"
test -s "$backup"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup" >/dev/null
migration_started=false
rollback() {
  rc=$?
  trap - ERR
  if [[ "$migration_started" == false ]]; then
    echo 'Release failed; restoring previous application images.'
    API_IMAGE="$old_api" WEB_IMAGE="$old_web" "${compose[@]}" up -d --no-deps api web || true
  else
    echo 'Release failed after migration began. Automatic old-image rollback blocked: schema may be incompatible. Keep backup; review forward fix.'
  fi
  exit "$rc"
}
trap rollback ERR
if [[ "$needs_migration" == true ]]; then
  "${compose[@]}" stop api web
  migration_started=true
  "${compose[@]}" run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
fi
"${compose[@]}" up -d --no-deps api web
for attempt in $(seq 1 40); do
  state=$(docker inspect --format '{{.State.Health.Status}}' brewlite-api-1)
  [[ "$state" == healthy ]] && break
  sleep 3
done
[[ "$(docker inspect --format '{{.State.Health.Status}}' brewlite-api-1)" == healthy ]]
# Same network/application runtime as the API, HTTPS public origin from existing env.
docker exec -i brewlite-api-1 node --input-type=module - < deploy/smoke.mjs
printf '%s\n' "$sha" > deploy/releases/current
trap - ERR
echo "Release $sha passed backup, migration gate and smoke checks."
