# Session Backlog

Persistent handoff for work that should continue in a later collaboration session.

## Working agreement

Every implementation follows this sequence:

1. changes are prepared locally;
2. the user tests and reviews them;
3. only after explicit approval does the user commit and publish them.

The assistant must not commit, push, merge, tag, release, or deploy changes.

## Next session

### Connect the Android robot app to production

**Status:** Ready to start

**Production baseline:** `v0.0.13`, commit `0d1cf33`

**Production URL:** `https://app.allerac.ai`

Objective: connect the physical Android robot client to the production Control API without `adb reverse`.

Start with these steps, one at a time:

1. Confirm that the production Control API is reachable externally through Cloudflare.
2. Create or select a scoped API key for the robot without printing or committing it.
3. Launch the Android app with the production base URL and API key.
4. Verify authentication and a basic `robot-assistant` conversation.
5. Verify speech input, response playback, and the required production tools.
6. Record any production-only failures before changing the client.

Detailed Android context and launch commands are in the [Robot Beta Handoff](../releases/robot-beta-handoff.md).

## Parked investigations

### Benchmark evolution into Quality Evaluator

**Status:** Direction recorded; initial Benchmark domain implemented locally

Evolve the `/benchmark` domain from latency and throughput measurements into a broader Quality Evaluator. Future iterations may add reusable evaluation datasets, expected-answer criteria, model comparisons, scoring, cost and token analysis, regression detection, and release quality gates. Keep the current benchmark workflows working while introducing these capabilities incrementally.

### Portable recovery and multi-cloud environments

**Priority:** High for beta

**Status:** Documented; implementation not started

Build this as two sequential projects:

1. [Portable Allerac Backup and Restore](../roadmap/portable-backup-restore.md) — create a verified, provider-independent recovery package and prove restoration on a clean host.
2. [Multi-Cloud Environment Provisioning](../roadmap/multi-cloud-environment-provisioning.md) — use the existing Azure, AWS, and GCP Terraform foundation to provision compatible hosts, restore the package, validate them, and perform controlled cutovers.

Start with the portable backup inventory and recovery contract. Do not begin by automating DNS changes or production cutover. All infrastructure mutations, restores, and destructive cleanup require explicit user approval.

### Grafana SQLite I/O saturation

**Status:** Open; intentionally deferred

The `allerac-grafana` container repeatedly reads approximately 220-280 MB/s while reporting SQLite locks. Stopping the container returns host I/O wait to normal. Continue from the [Grafana SQLite I/O saturation incident](../monitoring/grafana-sqlite-io-incident.md).

Do not delete `allerac_grafana_data` or `grafana.db`. The database integrity check returned `ok`.

## Completed context

- Production deployment of `v0.0.13` completed successfully on 2026-07-18.
- Deployed build information reported commit `0d1cf33` and release `v0.0.13`.
- Application, Cloudflare tunnel, Telegram bot, Loki, notifier, and Ollama passed deployment verification.
- The GitHub Actions deployment timed out during the image build; the same update completed in the persistent VM `tmux` session after Grafana was temporarily stopped.
