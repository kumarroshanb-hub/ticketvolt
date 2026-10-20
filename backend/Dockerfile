# backend/Dockerfile
FROM python:3.11-slim

# Suppress debconf warnings
ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm

ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

WORKDIR /app

RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libmagic-dev \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# ✅ FIX [P38]: create a non-root user and pre-create /app owned by
# that user BEFORE pip install, so pip writes into a directory the
# runtime user can read (and so `collectstatic` at boot can write to
# `staticfiles/` without a root-owned subdirectory blocking it).
#
# Without this, the image ran as root — a well-known container security
# anti-pattern. Render runs containers as non-root by default, but
# locally and on any other platform the container was root.
RUN groupadd --system --gid 1001 app \
    && useradd --system --uid 1001 --gid app --create-home app \
    && mkdir -p /app && chown -R app:app /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=app:app . .

# Copy and enable the entrypoint script, owned by the runtime user.
COPY --chown=app:app entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ✅ FIX [P38]: drop privileges before exposing the port. The container
# now runs as `app`, not `root`. Any file the app writes (logs, media,
# staticfiles) must live in a directory the `app` user owns — which is
# why /app is chowned above.
USER app

EXPOSE 8000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "core.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "2", "--timeout", "120"]