import { detailSyncRepository, DetailSyncJobRecord } from './detail-sync.repository';
import { runActivityDetailSync } from './detail-sync.service';

// Second poll loop for src/agent-worker.ts (Phase 2 of docs/roadmap/
// health-detailed-activities.md), mirroring the shape of
// src/app/services/agents/worker-runner.service.ts but for the
// health_activity_detail_sync_jobs queue instead of agent_runs.
const POLL_INTERVAL_MS = parseInt(process.env.HEALTH_DETAIL_SYNC_POLL_MS || '5000', 10);
const MAX_CONCURRENT_JOBS = parseInt(process.env.HEALTH_DETAIL_SYNC_MAX_CONCURRENT || '3', 10);
const STALE_JOB_MAX_AGE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

function jobTag(jobId: string): string {
  return `[${jobId.substring(0, 8)}]`;
}

export class DetailSyncRunnerService {
  private running = false;
  private activeJobs = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;
  private maxConcurrentJobs: number;

  constructor(config?: { pollIntervalMs?: number; maxConcurrentJobs?: number }) {
    this.pollIntervalMs = config?.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.maxConcurrentJobs = config?.maxConcurrentJobs ?? MAX_CONCURRENT_JOBS;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    console.log('[HealthDetailSync] Starting detail-sync poll loop');
    this.pollLoop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    console.log('[HealthDetailSync] Stopped detail-sync poll loop');
  }

  isRunning(): boolean {
    return this.running;
  }

  getActiveJobCount(): number {
    return this.activeJobs.size;
  }

  private pollLoop(): void {
    if (!this.running) return;
    this.processNext().finally(() => {
      this.timer = setTimeout(() => this.pollLoop(), this.pollIntervalMs);
    });
  }

  private async processNext(): Promise<void> {
    if (!this.running) return;
    if (this.activeJobs.size >= this.maxConcurrentJobs) return;

    await detailSyncRepository.recoverStaleJobs(STALE_JOB_MAX_AGE_MINUTES);

    const job = await detailSyncRepository.claimPendingJob();
    if (!job) return;

    this.activeJobs.add(job.id);
    this.executeJob(job).finally(() => {
      this.activeJobs.delete(job.id);
    });
  }

  private async executeJob(job: DetailSyncJobRecord): Promise<void> {
    const tag = jobTag(job.id);

    if (job.attempts > MAX_ATTEMPTS) {
      console.warn(`[HealthDetailSync] ${tag} Exceeded max attempts (${job.attempts}); marking failed`);
      await detailSyncRepository.markFailed(job.id, `Exceeded ${MAX_ATTEMPTS} attempts`);
      return;
    }

    await detailSyncRepository.markRunning(job.id);
    try {
      const result = await runActivityDetailSync(job.user_id, job.activity_id);
      if (result.status === 'failed') {
        const message = Object.values(result.errors).join('; ') || 'Detail sync failed';
        await detailSyncRepository.markFailed(job.id, message);
        console.warn(`[HealthDetailSync] ${tag} activity=${job.activity_id} failed: ${message}`);
        return;
      }
      await detailSyncRepository.markCompleted(job.id);
      console.log(
        `[HealthDetailSync] ${tag} activity=${job.activity_id} ${result.status}`
        + ` (laps=${result.laps}, zones=${result.zones})`
      );
    } catch (error: any) {
      await detailSyncRepository.markFailed(job.id, error.message || 'Unknown error');
      console.error(`[HealthDetailSync] ${tag} activity=${job.activity_id} error:`, error.message);
    }
  }
}

let instance: DetailSyncRunnerService | null = null;

export function getDetailSyncRunner(): DetailSyncRunnerService {
  if (!instance) {
    instance = new DetailSyncRunnerService();
  }
  return instance;
}

export function resetDetailSyncRunner(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
