# Instagram Integration Setup Guide

## Overview

Allerac One integrates with Instagram via **Instagram Login for Business** (2024+ flow).
This allows the Social domain to publish posts, manage DMs, and interact with Instagram directly from chat.

---

## Prerequisites

- An Instagram account converted to **Business or Creator** (not Personal)
- A Meta Developer account at developers.facebook.com
- Access to the Allerac One `.env` file on the server

---

## Step 1 — Create a Meta Developer App

1. Go to **developers.facebook.com** → **My Apps → Create App**
2. App type: **Business** (or "Other" → Business)
3. Give it a name (e.g. `AlleracOne-IG`)

---

## Step 2 — Configure Use Cases

1. In the left menu, click **"Casos de Uso"** (Use Cases)
2. Find and add: **"Gerenciar mensagens e conteúdo no Instagram"**
3. Click on the use case → **"Permissões e recursos"**
4. Add and activate the following permissions (click each → Add):
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
   - `instagram_business_content_publish`
5. All three should show **"0 · Pronto para teste"**

---

## Step 3 — Configure Instagram Login for Business

1. Navigate directly to:
   ```
   https://developers.facebook.com/apps/YOUR_APP_ID/instagram-login/settings/
   ```
   Or: Left menu → **Painel** → **"Personalizar o caso de uso 'Gerenciar mensagens e conteúdo no Instagram'"**

2. Click **Step 4: "Configurar o login da empresa no Instagram"**
3. In **"URL de redirecionamento"** add:
   ```
   https://app.allerac.ai/api/instagram/callback
   ```
   (replace with your domain if self-hosting)
4. Save

> ⚠️ **Note:** The Meta Developer Console UI is buggy — fields may appear blank after saving.
> The data IS saved in the backend. Verify by checking if the validator accepts the URL.

---

## Step 4 — Get App Credentials

The Instagram Login for Business product has its **own App ID and Secret**, separate from the Facebook App ID.

1. Go to: `https://developers.facebook.com/apps/YOUR_APP_ID/instagram-login/settings/`
2. Note down:
   - **ID do app do Instagram** (Instagram App ID)
   - **Chave secreta do app do Instagram** (Instagram App Secret — click to reveal)

> ⚠️ Use these Instagram-specific credentials, NOT the main Facebook App ID/Secret.

---

## Step 5 — Add Test User (Development Mode)

In Development mode, only registered testers can authenticate.

1. Left menu → **"Funções do app"** → **"Testadores do Instagram"**
2. Add your Instagram username
3. Open Instagram → **Settings → Apps and Websites** (or go to `instagram.com/accounts/manage_access/`)
4. Accept the pending invitation

---

## Step 6 — Configure Environment Variables

Add to `.env` on the server:

```bash
INSTAGRAM_APP_ID=YOUR_INSTAGRAM_APP_ID       # from Step 4 (Instagram-specific, not Facebook)
INSTAGRAM_APP_SECRET=YOUR_INSTAGRAM_APP_SECRET
INSTAGRAM_REDIRECT_URI=https://yourdomain.com/api/instagram/callback
INSTAGRAM_CONFIG_ID=                          # leave empty — not used with Instagram Login for Business
```

Restart the container:
```bash
docker compose up -d --force-recreate app
```

Verify the vars are loaded:
```bash
docker exec allerac-app env | grep INSTAGRAM
```

---

## Step 7 — Connect in Allerac

1. Open Allerac → click the **⚙️ settings icon** (SystemDashboard)
2. Go to **📸 Social** tab
3. Click **"Connect Instagram"**
4. Complete the Instagram OAuth flow
5. You should be redirected back to `/social?instagram=connected`

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Invalid platform app` | Wrong OAuth URL or app type | Use `www.instagram.com/oauth/authorize` (Instagram Login for Business) |
| `Invalid Scopes` | Wrong scope names for app type | Use `instagram_business_basic`, `instagram_business_manage_messages`, `instagram_business_content_publish` |
| `Sorry, this page isn't available` | Redirect URI not configured | Complete Step 3 — add redirect URI in Instagram Login for Business settings |
| `Insufficient Developer Role` | Instagram account not a tester | Complete Step 5 — add as Instagram Tester and accept invite |
| `NEXT_REDIRECT` stored as error | Next.js redirect caught by try/catch | Fixed in code — callback re-throws NEXT_REDIRECT |
| Media not ready | Instagram processes images async | Fixed in code — publishPost polls for FINISHED status |
| `Content filter` (Azure) | Azure OpenAI content policy | Switch to a different model (Ollama/qwen) or use direct URL |

---

## OAuth Flow (Technical)

```
User clicks "Connect Instagram"
  → GET /api/instagram/auth
    → Sets CSRF state cookie
    → Redirects to www.instagram.com/oauth/authorize?client_id=INSTAGRAM_APP_ID&scope=instagram_business_basic,...
  → User logs in on Instagram
  → Instagram redirects to /api/instagram/callback?code=XXX&state=YYY
    → Validates CSRF state
    → POST api.instagram.com/oauth/access_token (short-lived token, 1h)
    → GET graph.instagram.com/v21.0/access_token (long-lived token, 60 days)
    → GET graph.instagram.com/v21.0/me (fetch username)
    → Saves encrypted token to instagram_credentials table
    → Redirects to /social?instagram=connected
```

---

## Publishing Posts (Technical)

Instagram Graph API is **asynchronous** for media publishing:

1. `POST /me/media` — create media container with `image_url` + `caption`
2. Poll `GET /{container_id}?fields=status_code` until `status_code = FINISHED` (up to 30s)
3. `POST /me/media_publish` — publish the container

Image requirements:
- Must be **publicly accessible HTTPS URL**
- Formats: JPEG, PNG
- Direct file URL (not a webpage)
- Recommended: upload to imgur.com → use `https://i.imgur.com/XXXXX.jpg`

---

## Scopes Reference

| Scope | Purpose |
|-------|---------|
| `instagram_business_basic` | Read profile, media info |
| `instagram_business_manage_messages` | Read/send DMs |
| `instagram_business_content_publish` | Publish posts |

---

## Going Live (Beyond PoC)

To allow users other than yourself to connect Instagram:

1. Complete **App Review** on Meta Developer Console
2. Request **Advanced Access** for each permission
3. Complete **Business Verification**
4. Switch app to **Live** mode

Until then, only users added as Testers can connect.
