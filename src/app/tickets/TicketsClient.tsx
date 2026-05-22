'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticket, TicketEvent, TicketStatus, TicketType, TicketPriority } from '@/app/types';

// ─── agent run types ─────────────────────────────────────────────────────────

interface AgentRunStatus {
  runId: string;
  status: 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed' | 'cancelled';
  result: string | null;
  error: string | null;
  progressLog: string | null;
}

// ─── theme ───────────────────────────────────────────────────────────────────

const DARK = {
  bg:          '#0d1117',
  surface:     '#161b22',
  border:      '#21262d',
  borderLight: '#30363d',
  text:        '#e6edf3',
  textMuted:   '#8b949e',
  textFaint:   '#6e7681',
  textGhost:   '#484f58',
  selected:    '#1f6feb1a',
  selectedBorder: '#58a6ff',
  btnStart:    '#1f6feb',
  btnResolve:  '#238636',
  btnResolveDisabled: '#1a2e1a',
  status: {
    open:        { bg: '#1a1a3e', fg: '#8be9fd' },
    in_progress: { bg: '#2e2a1a', fg: '#f1fa8c' },
    resolved:    { bg: '#1a2e1a', fg: '#27c93f' },
    cancelled:   { bg: '#2e2222', fg: '#888' },
  },
  priority: {
    critical: '#ff5555',
    high:     '#ffb86c',
    medium:   '#f1fa8c',
    low:      '#6272a4',
  },
  type: {
    bug:         '#ff5555',
    improvement: '#8be9fd',
    task:        '#bd93f9',
    question:    '#50fa7b',
  },
};

const LIGHT = {
  bg:          '#f6f8fa',
  surface:     '#ffffff',
  border:      '#d0d7de',
  borderLight: '#d0d7de',
  text:        '#1f2328',
  textMuted:   '#656d76',
  textFaint:   '#848d97',
  textGhost:   '#9198a1',
  selected:    '#ddf4ff',
  selectedBorder: '#0969da',
  btnStart:    '#0969da',
  btnResolve:  '#1a7f37',
  btnResolveDisabled: '#d1fae5',
  status: {
    open:        { bg: '#ddf4ff', fg: '#0550ae' },
    in_progress: { bg: '#fff8c5', fg: '#7d4e00' },
    resolved:    { bg: '#dafbe1', fg: '#116329' },
    cancelled:   { bg: '#f6f8fa', fg: '#848d97' },
  },
  priority: {
    critical: '#d1242f',
    high:     '#bc4c00',
    medium:   '#7d4e00',
    low:      '#57606a',
  },
  type: {
    bug:         '#d1242f',
    improvement: '#0550ae',
    task:        '#8250df',
    question:    '#116329',
  },
};

type Theme = typeof DARK;

// ─── helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: TicketStatus, t: Theme) {
  const s = t.status[status];
  const labels: Record<TicketStatus, string> = {
    open: 'OPEN', in_progress: 'IN PROGRESS', resolved: 'RESOLVED', cancelled: 'CANCELLED',
  };
  return { bg: s.bg, fg: s.fg, label: labels[status] };
}

function priorityBadge(level: TicketPriority, t: Theme) {
  const labels: Record<TicketPriority, string> = {
    critical: '● CRITICAL', high: '● HIGH', medium: '● MEDIUM', low: '● LOW',
  };
  return { fg: t.priority[level], label: labels[level] };
}

