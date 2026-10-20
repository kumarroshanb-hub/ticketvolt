#!/bin/sh
# backend/entrypoint.sh
#
# ✅ FIX [P39]: only run migrations + collectstatic when RUN_MIGRATIONS=1.
#
# Docker Compose starts `backend`, `celery-worker`, and `celery-beat`
# from the same image with the same entrypoint. Previously all three
# ran `migrate` concurrently on boot, which can produce partial
# migrations or a Postgres "relation already exists" race.
#
# The primary `backend` service sets RUN_MIGRATIONS=1; workers set 0.
#
# Behaviour is backwards-compatible: if RUN_MIGRATIONS is unset, we do
# NOT run migrate — this matches "worker container" semantics and is
# the safe default. The primary service in docker-compose.prod.yml
# explicitly sets it to 1.

set -e

if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "🚀 Running migrations..."
    python manage.py migrate --noinput

    echo "📦 Collecting static files..."
    python manage.py collectstatic --noinput

    # ✅ FIX [P39]: wait for Redis to be reachable before the app starts
    # accepting traffic. Celery brokers will retry on their own, but the
    # Django app can crash-loop if a view triggers a Redis read on the
    # first request. Fail-open here (warn, don't abort) — the container
    # should still start so operators can hit `/health/` to diagnose.
    if [ -n "${REDIS_URL:-}" ]; then
        echo "⏳ Waiting for Redis at ${REDIS_URL}..."
        # Extract host:port from redis://host:port/db — best-effort, no
        # external dependencies (netcat is not in python:3.11-slim).
        REDIS_HOSTPORT="$(printf '%s' "$REDIS_URL" | sed -E 's#^redis://([^/]+).*#\1#')"
        REDIS_HOST="${REDIS_HOSTPORT%%:*}"
        REDIS_PORT="${REDIS_HOSTPORT##*:}"
        [ "$REDIS_PORT" = "$REDIS_HOSTPORT" ] && REDIS_PORT="6379"

        python - <<PY || true
import socket, sys, time
host, port = "${REDIS_HOST}", int("${REDIS_PORT}")
deadline = time.time() + 30
while time.time() < deadline:
    try:
        with socket.create_connection((host, port), timeout=2):
            print(f"✅ Redis reachable at {host}:{port}")
            sys.exit(0)
    except OSError:
        time.sleep(1)
print(f"⚠️ Redis not reachable at {host}:{port} after 30s — continuing anyway")
sys.exit(0)
PY
    else
        echo "ℹ️ REDIS_URL not set — skipping Redis readiness check."
    fi
else
    echo "⏭️  Skipping migrate/collectstatic (RUN_MIGRATIONS=${RUN_MIGRATIONS:-0})"
fi

exec "$@"