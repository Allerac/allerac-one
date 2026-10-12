/**
 * Agent worker entrypoint.
 *
 * Runs the background agent-run runner (WorkerRunnerService) as a standalone
 * process, outside the Next.js app container. Coordination with the app is
 * DB-only through the agent_runs table, so this process needs no HTTP surface
 * beyond its own /health endpoint.
 *
 * Bundled by Dockerfile.agent-worker (esbuild) into dist/agent-worker.js.
 * Intentionally ignores DISABLE_BACKGROUND_WORKERS / DISABLE_AGENT_RUNNER —
 * this process exists to run the runner.
 */

import http from 'http';
import { validateWorkerRuntimeConfig } from './lib/runtime-config';
import { installConsoleInterceptor } from './lib/logger';
import { installLogInterceptor } from './lib/log-interceptor';
import { getWorkerRunner } from './app/services/agents/worker-runner.service';
import { getDetailSyncRunner } from './app/services/health/detail-sync-runner.service';
import pool from './app/clients/db';

const HEALTH_PORT = parseInt(process.env.AGENT_WORKER_HEALTH_PORT || '8090', 10);
const SHUTDOWN_TIMEOUT_MS = parseInt(process.env.AGENT_WORKER_SHUTDOWN_TIMEOUT_MS || '25000', 10);

async function main(): Promise<void> {
  validateWorkerRuntimeConfig();
  // Local buffer keeps the read_logs tool working inside agent runs; the log
  // interceptor forwards [Context] lines to the app's /logs UI via /api/log-submit.
  installConsoleInterceptor();
  if (process.env.LOG_API_URL) {
    installLogInterceptor(process.env.LOG_API_URL, 'agent-worker');
  }

  const runner = getWorkerRunner();
  runner.start();
  console.log('[AgentWorker] Started agent worker process');

  const detailSyncRunner = getDetailSyncRunner();
  detailSyncRunner.start();
  console.log('[AgentWorker] Started health detail-sync poll loop');

  const healthServer = http.createServer(async (req, res) => {
    if (req.url !== '/health') {
      res.writeHead(404).end();
      return;
    }
    let dbOk = false;
    try {
      await pool.query('SELECT 1');
      dbOk = true;
    } catch { /* reported below */ }

    const healthy = runner.isRunning() && detailSyncRunner.isRunning() && dbOk;
    res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: healthy ? 'ok' : 'unhealthy',
      isRunning: runner.isRunning(),
      activeRunCount: runner.getActiveRunCount(),
      healthDetailSync: {
        isRunning: detailSyncRunner.isRunning(),
        activeJobCount: detailSyncRunner.getActiveJobCount(),
      },
      db: dbOk ? 'ok' : 'unreachable',
    }));
  });
  healthServer.listen(HEALTH_PORT, () => {
    console.log(`[AgentWorker] Health endpoint listening on :${HEALTH_PORT}/health`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[AgentWorker] ${signal} received, stopping runner`);

    runner.stop();
    detailSyncRunner.stop();
    healthServer.close();

    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
    while (
      (runner.getActiveRunCount() > 0 || detailSyncRunner.getActiveJobCount() > 0)
      && Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const remaining = runner.getActiveRunCount();
    if (remaining > 0) {
      // Interrupted runs are picked up again by retryStaleRuns after restart.
      console.warn(`[AgentWorker] Exiting with ${remaining} active run(s); stale-run recovery will retry them`);
    }
    const remainingDetailSyncJobs = detailSyncRunner.getActiveJobCount();
    if (remainingDetailSyncJobs > 0) {
      // Interrupted jobs are picked up again by recoverStaleJobs after restart.
      console.warn(
        `[AgentWorker] Exiting with ${remainingDetailSyncJobs} active detail-sync job(s); `
        + `stale-job recovery will retry them`
      );
    }

    await pool.end().catch(() => {});
    console.log('[AgentWorker] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[AgentWorker] Fatal startup error:', error);
  process.exit(1);
});
