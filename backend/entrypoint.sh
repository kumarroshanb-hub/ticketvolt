#!/bin/sh
# backend/entrypoint.sh
#
# ✅ FIX [P39]: only run migrations + collectstatic when RUN_MIGRATIONS=1.
#
# ✅ FIX [P39-bug]: WhiteNoise warns "No directory at: /app/staticfiles/"
# if `collectstatic` hasn't run before Gunicorn boots. The previous
# version of this script skipped BOTH migrate AND collectstatic when
# RUN_MIGRATIONS=0, which is fine for celery-worker/beat — but if the
# primary `backend` service was ever started without RUN_MIGRATIONS=1,
# no static files existed at runtime and WhiteNoise complained on every
# request that touched a static URL.
#
# The fix: decouple the two. `collectstatic` ALWAYS runs on the
# primary service (it's idempotent and fast). `migrate` runs only when
# RUN_MIGRATIONS=1. Workers skip both.

set -e

# -------------------- collectstatic --------------------
# Always run on the primary service. Idempotent, cheap, and required
# for WhiteNoise to find the static root at runtime.
if [ "${RUN_COLLECTSTATIC:-1}" = "1" ]; then
    echo "📦 Collecting static files..."
    python manage.py collectstatic --noinput
else
    echo "⏭️  Skipping collectstatic (RUN_COLLECTSTATIC=${RUN_COLLECTSTATIC:-0})"
fi

# -------------------- migrate --------------------
if [ "${RUN_MIGRATIONS:-0}" = "1" ]; then
    echo "🚀 Running migrations..."
    python manage.py migrate --noinput

    # Wait for Redis to be reachable before accepting traffic. Fail-open.
    if [ -n "${REDIS_URL:-}" ]; then
        echo "⏳ Waiting for Redis at ${REDIS_URL}..."
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
    echo "⏭️  Skipping migrate (RUN_MIGRATIONS=${RUN_MIGRATIONS:-0})"
fi

exec "$@"