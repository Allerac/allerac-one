'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface RunWorker {
  id: string;
  name: string;
  task: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  result: string | null;
  progressLog: string | null;
}

interface AgentRun {
  id: string;
  status: 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed';
  prompt: string;
  result: string | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  llm_model: string | null;
  llm_provider: string | null;
  workers: RunWorker[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", "Courier New", monospace' };

function statusBadge(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'pending':     return { bg: '#1a1a3e', fg: '#8888cc', label: 'QUEUED' };
    case 'planning':    return { bg: '#1a2e1a', fg: '#27c93f', label: 'PLANNING' };
    case 'running':     return { bg: '#1a2e3e', fg: '#8be9fd', label: 'RUNNING' };
    case 'aggregating': return { bg: '#2e2e1a', fg: '#f1fa8c', label: 'AGGREGATE' };
    case 'completed':   return { bg: '#1a2e1a', fg: '#27c93f', label: 'DONE' };
    case 'failed':      return { bg: '#2e1a1a', fg: '#ff5555', label: 'FAILED' };
    default:            return { bg: '#1a1a2e', fg: '#555', label: status.toUpperCase() };
  }
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

function elapsedMs(startedAt: string | null, completedAt: string | null): number {
  if (!startedAt) return 0;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  return Math.max(0, end - start);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AgentRunsTabProps {
  userId: string;
}

export default function AgentRunsTab({ userId }: AgentRunsTabProps) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) return;
      const data = await res.json();
      if (mountedRef.current) {
        const list: AgentRun[] = data.runs || [];
        setRuns(list);
        if (selectedRun) {
          const updated = list.find(r => r.id === selectedRun.id);
          if (updated) setSelectedRun(updated);
        }
      }
    } catch {
      // silent
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [selectedRun]);

