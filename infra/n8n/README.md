# n8n workflows

See [`docs/roadmap/n8n-workflow-integration.md`](../../docs/roadmap/n8n-workflow-integration.md)
for the full context. n8n workflows are portable JSON, so demo/reference workflows
live here as code instead of only existing inside one person's n8n instance.

Credentials are never stored in these files. A workflow that calls the Allerac
Control API references a credential by name (e.g. `Allerac API Key`, an n8n
"Header Auth" credential holding `Authorization: Bearer <token>`) that must be
created once, locally, in the n8n UI — the secret itself never leaves that instance.

## Importing a workflow

```bash
docker cp infra/n8n/workflows/demo-trigger-allerac-job.json allerac-n8n:/tmp/workflow.json
docker compose exec n8n n8n import:workflow --input=/tmp/workflow.json
```

Then open n8n (`http://localhost:5678`), open the imported workflow, click the
HTTP Request node, and attach (or create) the `Allerac API Key` credential:

1. Create a Control API key in Allerac (Settings → Control API Access), preset
   **Automation** or at least scope `jobs:write`.
2. In n8n, create a credential of type **Header Auth**: `Name: Authorization`,
   `Value: Bearer <the key>`.
3. Select that credential on the HTTP Request node.

## Workflows

- `demo-trigger-allerac-job.json` — Manual Trigger → HTTP Request →
  `POST /api/v1/jobs/:id/run`. Proof-of-connectivity demo: running it triggers an
  existing Allerac scheduled job on demand, independent of its cron schedule.
- `demo-receive-allerac-webhook.json` — Webhook node listening at
  `/webhook/allerac-job`. Receiving direction: an Allerac job with `webhook` in its
  `channels` and `webhookUrl` set to `http://n8n:5678/webhook/allerac-job` POSTs
  its cron-triggered execution result here as
  `{ job_id, content, delivered_at }`. Imported workflows are deactivated by
  default — after import, run `n8n publish:workflow --id=<id>` and restart the
  `n8n` container for the webhook route to actually bind.
