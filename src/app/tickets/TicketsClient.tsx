'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticket, TicketEvent, TicketStatus, TicketType, TicketPriority } from '@/app/types';

// ─── helpers ────────────────────────────────────────────────────────────────

function statusBadge(status: TicketStatus) {
  switch (status) {
    case 'open':        return { bg: '#1a1a3e', fg: '#8be9fd', label: 'OPEN' };
    case 'in_progress': return { bg: '#2e2a1a', fg: '#f1fa8c', label: 'IN PROGRESS' };
    case 'resolved':    return { bg: '#1a2e1a', fg: '#27c93f', label: 'RESOLVED' };
    case 'cancelled':   return { bg: '#2e2222', fg: '#888',    label: 'CANCELLED' };
  }
}

function priorityBadge(level: TicketPriority) {
  switch (level) {
    case 'critical': return { fg: '#ff5555', label: '● CRITICAL' };
    case 'high':     return { fg: '#ffb86c', label: '● HIGH' };
    case 'medium':   return { fg: '#f1fa8c', label: '● MEDIUM' };
    case 'low':      return { fg: '#6272a4', label: '● LOW' };
  }
}

function typeBadge(type: TicketType) {
  switch (type) {
    case 'bug':         return { fg: '#ff5555', label: 'BUG' };
    case 'improvement': return { fg: '#8be9fd', label: 'IMPROVE' };
    case 'task':        return { fg: '#bd93f9', label: 'TASK' };
    case 'question':    return { fg: '#50fa7b', label: 'QUESTION' };
  }
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
      setTickets(prev => prev.map(t => t.id === id ? data.ticket : t));
      setSelected(data.ticket);
    } finally {
      setActionLoading(false);
    }
  }

  const visible = tickets.filter(FILTERS.find(f => f.id === filter)!.match);
  const counts = Object.fromEntries(FILTERS.map(f => [f.id, tickets.filter(f.match).length]));

  // ── layout ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0d1117', color: '#e6edf3', fontFamily: 'monospace', fontSize: 13 }}>

      {/* ── sidebar ─────────────────────────────────────────────────────── */}
      <div style={{ width: 220, borderRight: '1px solid #21262d', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #21262d' }}>
          <button onClick={() => router.push('/hub')} style={{ background: 'none', border: 'none', color: '#6e7681', cursor: 'pointer', fontSize: 12, padding: 0, marginBottom: 10 }}>
            ← Hub
          </button>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#e6edf3' }}>🎫 Tickets</div>
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
                background: filter === f.id ? '#1f6feb33' : 'transparent',
                color: filter === f.id ? '#58a6ff' : '#8b949e',
              }}
            >
              <span>{f.label}</span>
              <span style={{ background: '#21262d', borderRadius: 10, padding: '1px 7px', fontSize: 11 }}>
                {counts[f.id]}
              </span>
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 8px', borderTop: '1px solid #21262d' }}>
          <button
            onClick={() => setShowForm(true)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 6, border: 'none',
              background: '#238636', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}
          >
            + New Ticket
          </button>
        </div>
      </div>

      {/* ── list ────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#8b949e', fontSize: 12 }}>{visible.length} tickets</span>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', color: '#8b949e' }}>Loading...</div>
          )}
          {!loading && visible.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: '#8b949e' }}>No tickets found.</div>
          )}
          {visible.map(t => {
            const sb = statusBadge(t.status);
            const pb = priorityBadge(t.priorityLevel);
            const tb = typeBadge(t.type);
            const isSelected = selected?.id === t.id;
            return (
              <div
                key={t.id}
                onClick={() => setSelected(isSelected ? null : t)}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid #21262d', cursor: 'pointer',
                  background: isSelected ? '#1f6feb1a' : 'transparent',
                  borderLeft: isSelected ? '3px solid #58a6ff' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, color: '#e6edf3', flex: 1, marginRight: 8, lineHeight: 1.4 }}>{t.title}</span>
                  <span style={{ background: sb.bg, color: sb.fg, borderRadius: 4, padding: '2px 7px', fontSize: 10, whiteSpace: 'nowrap', flexShrink: 0 }}>{sb.label}</span>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ color: tb.fg, fontSize: 11 }}>{tb.label}</span>
                  <span style={{ color: pb.fg, fontSize: 11 }}>{pb.label}</span>
                  <span style={{ color: '#6e7681', fontSize: 11, marginLeft: 'auto' }}>{timeAgo(t.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── detail ──────────────────────────────────────────────────────── */}
      {selected && (
        <div style={{ width: 360, borderLeft: '1px solid #21262d', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #21262d', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Detail</span>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ padding: 16, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, lineHeight: 1.5, color: '#e6edf3' }}>{selected.title}</div>

            {selected.description && (
              <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 14, lineHeight: 1.6 }}>{selected.description}</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {[
                ['Status',   statusBadge(selected.status).label],
                ['Priority', `${selected.priorityScore} · ${selected.priorityLevel.toUpperCase()}`],
                ['Type',     selected.type],
                ['Created',  timeAgo(selected.createdAt)],
              ].map(([k, v]) => (
                <div key={k} style={{ background: '#161b22', borderRadius: 6, padding: '8px 10px' }}>
                  <div style={{ color: '#6e7681', fontSize: 10, marginBottom: 2 }}>{k}</div>
                  <div style={{ color: '#e6edf3', fontSize: 12 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* actions */}
            {selected.status === 'open' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'resolved')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: '#238636', color: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  ✓ Resolve
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'cancelled')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 12 }}
                >
                  Cancel
                </button>
              </div>
            )}
            {selected.status === 'resolved' && (
              <button
                disabled={actionLoading}
                onClick={() => updateStatus(selected.id, 'open')}
                style={{ width: '100%', padding: '7px 0', borderRadius: 6, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 12, marginBottom: 16 }}
              >
                ↺ Reopen
              </button>
            )}

            {/* events timeline */}
            {events.length > 0 && (
              <div>
                <div style={{ color: '#6e7681', fontSize: 11, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Timeline</div>
                {events.map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#30363d', marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <div style={{ color: '#8b949e', fontSize: 11 }}>
                        <span style={{ color: '#e6edf3' }}>{e.actorType}</span>
                        {' · '}{e.eventType.replace('_', ' ')}
                      </div>
                      {e.notes && <div style={{ color: '#6e7681', fontSize: 11, marginTop: 2 }}>{e.notes}</div>}
                      <div style={{ color: '#484f58', fontSize: 10, marginTop: 2 }}>{timeAgo(e.createdAt)}</div>
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
          position: 'fixed', inset: 0, background: '#00000088', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }}>
          <div style={{ background: '#161b22', border: '1px solid #30363d', borderRadius: 10, padding: 24, width: 460 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 20 }}>New Ticket</div>

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
                style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #30363d', background: 'transparent', color: '#8b949e', cursor: 'pointer', fontSize: 13 }}
              >
                Cancel
              </button>
              <button
                onClick={createTicket}
                disabled={!form.title.trim() || submitting}
                style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: form.title.trim() ? '#238636' : '#1a2e1a', color: '#fff', cursor: form.title.trim() ? 'pointer' : 'default', fontSize: 13 }}
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

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: '#8b949e', marginBottom: 6, marginTop: 12,
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #30363d',
  background: '#0d1117', color: '#e6edf3', fontSize: 13, boxSizing: 'border-box', outline: 'none',
};