  useEffect(() => {
    mountedRef.current = true;
    fetchRuns();

    const hasActive = (r: AgentRun[]) => r.some(r => ['pending', 'planning', 'running', 'aggregating'].includes(r.status));
    const interval = setInterval(() => {
      if (hasActive(runs)) fetchRuns();
    }, 3000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchRuns, runs]);

  const handleCancel = async (runId: string) => {
    setCancelling(prev => new Set(prev).add(runId));
    try {
      await fetch(`/api/agents?runId=${encodeURIComponent(runId)}`, { method: 'DELETE' });
      fetchRuns();
    } finally {
      setCancelling(prev => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
    }
  };

  const activeRuns = runs.filter(r => ['pending', 'planning', 'running', 'aggregating'].includes(r.status));
  const pastRuns = runs.filter(r => ['completed', 'failed'].includes(r.status));

  if (loading) {
    return (
      <div style={{ ...MONO, padding: '24px', color: '#555', textAlign: 'center', fontSize: '12px' }}>
        Loading runs...
      </div>
    );
  }

  return (
    <div style={{ ...MONO, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Summary bar */}
      <div style={{
        background: '#111',
        borderBottom: '1px solid #1a1a1a',
        padding: '6px 12px',
        display: 'flex',
        gap: '16px',
        fontSize: '11px',
        flexShrink: 0,
      }}>
        <span style={{ color: '#27c93f' }}>■ {activeRuns.length} active</span>
        <span style={{ color: '#555' }}>■ {pastRuns.length} completed</span>
      </div>

      {/* Active runs */}
      {activeRuns.length > 0 && (
        <div style={{ borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ padding: '4px 12px', fontSize: '10px', color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Active
          </div>
          {activeRuns.map(run => (
            <RunRow
              key={run.id}
              run={run}
              isSelected={selectedRun?.id === run.id}
              onSelect={() => setSelectedRun(run)}
              onCancel={() => handleCancel(run.id)}
              isCancelling={cancelling.has(run.id)}
            />
          ))}
        </div>
      )}

      {/* Past runs */}
      {pastRuns.length > 0 && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '4px 12px', fontSize: '10px', color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            History
          </div>
          {pastRuns.map(run => (
            <RunRow
              key={run.id}
              run={run}
              isSelected={selectedRun?.id === run.id}
              onSelect={() => setSelectedRun(run)}
              onCancel={() => {}}
              isCancelling={false}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {selectedRun && (
        <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}

      {runs.length === 0 && (
        <div style={{ ...MONO, padding: '48px', color: '#2a2a2a', textAlign: 'center', fontSize: '12px' }}>
          — no agent runs yet —
        </div>
      )}
    </div>
  );
}

// ── Run Row ───────────────────────────────────────────────────────────────────

interface RunRowProps {
  run: AgentRun;
  isSelected: boolean;
  onSelect: () => void;
  onCancel: () => void;
  isCancelling: boolean;
}

function RunRow({ run, isSelected, onSelect, onCancel, isCancelling }: RunRowProps) {
  const [tick, setTick] = useState(0);
  const isActive = ['pending', 'planning', 'running', 'aggregating'].includes(run.status);

  useEffect(() => {
    if (!isActive) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [isActive]);

  const badge = statusBadge(run.status);
  const ms = elapsedMs(run.started_at, run.completed_at);
  const workerSummary = run.workers.length > 0
    ? `${run.workers.filter(w => w.status === 'completed').length}/${run.workers.length}`
    : '';

  return (
    <>
      <div
        onClick={onSelect}
        style={{
          background: isSelected ? '#1a1a2e' : 'transparent',
          borderBottom: '1px solid #111',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          fontSize: '11px',
          transition: 'background 0.1s',
        }}
      >
        {/* Status badge */}
        <span style={{
          background: badge.bg,
          color: badge.fg,
          padding: '1px 6px',
          borderRadius: '2px',
          fontSize: '9px',
          fontWeight: 'bold',
          letterSpacing: '0.05em',
          flexShrink: 0,
        }}>
          {badge.label}
        </span>

        {/* Prompt preview */}
        <span style={{
          color: isSelected ? '#8be9fd' : '#b0bec5',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {truncate(run.prompt, 60)}
        </span>

        {/* Worker progress */}
        {workerSummary && (
          <span style={{ color: '#555', fontSize: '10px', flexShrink: 0 }}>
            {workerSummary}
          </span>
        )}

        {/* Timer */}
        {isActive && (
          <span style={{ color: '#8be9fd', fontSize: '10px', flexShrink: 0, minWidth: '36px', textAlign: 'right' }}>
            {formatDuration(ms)}
          </span>
        )}

        {/* Cancel button */}
        {isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onCancel(); }}
            disabled={isCancelling}
            style={{
              background: isCancelling ? '#2e1a1a' : 'transparent',
              border: `1px solid ${isCancelling ? '#ff5555' : '#333'}`,
              color: isCancelling ? '#ff5555' : '#555',
              padding: '1px 6px',
              borderRadius: '2px',
              cursor: isCancelling ? 'wait' : 'pointer',
              fontSize: '9px',
              fontFamily: 'inherit',
              flexShrink: 0,
            }}
          >
            {isCancelling ? '...' : '✕'}
          </button>
        )}
      </div>
    </>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

interface RunDetailProps {
  run: AgentRun;
  onClose: () => void;
}

function RunDetail({ run, onClose }: RunDetailProps) {
  const [tick, setTick] = useState(0);
  const isActive = ['pending', 'planning', 'running', 'aggregating'].includes(run.status);

  useEffect(() => {
    if (!isActive) return;
    const i = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(i);
  }, [isActive]);

  const badge = statusBadge(run.status);
  const ms = elapsedMs(run.started_at, run.completed_at);

  return (
    <div style={{
      background: '#0d0d0d',
      borderTop: '1px solid #333',
      maxHeight: '40vh',
      overflowY: 'auto',
      flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{
        background: '#111',
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        position: 'sticky',
        top: 0,
        zIndex: 1,
      }}>
        <span style={{
          background: badge.bg,
          color: badge.fg,
          padding: '1px 6px',
          borderRadius: '2px',
          fontSize: '9px',
          fontWeight: 'bold',
        }}>
          {badge.label}
        </span>
        <span style={{ color: '#b0bec5', fontSize: '11px', flex: 1 }}>
          {run.prompt}
        </span>
        <span style={{ color: '#8be9fd', fontSize: '10px' }}>
          {isActive ? formatDuration(ms) : run.completed_at ? `${formatDuration(ms)} total` : ''}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#555',
            padding: '1px 6px',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '10px',
            fontFamily: 'inherit',
          }}
        >
          ✕
        </button>
      </div>

      {/* Workers */}
      {run.workers.length > 0 && (
        <div style={{ padding: '4px 12px' }}>
          {run.workers.map(w => <WorkerLine key={w.id} worker={w} />)}
        </div>
      )}

      {/* Result */}
      {run.result && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: '10px', color: '#333', marginBottom: '4px' }}>RESULT</div>
          <pre style={{
            color: '#b0bec5',
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {run.result}
          </pre>
        </div>
      )}

      {/* Error */}
      {run.error_message && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: '10px', color: '#ff5555', marginBottom: '4px' }}>ERROR</div>
          <pre style={{
            color: '#ff5555',
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            lineHeight: 1.5,
          }}>
            {run.error_message}
          </pre>
        </div>
      )}

      {/* Meta */}
      <div style={{ padding: '4px 12px', borderTop: '1px solid #1a1a1a', fontSize: '9px', color: '#333' }}>
        {run.id} · {run.llm_provider || '?'}:{run.llm_model || '?'}
      </div>
    </div>
  );
}

// ── Worker Line ───────────────────────────────────────────────────────────────

function WorkerLine({ worker }: { worker: RunWorker }) {
  const icon = worker.status === 'completed' ? '✓' : worker.status === 'failed' ? '✗' : worker.status === 'running' ? '●' : '○';
  const color = worker.status === 'completed' ? '#27c93f' : worker.status === 'failed' ? '#ff5555' : worker.status === 'running' ? '#8be9fd' : '#555';

  const lastProgress = worker.progressLog
    ? worker.progressLog.split('\n\n').filter(l => l !== 'heartbeat' && l !== 'Starting...').pop()
    : null;

  const statusText = lastProgress
    ? lastProgress.startsWith('output:') ? 'Generating...' : lastProgress.startsWith('tool:') ? lastProgress.substring(5) : lastProgress
    : worker.status === 'completed' ? 'Done' : worker.status === 'failed' ? (worker.result || 'Failed') : 'Waiting';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '2px 0',
      fontSize: '10px',
    }}>
      <span style={{ color, flexShrink: 0, width: '12px' }}>{icon}</span>
      <span style={{ color: '#b0bec5', flexShrink: 0, minWidth: '80px' }}>{worker.name}</span>
      <span style={{ color: '#555', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {truncate(statusText, 50)}
      </span>
    </div>
  );
}
