#!/bin/sh
# Root-wrapper для production Compose на VPS с ISPmanager.
set -eu

APP_DIR=/var/www/www-root/data/www/meaning.web-line.ru
ENV_DIR=/etc/meaning-relay
ENV_FILE=$ENV_DIR/production.env
MEANING_COMPOSE_FILE=$APP_DIR/docker-compose.vps.yml
MEANING_PROJECT=meaning_web_line

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

[ "$(id -u)" -eq 0 ] || fail 'Запускайте wrapper от root.'
[ -f "$MEANING_COMPOSE_FILE" ] || fail "Не найден $MEANING_COMPOSE_FILE"
[ -d "$ENV_DIR" ] && [ ! -L "$ENV_DIR" ] || fail "Не найден защищённый каталог $ENV_DIR"
[ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ] || fail "Не найден production.env"
[ "$(stat -c '%u:%a' "$ENV_DIR")" = '0:700' ] || fail "$ENV_DIR должен принадлежать root и иметь режим 700"
[ "$(stat -c '%u:%a' "$ENV_FILE")" = '0:600' ] || fail "production.env должен принадлежать root и иметь режим 600"
[ "$#" -gt 0 ] || fail 'Укажите Compose-команду.'
case "$1" in
  -*|'') fail 'Первым аргументом должна быть Compose-команда.' ;;
esac

cd "$APP_DIR"
set +u
unset COMPOSE_FILE COMPOSE_PROJECT_NAME DOCKER_HOST DOCKER_CONTEXT
set -u
export DOCKER_HOST=unix:///var/run/docker.sock

if docker compose version >/dev/null 2>&1; then
  exec docker compose --env-file "$ENV_FILE" -p "$MEANING_PROJECT" -f "$MEANING_COMPOSE_FILE" "$@"
fi
command -v docker-compose >/dev/null 2>&1 || fail 'Docker Compose не найден.'
exec docker-compose --env-file "$ENV_FILE" -p "$MEANING_PROJECT" -f "$MEANING_COMPOSE_FILE" "$@"
