#!/bin/sh
# Substitute env vars into hooks template and start the webhook server
set -e

if [ -z "${WEBHOOK_SECRET:-}" ]; then
  echo "ERROR: WEBHOOK_SECRET is required" >&2
  exit 1
fi

envsubst < /etc/webhook/hooks.json.tmpl > /tmp/hooks.json

echo "=== Allerac Webhook Server starting ==="
echo "    Listening on :9000/hooks/deploy"

exec webhook \
  -hooks=/tmp/hooks.json \
  -verbose \
  -port=9000 \
  -ip=0.0.0.0
