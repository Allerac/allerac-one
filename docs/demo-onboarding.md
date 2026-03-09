# Allerac Demo — Early Adopter Onboarding

Complete process for enabling and revoking access for a demo user in the cloud environment.

## Overview

The demo environment runs on a GCloud VM protected by **Cloudflare Zero Trust**. Access is two-layered:

1. **Cloudflare policy** — controls who can reach the URL (network layer)
2. **App account** — controls the user's data and preferences

Users also receive an **Allerac API Key** to unlock Pro models (GPT-4o, Ministral, Gemini). Without it, Qwen (local) works out-of-the-box with no configuration required.

---

## Prerequisites

- Access to the Cloudflare Zero Trust dashboard (dashboard.cloudflare.com)
- Admin access to the app to create accounts
- An Allerac API Key available to distribute

---

## Step by Step — Enable a User

### 1. Add to the Cloudflare policy

1. Go to **Cloudflare Zero Trust → Access → Applications**
2. Select the `allerac-demo` application
3. Edit the active policy → add the user's email under **Include → Emails**
4. Save

> The user can access the URL immediately after this step.

### 2. Create the app account

1. Access the app as admin
2. Go to **Settings → Users** (or directly via DB if no admin UI exists yet)
3. Create the account with the user's email and a temporary password

```sql
-- Alternative via DB (replace values)
INSERT INTO users (email, password_hash, created_at)
VALUES ('user@email.com', crypt('temporary-password', gen_salt('bf')), NOW());
```

### 3. Send the welcome message

Send an email or message with the following:

```
Hi [name],

Your Allerac access is ready!

URL:      https://demo.allerac.ai   (or the current environment URL)
Email:    [email]
Password: [temporary-password]  ← please change on first login

Allerac API Key: [key]
  → Paste it in Settings → API Keys → Allerac API Key
  → Unlocks GPT-4o, Ministral, and Gemini Flash
  → Without it, the Qwen model works right away with no setup needed

Feel free to reply to this message with any questions.
```

---

## Revoking Access

To remove a user from the demo:

1. Go to **Cloudflare Zero Trust → Access → Applications → allerac-demo**
2. Edit the policy → remove the user's email
3. Save

Access is blocked immediately at the network layer. No action is needed in the app.

> Optional: deactivating the account in the app prevents the user's data from remaining active, but is not required to block access.

---

## API Key Management

| Situation | Action |
|-----------|--------|
| User hits rate limits | GitHub returns 429 automatically — no action needed |
| Revoke a specific user's key | Generate a new key on GitHub and redistribute to the remaining users |
| User lost their key | Resend the same key or generate a new one |

> Each Allerac API Key is a GitHub Personal Access Token generated under the `allerac-demo` account in the Allerac GitHub org. Manage them at: **github.com → Settings → Developer settings → Personal access tokens**.

---

## Demo User Tracking

Keep a simple list while the volume is small:

| Name | Email | Access date | API Key sent | Status |
|------|-------|-------------|--------------|--------|
| ... | ... | ... | yes/no | active/revoked |

---

## Next Steps (as the demo grows)

- Landing page with a "Request access" button → form → manual approval
- `demo` role in the `users` table to limit features by tier within the app
- Per-user API key rotation
