#!/bin/bash
#
# Allerac One — Auto-deploy script
# Triggered by GitHub push webhook → runs update.sh → sends Telegram notification.
#
# Environment variables (injected by docker-compose):
#   WEBHOOK_SECRET             - HMAC secret (validated by webhook server before this script runs)
#   GITHUB_DEPLOY_TOKEN        - GitHub token for git pull authentication
#   TELEGRAM_DEPLOY_BOT_TOKEN  - Bot token for deploy notifications (from @BotFather)
#   TELEGRAM_DEPLOY_CHAT_ID    - Your personal chat ID (run /start with the bot, then check getUpdates)
#   DEPLOY_VM_NAME             - Human-readable VM name shown in notifications

PROJECT_DIR="/project"
LOG_FILE="/tmp/deploy-$(date +%Y%m%d-%H%M%S).log"
START_TIME=$(date +%s)
VM_NAME="${DEPLOY_VM_NAME:-$(hostname)}"

# ── Git setup ─────────────────────────────────────────────────────────────────

cd "$PROJECT_DIR"

# Allow git to run in this directory (container/ownership mismatch)
git config --global --add safe.directory "$PROJECT_DIR" 2>/dev/null || true

# Configure HTTPS auth if token is provided
if [ -n "${GITHUB_DEPLOY_TOKEN:-}" ]; then
  REPO_HOST=$(git remote get-url origin 2>/dev/null \
    | sed 's|https://[^@]*@||; s|https://||; s|git@||; s|:.*||; s|/.*||')
  git config --global credential.helper "store --file=/tmp/.git-credentials"
  printf 'https://x-token:%s@%s\n' "${GITHUB_DEPLOY_TOKEN}" "${REPO_HOST}" \
    > /tmp/.git-credentials
  chmod 600 /tmp/.git-credentials
fi

OLD_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

echo "=== Deploy started at $(date) on ${VM_NAME} ===" | tee "$LOG_FILE"
echo "    Triggered by push — current commit: ${OLD_COMMIT}" | tee -a "$LOG_FILE"
echo "" | tee -a "$LOG_FILE"

# ── Run update.sh ─────────────────────────────────────────────────────────────

bash "$PROJECT_DIR/update.sh" 2>&1 | tee -a "$LOG_FILE"
UPDATE_EXIT=${PIPESTATUS[0]}

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
NEW_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
COMMIT_MSG=$(git log -1 --pretty=format:"%s" 2>/dev/null || echo "")

echo "" | tee -a "$LOG_FILE"
if [ "$UPDATE_EXIT" -eq 0 ]; then
  echo "=== ✅ Deploy completed in ${DURATION}s ===" | tee -a "$LOG_FILE"
else
  echo "=== ❌ Deploy FAILED (exit ${UPDATE_EXIT}) after ${DURATION}s ===" | tee -a "$LOG_FILE"
fi

# ── Telegram notification ──────────────────────────────────────────────────────

[ -z "${TELEGRAM_DEPLOY_BOT_TOKEN:-}" ] && exit "$UPDATE_EXIT"
[ -z "${TELEGRAM_DEPLOY_CHAT_ID:-}" ]   && exit "$UPDATE_EXIT"

if [ "$UPDATE_EXIT" -eq 0 ]; then
  ICON="✅"
  STATUS="Deploy completed"
else
  ICON="❌"
  STATUS="Deploy FAILED"
fi

MESSAGE="${ICON} <b>${STATUS}</b>
<b>Server:</b> ${VM_NAME}
<b>Commit:</b> <code>${NEW_COMMIT}</code> — ${COMMIT_MSG}
<b>Duration:</b> ${DURATION}s"

curl -s -o /dev/null \
  -X POST "https://api.telegram.org/bot${TELEGRAM_DEPLOY_BOT_TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${TELEGRAM_DEPLOY_CHAT_ID}" \
  --data-urlencode "text=${MESSAGE}" \
  --data-urlencode "parse_mode=HTML" \
  && echo "📨 Telegram notification sent" \
  || echo "⚠️  Failed to send Telegram notification"

exit "$UPDATE_EXIT"
