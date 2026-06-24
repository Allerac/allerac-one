import type { AgentRunRecord, AgentWorkerRecord } from '@/app/services/agents/worker-run.repository';

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function runStatus(run: Pick<AgentRunRecord, 'status' | 'cancelled_at'>): string {
  return run.cancelled_at ? 'cancelled' : run.status;
}

export function agentWorkerDto(worker: AgentWorkerRecord) {
  return {
    id: worker.id,
    name: worker.name,
    task: worker.task,
    skillId: worker.skill_id,
    status: worker.status,
    result: worker.result,
    tokensUsed: worker.tokens_used,
    progressLog: worker.progress_log,
    lastHeartbeat: iso(worker.last_heartbeat),
    startedAt: iso(worker.started_at),
    completedAt: iso(worker.completed_at),
  };
}

export function agentRunDto(run: AgentRunRecord & { workers?: AgentWorkerRecord[] }) {
  return {
    id: run.id,
    conversationId: run.conversation_id,
    userId: run.user_id,
    status: runStatus(run),
    prompt: run.prompt,
    plan: run.plan,
    result: run.result,
    error: run.error_message,
    model: run.llm_model,
    provider: run.llm_provider,
    skillId: run.skill_id,
    lastHeartbeat: iso(run.last_heartbeat),
    startedAt: iso(run.started_at),
    completedAt: iso(run.completed_at),
    cancelledAt: iso(run.cancelled_at),
    workers: (run.workers ?? []).map(agentWorkerDto),
  };
}
