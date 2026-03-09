#!/bin/bash
#
# Allerac One — Auto-deploy script
# Triggered by GitHub push webhook → runs update.sh → sends email notification.
#
# Environment variables (injected by docker-compose):
#   WEBHOOK_SECRET        - HMAC secret (validated by webhook server before this script runs)
#   GITHUB_DEPLOY_TOKEN   - GitHub token for git pull authentication
#   RESEND_API_KEY        - Resend API key for email notifications
#   DEPLOY_NOTIFY_EMAIL   - Where to send deploy notifications
#   FROM_EMAIL            - Sender address (default: deploy@allerac.ai)
#   DEPLOY_VM_NAME        - Human-readable VM name shown in emails

PROJECT_DIR="/project"
LOG_FILE="/tmp/deploy-$(date +%Y%m%d-%H%M%S).log"
START_TIME=$(date +%s)
VM_NAME="${DEPLOY_VM_NAME:-$(hostname)}"
FROM_EMAIL="${FROM_EMAIL:-deploy@allerac.ai}"

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

# ── Email notification ────────────────────────────────────────────────────────

[ -z "${RESEND_API_KEY:-}" ] && exit "$UPDATE_EXIT"
[ -z "${DEPLOY_NOTIFY_EMAIL:-}" ] && exit "$UPDATE_EXIT"

# HTML-escape the deploy log to prevent rendering issues
DEPLOY_LOG=$(tail -30 "$LOG_FILE" \
  | sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g')

if [ "$UPDATE_EXIT" -eq 0 ]; then
  SUBJECT="✅ Deploy completed — ${VM_NAME}"
  STATUS_LABEL="Completed"
  STATUS_ICON="✅"
  HEADER_BG="#f0fdf4"
  HEADER_BORDER="#86efac"
  HEADER_COLOR="#15803d"
else
  SUBJECT="❌ Deploy failed — ${VM_NAME}"
  STATUS_LABEL="Failed"
  STATUS_ICON="❌"
  HEADER_BG="#fef2f2"
  HEADER_BORDER="#fca5a5"
  HEADER_COLOR="#b91c1c"
fi

HTML_BODY=$(cat <<HTMLEOF
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
  <tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12);">
      <tr>
        <td style="background:#0d0d0d;padding:20px 24px;">
          <span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#fff;">
            Allerac <span style="color:#39d353;">One</span>
          </span>
        </td>
      </tr>
      <tr>
        <td style="background:${HEADER_BG};border:1px solid ${HEADER_BORDER};padding:20px 24px;">
          <h2 style="margin:0 0 16px;color:${HEADER_COLOR};">${STATUS_ICON} Deploy ${STATUS_LABEL}</h2>
          <table style="width:100%;font-size:14px;border-collapse:collapse;color:#374151;">
            <tr>
              <td style="padding:5px 0;color:#6b7280;width:90px;">Server</td>
              <td style="padding:5px 0;font-weight:600;">${VM_NAME}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#6b7280;">Commit</td>
              <td style="padding:5px 0;font-family:'Courier New',monospace;">${NEW_COMMIT} &mdash; ${COMMIT_MSG}</td>
            </tr>
            <tr>
              <td style="padding:5px 0;color:#6b7280;">Duration</td>
              <td style="padding:5px 0;">${DURATION}s</td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:#fff;border:1px solid #e5e7eb;border-top:0;padding:20px 24px;border-radius:0 0 8px 8px;">
          <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#374151;">Deploy log (last 30 lines)</p>
          <pre style="margin:0;background:#f9fafb;padding:12px;border-radius:4px;font-size:11px;color:#374151;white-space:pre-wrap;word-break:break-all;">${DEPLOY_LOG}</pre>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>
HTMLEOF
)

JSON_PAYLOAD=$(jq -n \
  --arg from  "Allerac Deploy <${FROM_EMAIL}>" \
  --arg to    "${DEPLOY_NOTIFY_EMAIL}" \
  --arg subj  "${SUBJECT}" \
  --arg html  "${HTML_BODY}" \
  '{from: $from, to: [$to], subject: $subj, html: $html}')

curl -s -o /dev/null -w "%{http_code}" \
  -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer ${RESEND_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "${JSON_PAYLOAD}" \
  | grep -q "^2" \
  && echo "📧 Notification sent to ${DEPLOY_NOTIFY_EMAIL}" \
  || echo "⚠️  Failed to send email notification"

exit "$UPDATE_EXIT"
