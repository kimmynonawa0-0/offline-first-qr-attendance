#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"

fail() {
  echo "$1" >&2
  exit 1
}

[ -f .env ] || fail "Create server/.env first. See .env.example."

env_value() {
  sed -n "s/^$1=//p" .env | tail -n 1 | tr -d '\r'
}

api_domain=$(env_value API_DOMAIN)
admin_id=$(env_value ADMIN_ID)
admin_password=$(env_value ADMIN_PASSWORD)
manager_username=$(env_value MANAGER_USERNAME)
manager_password=$(env_value MANAGER_PASSWORD)

[ -n "$api_domain" ] || fail "Set API_DOMAIN in server/.env to the public API hostname."
[ "$api_domain" != "api.example.com" ] || fail "Replace the API_DOMAIN placeholder in server/.env."
case "$api_domain" in
  *://* | */* | *:* | *' '*)
    fail "API_DOMAIN must be a bare hostname such as api.example.com (no scheme, port, or path)."
    ;;
esac

case "$admin_password" in
  '' | replace-with-*) fail "Set a private ADMIN_PASSWORD in server/.env." ;;
esac
case "$manager_password" in
  '' | replace-with-*) fail "Set a private MANAGER_PASSWORD in server/.env." ;;
esac
[ ${#admin_password} -ge 12 ] || fail "ADMIN_PASSWORD needs at least 12 characters."
[ ${#manager_password} -ge 12 ] || fail "MANAGER_PASSWORD needs at least 12 characters."
[ -n "$admin_id" ] || fail "Set ADMIN_ID in server/.env."
[ -n "$manager_username" ] || fail "Set MANAGER_USERNAME in server/.env."
[ "$admin_id" != "$manager_username" ] || fail "ADMIN_ID and MANAGER_USERNAME must differ."

if [ -z "$(env_value WEB_ORIGINS)" ]; then
  echo "Warning: WEB_ORIGINS is empty; the Vercel PWA will be blocked by CORS until it is set." >&2
fi

compose() {
  docker compose -f docker-compose.yml -f docker-compose.prod.yml "$@"
}

echo "Deploying NORWEScan to https://$api_domain ..."
compose up -d --build --remove-orphans --wait --wait-timeout 180
compose ps
echo "API: https://$api_domain/health"
echo "Manager: https://$api_domain/manager"
