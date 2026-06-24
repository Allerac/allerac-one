# Prod Azure Deploy

## Purpose

`prod-azure` is the Azure VM deployment. It should be treated as the production
environment, even while Allerac One is still evolving quickly.

The target model is:

| Branch | Environment | Meaning |
|---|---|---|
| `development` | Release candidate / rehearsal | Validate the next production change |
| `main` | Production | Stable promoted release |

For now, the Azure VM can run a controlled release rehearsal from `development`.
After the rehearsal passes, production should return to deploying from `main`.

## Release Rehearsal

Use this when a PR has already been merged into `development` and you want to test
the production deploy path before promoting the change to `main`.

On the Azure VM, from the repository directory:

```bash
git fetch origin
git checkout development
ALLERAC_PRODUCT_LINE=cloud DEPLOY_BRANCH=development ./update.sh
```

This exercises the same update path as production:

1. creates a pre-update database backup;
2. pulls the selected branch;
3. runs migrations;
4. rebuilds containers;
5. restarts services;
6. verifies the app healthcheck.

Because the merge to `development` already happened, configuring the webhook after
the fact will not replay that push event. Run the first rehearsal manually, then
enable the webhook for future pushes.

## Production Deploy

The normal production policy is:

```env
DEPLOY_BRANCH=main
DEPLOY_VM_NAME=prod-azure
ALLERAC_PRODUCT_LINE=cloud
```

Production promotion should follow this sequence:

1. `development` is green in CI.
2. A GitHub pre-release is created from the release candidate commit.
3. The pre-release workflow passes the Playwright release smoke.
4. `development` is merged into `main`.
5. Azure deploys `main`.

Manual production deploy:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
ALLERAC_PRODUCT_LINE=cloud DEPLOY_BRANCH=main bash ./update.sh
```

## Webhook Configuration

The same webhook container used by sandbox can deploy Azure.

Azure `.env`:

```env
COMPOSE_PROFILES=cloud,webhook
ALLERAC_PRODUCT_LINE=cloud
DEPLOY_BRANCH=main
DEPLOY_VM_NAME=prod-azure
WEBHOOK_SECRET=<generated-secret>
GITHUB_DEPLOY_TOKEN=<token-if-repo-is-private>
TELEGRAM_DEPLOY_BOT_TOKEN=
TELEGRAM_DEPLOY_CHAT_ID=
```

For a temporary release rehearsal, set:

```env
DEPLOY_BRANCH=development
```

Start the webhook:

```bash
docker compose --profile webhook up -d webhook
```

If the Azure VM uses the Cloudflare Tunnel profile, keep the tunnel profile active
as well:

```bash
docker compose --profile cloud --profile webhook up -d webhook tunnel
```

The webhook listens inside the container on port `9000` and is published on the
host as:

```text
http://<azure-host>:9999/hooks/deploy
```

Route the public GitHub webhook URL to that endpoint through the existing Azure
network path or Cloudflare route.

## GitHub Webhook

In GitHub repository settings:

1. Go to **Settings -> Webhooks**.
2. Add a webhook.
3. Payload URL:

   ```text
   https://<azure-public-url>/hooks/deploy
   ```

4. Content type:

   ```text
   application/json
   ```

5. Secret: same value as `WEBHOOK_SECRET`.
6. Events: **Just the push event**.
7. Active: enabled.

The webhook ignores pushes whose `ref` does not match:

```text
refs/heads/$DEPLOY_BRANCH
```

## Automatic Release Deploy

The webhook also exposes a release endpoint:

```text
https://<azure-public-url>/hooks/deploy-release
```

Use this endpoint for production release automation. It runs the same deploy
script, but only when all of these conditions are true:

- the GitHub webhook signature matches `WEBHOOK_SECRET`;
- the release event action is `published`;
- the release is not marked as a pre-release;
- the release target branch matches `DEPLOY_BRANCH`.

For production, keep:

```env
DEPLOY_BRANCH=main
```

GitHub webhook setup:

1. Go to **Settings -> Webhooks**.
2. Add a webhook.
3. Payload URL:

   ```text
   https://<azure-public-url>/hooks/deploy-release
   ```

4. Content type:

   ```text
   application/json
   ```

5. Secret: same value as `WEBHOOK_SECRET`.
6. Events: select **Let me select individual events** and enable **Releases**.
7. Active: enabled.

This webhook is intentionally separate from the push deploy hook. Push deploys are
useful for sandbox or controlled branch environments; final release deploys should
come from GitHub Releases.

## Validation

After the rehearsal or production deploy:

```bash
docker compose ps
docker compose logs --tail=100 app
```

Then validate the Control API from Bruno or curl:

```bash
curl -s \
  -H "Cookie: session_token=$SESSION_TOKEN" \
  https://<azure-app-url>/api/v1/me
```

Expected result:

```json
{
  "data": {
    "user": {
      "id": "user-id",
      "email": "user@example.com",
      "authMode": "session"
    }
  }
}
```

## Rollback

`update.sh` creates a database backup before migrations and prints rollback
commands if the deploy fails.

For production incidents, prefer this order:

1. inspect logs;
2. decide whether schema rollback is required;
3. restore the pre-update database backup only when needed;
4. checkout the previous application revision;
5. rebuild and restart Compose services.
