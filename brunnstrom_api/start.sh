#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# start.sh — run uvicorn + cloudflared together
#
# Usage:
#   ./start.sh                    # quick tunnel (random *.trycloudflare.com URL)
#   ./start.sh --named <name>     # named tunnel (stable URL, requires cloudflared login)
#
# A consistent URL across restarts requires a NAMED tunnel:
#   1. cloudflared tunnel login
#   2. cloudflared tunnel create rehabvision
#   3. cloudflared tunnel route dns rehabvision rehab.<your-domain>
#   4. ./start.sh --named rehabvision
#
# Without --named, a quick tunnel is used and the URL changes every run.
# In that case the script writes the new URL to ../tunnel_url.txt and patches
# src/hooks/useBrunnstromPrediction.ts automatically.
# ---------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-8001}"
LOG_DIR="$SCRIPT_DIR/.logs"
mkdir -p "$LOG_DIR"
UVICORN_LOG="$LOG_DIR/uvicorn.log"
CLOUDFLARED_LOG="$LOG_DIR/cloudflared.log"
URL_FILE="$PROJECT_ROOT/tunnel_url.txt"
HOOK_FILE="$PROJECT_ROOT/src/hooks/useBrunnstromPrediction.ts"

NAMED_TUNNEL=""
if [[ "${1:-}" == "--named" ]]; then
  NAMED_TUNNEL="${2:-}"
  if [[ -z "$NAMED_TUNNEL" ]]; then
    echo "ERROR: --named requires a tunnel name" >&2
    exit 1
  fi
fi

cleanup() {
  echo ""
  echo "[start.sh] Shutting down..."
  [[ -n "${UVICORN_PID:-}" ]] && kill "$UVICORN_PID" 2>/dev/null || true
  [[ -n "${CF_PID:-}" ]]      && kill "$CF_PID"      2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

# --- 1. uvicorn -------------------------------------------------------------
echo "[start.sh] Starting uvicorn on :$PORT ..."
cd "$SCRIPT_DIR"
uvicorn main:app --host 0.0.0.0 --port "$PORT" >"$UVICORN_LOG" 2>&1 &
UVICORN_PID=$!

# wait for uvicorn /health
for i in {1..30}; do
  if curl -sf "http://localhost:$PORT/health" >/dev/null; then
    echo "[start.sh] uvicorn ready (pid $UVICORN_PID)"
    break
  fi
  sleep 1
  if [[ $i -eq 30 ]]; then
    echo "ERROR: uvicorn failed to start. See $UVICORN_LOG" >&2
    cat "$UVICORN_LOG" >&2
    cleanup
  fi
done

# --- 2. cloudflared ---------------------------------------------------------
if [[ -n "$NAMED_TUNNEL" ]]; then
  echo "[start.sh] Starting NAMED tunnel: $NAMED_TUNNEL"
  cloudflared tunnel --url "http://localhost:$PORT" run "$NAMED_TUNNEL" \
    >"$CLOUDFLARED_LOG" 2>&1 &
  CF_PID=$!
  echo "[start.sh] Named tunnel running (pid $CF_PID). URL is whatever you routed via 'cloudflared tunnel route dns'."
else
  echo "[start.sh] Starting QUICK tunnel (URL will change each run)..."
  cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate \
    >"$CLOUDFLARED_LOG" 2>&1 &
  CF_PID=$!

  # extract the trycloudflare URL from logs
  TUNNEL_URL=""
  for i in {1..40}; do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CLOUDFLARED_LOG" | head -n1 || true)
    [[ -n "$TUNNEL_URL" ]] && break
    sleep 1
  done

  if [[ -z "$TUNNEL_URL" ]]; then
    echo "ERROR: could not detect cloudflared URL. See $CLOUDFLARED_LOG" >&2
    cat "$CLOUDFLARED_LOG" >&2
    cleanup
  fi

  echo "$TUNNEL_URL" >"$URL_FILE"
  echo "[start.sh] Tunnel URL: $TUNNEL_URL"
  echo "[start.sh] Saved to $URL_FILE"

  # auto-patch the frontend hook so the app picks up the new URL
  if [[ -f "$HOOK_FILE" ]]; then
    if grep -qE 'https://[a-z0-9-]+\.trycloudflare\.com' "$HOOK_FILE"; then
      # portable in-place sed (mac + linux)
      tmp="$(mktemp)"
      sed -E "s|https://[a-z0-9-]+\.trycloudflare\.com|$TUNNEL_URL|g" "$HOOK_FILE" >"$tmp"
      mv "$tmp" "$HOOK_FILE"
      echo "[start.sh] Patched $HOOK_FILE with new tunnel URL."
      echo "[start.sh] Commit & push so Lovable preview picks it up:"
      echo "           git add src/hooks/useBrunnstromPrediction.ts && git commit -m 'tunnel url' && git push"
    fi
  fi
fi

echo ""
echo "[start.sh] Logs:"
echo "  uvicorn:     tail -f $UVICORN_LOG"
echo "  cloudflared: tail -f $CLOUDFLARED_LOG"
echo "[start.sh] Press Ctrl-C to stop both."

wait