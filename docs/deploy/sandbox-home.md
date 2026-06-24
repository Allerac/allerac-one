# Sandbox Home Deploy

## Purpose

`sandbox-home` is the home-machine deployment used to test branches before promoting
changes to production.

This environment should be automated enough to avoid manual `git pull` and
`docker compose up`, but still safe enough that production is not affected by
experimental branches.

## Current Mechanism

The repository already includes a `webhook` Compose profile:

```text
infra/webhook
```

The webhook receives GitHub push events, validates GitHub's HMAC signature with
`WEBHOOK_SECRET`, filters by `DEPLOY_BRANCH`, checks out that branch, and runs:

```bash
DEPLOY_BRANCH=<branch> ./update.sh
```

`update.sh` then:

1. creates a pre-update database backup;
2. pulls the configured branch;
3. runs migrations;
4. rebuilds images;
5. restarts Compose services;
6. verifies the app healthcheck.

## Branch Policy

During feature testing, the sandbox can temporarily deploy the active feature branch:

```env
DEPLOY_BRANCH=feature/control-api-next
```

After this branch is merged, change sandbox to track `development`:

```env
DEPLOY_BRANCH=development
```

Production should not use this sandbox branch. Production should track `main` or a
release-controlled branch.

## Environment Variables

On the home machine `.env`:

```env
COMPOSE_PROFILES=webhook
DEPLOY_BRANCH=feature/control-api-next
DEPLOY_VM_NAME=sandbox-home
WEBHOOK_SECRET=<generated-secret>
GITHUB_DEPLOY_TOKEN=<token-if-repo-is-private>
TELEGRAM_DEPLOY_BOT_TOKEN=
TELEGRAM_DEPLOY_CHAT_ID=
```

Generate a webhook secret:

```bash
openssl rand -hex 32
```

## Start The Webhook

From the repository directory on the home machine:

```bash
docker compose --profile webhook up -d webhook
```

To run it in the foreground while testing:

```bash
docker compose --profile webhook up webhook
```

The webhook listens inside the container on port `9000` and is published on the host
as:

```text
http://<sandbox-host>:9999/hooks/deploy
```

If the home machine is behind Cloudflare Tunnel or another reverse proxy, route the
public webhook URL to port `9999`.

## GitHub Webhook

In GitHub repository settings:

1. Go to **Settings -> Webhooks**.
2. Add a webhook.
3. Payload URL:

   ```text
   https://<sandbox-public-url>/hooks/deploy
   ```

4. Content type:

   ```text
   application/json
   ```

5. Secret: same value as `WEBHOOK_SECRET`.
6. Events: **Just the push event**.
7. Active: enabled.

The local webhook will ignore pushes whose `ref` does not match:

```text
refs/heads/$DEPLOY_BRANCH
```

## Manual Test

After starting the webhook and configuring GitHub, push a small commit to the
configured branch and watch:

```bash
docker compose logs -f webhook
```

Expected log flow:

```text
Deploy branch: feature/control-api-next
Deploy triggered
Update completed successfully
```

Then verify:

```bash
docker compose ps app
docker compose logs --tail=100 app
```

## Rollback

`update.sh` prints rollback instructions if migrations, builds, restarts, or health
verification fail. It also creates a pre-update database backup before changing code
or schema.

For sandbox, prefer fixing forward unless the machine is unusable. For production,
use a stricter release process and manual approval.