function typeBadge(type: TicketType, t: Theme) {
  const labels: Record<TicketType, string> = {
    bug: 'BUG', improvement: 'IMPROVE', task: 'TASK', question: 'QUESTION',
  };
  return { fg: t.type[type], label: labels[type] };
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── types ───────────────────────────────────────────────────────────────────

type FilterId = 'ALL' | 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'BUGS';

const FILTERS: { id: FilterId; label: string; match: (t: Ticket) => boolean }[] = [
  { id: 'ALL',         label: 'All',         match: () => true },
  { id: 'OPEN',        label: 'Open',        match: t => t.status === 'open' },
  { id: 'IN_PROGRESS', label: 'In Progress', match: t => t.status === 'in_progress' },
  { id: 'RESOLVED',    label: 'Resolved',    match: t => t.status === 'resolved' },
  { id: 'BUGS',        label: 'Bugs',        match: t => t.type === 'bug' },
];

interface NewTicketForm {
  title: string;
  description: string;
  type: TicketType;
  explicitUrgency: TicketPriority | '';
}

const EMPTY_FORM: NewTicketForm = { title: '', description: '', type: 'task', explicitUrgency: '' };

// ─── main component ──────────────────────────────────────────────────────────

export default function TicketsClient() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [events, setEvents] = useState<TicketEvent[]>([]);
  const [filter, setFilter] = useState<FilterId>('OPEN');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewTicketForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [agentRuns, setAgentRuns] = useState<Map<string, AgentRunStatus>>(new Map());
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const t = isDark ? DARK : LIGHT;

  useEffect(() => {
    const saved = localStorage.getItem('chatTheme');
    if (saved) setIsDark(saved === 'dark');
  }, []);

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('chatTheme', next ? 'dark' : 'light');
  }

  const pollAgentRun = useCallback((ticketId: string, runId: string) => {
    const DONE = new Set(['completed', 'failed', 'cancelled']);
    async function poll() {
      try {
        const res = await fetch(`/api/agents?runId=${runId}`);
        if (!res.ok) return;
        const data = await res.json();
        const workerLog = data.workers?.length
          ? data.workers.map((w: any) => w.progressLog).filter(Boolean).join('\n\n---\n\n')
          : null;
        const run: AgentRunStatus = {
          runId,
          status: data.cancelled_at ? 'cancelled' : data.status,
          result: data.result ?? null,
          error: data.error ?? null,
          progressLog: workerLog,
        };
        setAgentRuns(prev => new Map(prev).set(ticketId, run));
        if (!DONE.has(run.status)) {
          pollTimers.current.set(ticketId, setTimeout(poll, 3000));
        }
      } catch { /* ignore */ }
    }
    poll();
  }, []);

  // Resume polling for in_progress tickets that already have an agentRunId
  useEffect(() => {
    tickets.forEach(tk => {
      if (tk.status === 'in_progress' && tk.context?.agentRunId && !agentRuns.has(tk.id)) {
        pollAgentRun(tk.id, tk.context.agentRunId as string);
      }
    });
  }, [tickets, agentRuns, pollAgentRun]);

  // Clear all poll timers on unmount
  useEffect(() => {
    const timers = pollTimers.current;
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const TICKET_TYPE_SKILL: Record<TicketType, string> = {
    bug:         'bug-hunter',
    improvement: 'programmer',
    task:        'programmer',
    question:    'search',
  };

  function buildAgentPrompt(ticket: Ticket): string {
    const desc = ticket.description ? `\n\nDetails: ${ticket.description}` : '';
    switch (ticket.type) {
      case 'bug':
        return `Investigate and diagnose this bug: "${ticket.title}"${desc}\n\nAnalyze the issue, identify the root cause, and propose a fix. Report your findings clearly.`;
      case 'task':
        return `Complete this task: "${ticket.title}"${desc}\n\nBreak it down into concrete steps and execute them. Document your progress.`;
      case 'improvement':
        return `Implement this improvement: "${ticket.title}"${desc}\n\nPlan the implementation, identify the affected components, and document the changes needed.`;
      case 'question':
        return `Answer this question thoroughly: "${ticket.title}"${desc}\n\nProvide a comprehensive and accurate answer.`;
    }
  }

  async function startTicket(ticket: Ticket) {
    setActionLoading(true);
    try {
      const skillName = TICKET_TYPE_SKILL[ticket.type];

      // 1. Dispatch agent run with skill matched to ticket type
      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildAgentPrompt(ticket),
          conversationId: null,
          model: 'qwen2.5:3b',
          provider: 'ollama',
          skillName,
        }),
      });
      const { runId } = await agentRes.json();

      // 2. Transition ticket to in_progress, store runId in context
      const patchRes = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'in_progress',
          assignedToType: 'agent',
          contextPatch: { agentRunId: runId },
        }),
      });
      const data = await patchRes.json();
      setTickets(prev => prev.map(tk => tk.id === ticket.id ? data.ticket : tk));
      setSelected(data.ticket);

      // 3. Start polling
      if (runId) {
        setAgentRuns(prev => new Map(prev).set(ticket.id, { runId, status: 'pending', result: null, error: null, progressLog: null }));
        pollAgentRun(ticket.id, runId);
      }
    } finally {
      setActionLoading(false);
    }
  }

  const fetchTickets = useCallback(async () => {
    try {
      const res = await fetch('/api/tickets');
      const data = await res.json();
      setTickets(data.tickets ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async (id: string) => {
    const res = await fetch(`/api/tickets/${id}`);
    const data = await res.json();
    setEvents(data.events ?? []);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    if (selected) fetchEvents(selected.id);
  }, [selected, fetchEvents]);

  async function createTicket() {
    if (!form.title.trim()) return;
    setSubmitting(true);
    try {
      await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          explicitUrgency: form.explicitUrgency || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchTickets();
    } finally {
      setSubmitting(false);
    }
  }

  async function updateStatus(id: string, status: TicketStatus, notes?: string) {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNotes: notes, resolvedByType: 'user' }),
      });
      const data = await res.json();
      setTickets(prev => prev.map(tk => tk.id === id ? data.ticket : tk));
      setSelected(data.ticket);
    } finally {
      setActionLoading(false);
    }
  }

  const visible = tickets.filter(FILTERS.find(f => f.id === filter)!.match);
  const counts = Object.fromEntries(FILTERS.map(f => [f.id, tickets.filter(f.match).length]));

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 6,
    border: `1px solid ${t.borderLight}`,
    background: t.bg, color: t.text, fontSize: 13,
    boxSizing: 'border-box', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, color: t.textMuted, marginBottom: 6, marginTop: 12,
  };

  // ── layout ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', background: t.bg, color: t.text, fontFamily: 'monospace', fontSize: 13 }}>

      {/* ── sidebar ─────────────────────────────────────────────────────── */}
      <div style={{ width: 220, borderRight: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${t.border}` }}>
          <button onClick={() => router.push('/hub')} style={{ background: 'none', border: 'none', color: t.textFaint, cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 10 }}>
            ← Hub
          </button>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>🎫 Tickets</div>
            <button
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ background: 'none', border: `1px solid ${t.borderLight}`, borderRadius: 6, color: t.textMuted, cursor: 'pointer', fontSize: 14, padding: '2px 7px' }}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
        </div>

        <div style={{ padding: '12px 8px', flex: 1 }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                width: '100%', padding: '7px 10px', borderRadius: 6, border: 'none',
                cursor: 'pointer', marginBottom: 2, fontSize: 12, textAlign: 'left',
                background: filter === f.id ? (isDark ? '#1f6feb33' : '#ddf4ff') : 'transparent',
                color: filter === f.id ? t.selectedBorder : t.textMuted,
              }}
            >
              <span>{f.label}</span>
              <span style={{ background: isDark ? '#21262d' : '#eaeef2', borderRadius: 10, padding: '1px 7px', fontSize: 11, color: t.textMuted }}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 8px', borderTop: `1px solid ${t.border}` }}>
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none',
              background: t.btnResolve, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            + New Ticket
          </button>
        </div>
      </div>

      {/* ── list ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: t.textMuted, fontSize: 12 }}>{visible.length} tickets</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted }}>Loading...</div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: t.textMuted }}>No tickets found.</div>
          )}
          {visible.map(tk => {
            const sb = statusBadge(tk.status, t);
            const pb = priorityBadge(tk.priorityLevel, t);
            const tb = typeBadge(tk.type, t);
            const isSelected = selected?.id === tk.id;
            return (
              <div
                key={tk.id}
                onClick={() => setSelected(isSelected ? null : tk)}
                style={{
                  padding: '12px 16px', borderBottom: `1px solid ${t.border}`, cursor: 'pointer',
                  background: isSelected ? t.selected : 'transparent',
                  borderLeft: isSelected ? `3px solid ${t.selectedBorder}` : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: t.text, flex: 1, marginRight: 8, lineHeight: 1.4 }}>{tk.title}</span>
                  <span style={{ background: sb.bg, color: sb.fg, borderRadius: 4, padding: '2px 7px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>{sb.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: tb.fg, fontSize: 11 }}>{tb.label}</span>
                  <span style={{ color: pb.fg, fontSize: 11 }}>{pb.label}</span>
                  <span style={{ color: t.textFaint, fontSize: 11, marginLeft: 'auto' }}>{timeAgo(tk.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── detail ──────────────────────────────────────────────────────── */}
      {selected && (
        <div style={{ width: 360, borderLeft: `1px solid ${t.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: t.bg }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Detail</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ padding: 16, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, lineHeight: 1.5, color: t.text }}>{selected.title}</div>

            {selected.description && (
              <div style={{ color: t.textMuted, fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>{selected.description}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                ['Status',   statusBadge(selected.status, t).label],
                ['Priority', `${selected.priorityScore} · ${selected.priorityLevel.toUpperCase()}`],
                ['Type',     selected.type],
                ['Created',  timeAgo(selected.createdAt)],
              ].map(([k, v]) => (
                <div key={k} style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: t.textFaint, fontSize: 10, marginBottom: 2 }}>{k}</div>
                  <div style={{ color: t.text, fontSize: 12 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* agent run status */}
            {Boolean(selected.context?.agentRunId) && agentRuns.has(selected.id) && (() => {
              const run = agentRuns.get(selected.id)!;
              const DONE = new Set(['completed', 'failed', 'cancelled']);
              const isDone = DONE.has(run.status);
              const statusColors: Record<string, string> = {
                pending: t.textMuted, planning: '#f1fa8c', running: '#8be9fd',
                aggregating: '#ffb86c', completed: '#27c93f', failed: '#ff5555', cancelled: t.textMuted,
              };
              const logLines = run.progressLog
                ? run.progressLog.split('\n').filter(l => l.startsWith('tool:') || l.startsWith('output:'))
                : [];
              return (
                <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '10px 12px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1 }}>Agent Run</span>
                    <span style={{ fontSize: 11, color: statusColors[run.status] ?? t.textMuted, fontWeight: 600 }}>
                      {!isDone && '⟳ '}{run.status.toUpperCase()}
                    </span>
                  </div>
                  {logLines.length > 0 && (
                    <div style={{ fontSize: 10, fontFamily: 'monospace', color: t.textFaint, background: t.bg, borderRadius: 4, padding: '6px 8px', maxHeight: 120, overflowY: 'auto', marginBottom: 8, lineHeight: 1.6 }}>
                      {logLines.map((l, i) => (
                        <div key={i} style={{ color: l.startsWith('tool:') ? '#ffb86c' : t.textMuted }}>
                          {l.startsWith('tool:') ? '⚙ ' : ''}{l.replace(/^(tool:|output:)/, '')}
                        </div>
                      ))}
                    </div>
                  )}
                  {run.result && (
                    <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6, maxHeight: 240, overflowY: 'auto', marginBottom: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {run.result}
                    </div>
                  )}
                  {run.error && (
                    <div style={{ fontSize: 11, color: '#ff5555', marginBottom: 8 }}>{run.error}</div>
                  )}
                  <a
                    href="/logs"
                    style={{ fontSize: 11, color: t.selectedBorder, textDecoration: 'none' }}
                  >
                    View full run in Logs →
                  </a>
                </div>
              );
            })()}

            {/* actions */}
            {selected.status === 'open' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  disabled={actionLoading}
                  onClick={() => startTicket(selected)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: t.btnStart, color: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  ▶ Start
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'resolved')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: t.btnResolve, color: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  ✓ Resolve
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'cancelled')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${t.borderLight}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            )}
            {selected.status === 'in_progress' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'resolved')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: t.btnResolve, color: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  ✓ Resolve
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'cancelled')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${t.borderLight}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            )}
            {(selected.status === 'resolved' || selected.status === 'cancelled') && (
              <button
                disabled={actionLoading}
                onClick={() => updateStatus(selected.id, 'open')}
                style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: `1px solid ${t.borderLight}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontSize: 12, marginBottom: 16 }}
              >
                ↺ Reopen
              </button>
            )}

            {/* events timeline */}
            {events.length > 0 && (
              <div>
                <div style={{ color: t.textFaint, fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Timeline</div>
                {events.map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.borderLight, marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: t.textMuted, fontSize: 11 }}>
                        <span style={{ color: t.text }}>{e.actorType}</span>
                        {' · '}{e.eventType.replace('_', ' ')}
                      </div>
                      {e.notes && <div style={{ color: t.textFaint, fontSize: 11, marginTop: 2 }}>{e.notes}</div>}
                      <div style={{ color: t.textGhost, fontSize: 10, marginTop: 2 }}>{timeAgo(e.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── new ticket modal ─────────────────────────────────────────────── */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: '#00000066', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 10, padding: 24, width: 460 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20, color: t.text }}>New Ticket</div>

            <label style={labelStyle}>Title *</label>
            <input
              autoFocus
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="What needs to be done?"
              style={inputStyle}
            />

            <label style={labelStyle}>Description</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="More context..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>Type</label>
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as TicketType }))} style={inputStyle}>
                  <option value="bug">Bug</option>
                  <option value="task">Task</option>
                  <option value="improvement">Improvement</option>
                  <option value="question">Question</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Priority</label>
                <select value={form.explicitUrgency} onChange={e => setForm(f => ({ ...f, explicitUrgency: e.target.value as TicketPriority | '' }))} style={inputStyle}>
                  <option value="">Auto</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}
                style={{ padding: '8px 16px', borderRadius: 6, border: `1px solid ${t.borderLight}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={createTicket}
                disabled={!form.title.trim() || submitting}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: form.title.trim() ? t.btnResolve : t.btnResolveDisabled, color: '#fff', cursor: form.title.trim() ? 'pointer' : 'default', fontSize: 13 }}
              >
                {submitting ? 'Creating...' : 'Create Ticket'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
