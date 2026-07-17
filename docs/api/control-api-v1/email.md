# Email API

Email endpoints expose configured IMAP/SMTP accounts through the Control API.
Accounts are always loaded by `accountId` and authenticated user ownership.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/email/messages` | `email:read` |
| `GET /api/v1/email/message` | `email:read` |
| `POST /api/v1/email/send` | `email:write` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/email/messages`

Lists recent INBOX messages for an owned account.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `accountId` | string | Yes | Email account id |
| `sinceUid` | integer | No | Return messages newer than this UID |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/email/messages?accountId=$EMAIL_ACCOUNT_ID"
```

## `GET /api/v1/email/message`

Fetches one message by IMAP UID and marks it as read.

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/email/message?accountId=$EMAIL_ACCOUNT_ID&uid=1"
```

## `POST /api/v1/email/send`

Sends an email through the account SMTP configuration.

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/email/send \
  -d '{"accountId":"'"$EMAIL_ACCOUNT_ID"'","to":"recipient@example.com","subject":"Hello","body":"Body"}'
```

Response:

```json
{
  "data": {
    "sent": true
  }
}
```
