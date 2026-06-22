'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import SidebarDesktop from '@/app/components/layout/SidebarDesktop';
import SidebarMobile from '@/app/components/layout/SidebarMobile';
import { useConversations } from '@/app/hooks/useConversations';
import { useDomainChat } from '@/app/hooks/useDomainChat';
import { MODELS } from '@/app/services/llm/models';
import type { Message, Conversation } from '@/app/types';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import MemorySaveModal from '@/app/components/memory/MemorySaveModal';
import MyAlleracModal from '@/app/components/allerac/MyAlleracModal';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import { DomainProvider } from '@/app/context/DomainContext';
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
  const d = Math.floor(h / 24);
  const mo = Math.floor(d / 30);
  const y = Math.floor(d / 365);
  if (y >= 1) return `${y}y ago`;
  if (mo >= 1) return `${mo}mo ago`;
  return `${d}d ago`;
}

interface ToolStep {
  tool: string;
  args: string;
  status: 'pending' | 'ok' | 'error';
  detail: string;
}

function parsePRFromLog(log: string): { url: string; pr_number: number; title?: string } | null {
  const lines = log.split('\n');
  for (const line of lines) {
    if (line.startsWith('ok:github_create_pr:')) {
      const rest = line.slice('ok:github_create_pr:'.length);
      try {
        const data = JSON.parse(rest);
        if (data.url && data.pr_number) return data;
      } catch {}
      // Fallback: regex when JSON is truncated
      const urlMatch = rest.match(/"url"\s*:\s*"([^"]+)"/);
      const numMatch = rest.match(/"pr_number"\s*:\s*(\d+)/);
      const titleMatch = rest.match(/"title"\s*:\s*"([^"]+)"/);
      if (urlMatch && numMatch) {
        return { url: urlMatch[1], pr_number: parseInt(numMatch[1]), title: titleMatch?.[1] };
      }
    }
  }
  return null;
}

function parseSteps(log: string): ToolStep[] {
  const entries = log.split('\n').filter(l =>
    l.startsWith('tool:') || l.startsWith('ok:') || l.startsWith('err:')
  );
  const steps: ToolStep[] = [];
  for (const entry of entries) {
    if (entry.startsWith('tool:')) {
      const rest = entry.slice(5);
      const ci = rest.indexOf(':');
      steps.push({ tool: ci >= 0 ? rest.slice(0, ci) : rest, args: ci >= 0 ? rest.slice(ci + 1) : '', status: 'pending', detail: '' });
    } else if (entry.startsWith('ok:') || entry.startsWith('err:')) {
      const isErr = entry.startsWith('err:');
      const rest = entry.slice(isErr ? 4 : 3);
      const ci = rest.indexOf(':');
      const tool = ci >= 0 ? rest.slice(0, ci) : rest;
      const detail = ci >= 0 ? rest.slice(ci + 1) : '';
      for (let i = steps.length - 1; i >= 0; i--) {
        if (steps[i].tool === tool && steps[i].status === 'pending') {
          steps[i] = { ...steps[i], status: isErr ? 'error' : 'ok', detail };
          break;
        }
      }
    }
  }
  return steps;
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

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function TicketsClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
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
  const [prStatuses, setPrStatuses] = useState<Map<number, { status: 'open'|'merged'|'closed'; title?: string }>> (new Map());
  const pollTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const prPollTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const [isSidebarOpen, setIsSidebarOpen]         = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileTab, setMobileTab]                 = useState<'tickets' | 'chat'>('tickets');
  const [isMyAlleracOpen, setIsMyAlleracOpen] = useState(false);

  // ── chat state ─────────────────────────────────────────────────────────────
  const {
    conversations, currentConvId, setCurrentConvId,
    messages, setMessages,
    selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'tickets');

  const t = isDark ? DARK : LIGHT;

  useEffect(() => {
    const saved = localStorage.getItem('chatTheme');
    if (saved) setIsDark(saved === 'dark');
  }, []);

  useEffect(() => {
    const open = () => setIsMyAlleracOpen(true);
    window.addEventListener('openMyAlleracModal', open);
    return () => window.removeEventListener('openMyAlleracModal', open);
  }, []);

  const handleConvCreated = useCallback((id: string) => {
    setCurrentConvId(id); reload();
  }, [setCurrentConvId, reload]);

  // Handle tool calls from chat - refresh tickets when a new ticket is created
  const handleToolCall = useCallback((toolName: string, args: any) => {
    if (toolName === 'create_ticket') {
      // Refresh the ticket list after a ticket is created via chat
      fetchTickets();
    }
  }, []);

  const {
    input, setInput, sending, selectedModel, setSelectedModel,
    convId, isAgentMode, toggleAgentMode, githubToken,
    messagesEndRef, lastToolCall, setLastToolCall,
    send, stop, handleKeyPress, handleSaveToMemory,
    memoryOpen, setMemoryOpen, memoryLoading, memoryResult, setMemoryResult,
  } = useDomainChat({
    userId, domain: 'tickets', defaultSkillName,
    currentConvId, messages, setMessages,
    onConversationCreated: handleConvCreated,
    onToolCall: handleToolCall,
  });


  const clearChat      = useCallback(() => { newConversation(); }, [newConversation]);
  const loadConversation = useCallback(async (id: string) => { await selectConversation(id); }, [selectConversation]);
  const handleDelete   = useCallback(async (id: string) => { await deleteConversation(id); }, [deleteConversation]);
  const convList: Conversation[] = conversations.map(c => ({ ...c, pinned: c.pinned ?? false }));
  const displayName = userName?.split(' ')[0] || 'there';

  const handleLogout = async () => { const { logout } = await import('@/app/actions/auth'); await logout(); router.push('/login'); };

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
        if (workerLog) {
          const pr = parsePRFromLog(workerLog);
          if (pr && !prPollTimers.current.has(pr.pr_number)) pollPrStatus(pr.pr_number);
        }
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
    const num = ticket.number;
    const branchPrefix = ticket.type === 'bug' ? 'fix' : ticket.type === 'improvement' ? 'feat' : 'chore';
    const prInstructions = `

Ticket: #${num}
Repository: Allerac/allerac-one (GitHub)
You have tools to read and modify the codebase directly:
- github_list_files / github_read_file — explore and read source files (use ref: "<branch>" when re-reading after edits)
- github_create_branch — create a branch named "${branchPrefix}/${num}-short-description"
- github_replace_lines — replace lines in a file by line number range (PREFERRED for editing)
- github_edit_file — find/replace in a file (use only for short unique patterns)
- github_commit_file — create a new file (not for edits — use github_replace_lines instead)
- github_create_pr — open a pull request when all changes are committed

Workflow: explore → create branch "${branchPrefix}/${num}-..." → edit files → open PR. Report the PR URL when done.`;

    switch (ticket.type) {
      case 'bug':
        return `Investigate and fix this bug [Ticket #${num}]: "${ticket.title}"${desc}\n\nDiagnose the root cause by reading the relevant code, implement the fix, and open a pull request.${prInstructions}`;
      case 'task':
        return `Complete this task [Ticket #${num}]: "${ticket.title}"${desc}\n\nBreak it down into concrete steps, implement the changes in the codebase, and open a pull request.${prInstructions}`;
      case 'improvement':
        return `Implement this improvement [Ticket #${num}]: "${ticket.title}"${desc}\n\nExplore the relevant code, implement the enhancement, and open a pull request.${prInstructions}`;
      case 'question':
        return `Answer this question thoroughly [Ticket #${num}]: "${ticket.title}"${desc}\n\nSearch the codebase if needed using github_list_files and github_read_file. Provide a comprehensive and accurate answer.`;
    }
  }

  async function startTicket(ticket: Ticket) {
    setActionLoading(true);
    try {
      const skillName = TICKET_TYPE_SKILL[ticket.type];

      // 1. Dispatch agent run with skill matched to ticket type
      const provider = MODELS.find(m => m.id === selectedModel)?.provider || 'ollama';
      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildAgentPrompt(ticket),
          conversationId: null,
          model: selectedModel,
          provider,
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

  async function rerunTicket(ticket: Ticket) {
    setActionLoading(true);
    try {
      const skillName = TICKET_TYPE_SKILL[ticket.type];
      const provider = MODELS.find(m => m.id === selectedModel)?.provider || 'ollama';
      const prevRun = agentRuns.get(ticket.id);
      const prevBranch = prevRun?.progressLog
        ? (prevRun.progressLog.match(/ok:github_create_branch:\{"branch":"([^"]+)"/) || [])[1]
        : null;
      const continuation = prevBranch
        ? `\n\nCONTINUATION NOTE: A previous run already created branch "${prevBranch}" and made some commits. Check that branch first, see what was done, and continue from where it left off — open the PR if all changes are ready, or apply missing changes first.`
        : '';

      const agentRes = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildAgentPrompt(ticket) + continuation,
          conversationId: null,
          model: selectedModel,
          provider,
          skillName,
        }),
      });
      const { runId } = await agentRes.json();

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

      if (runId) {
        setAgentRuns(prev => new Map(prev).set(ticket.id, { runId, status: 'pending', result: null, error: null, progressLog: null }));
        pollAgentRun(ticket.id, runId);
      }
    } finally {
      setActionLoading(false);
    }
  }

  function pollPrStatus(prNumber: number) {
    const existing = prPollTimers.current.get(prNumber);
    if (existing) clearTimeout(existing);

    const check = async () => {
      try {
        const res = await fetch(`/api/github/pr/${prNumber}`);
        if (!res.ok) return;
        const data = await res.json();
        setPrStatuses(prev => new Map(prev).set(prNumber, { status: data.status, title: data.title }));
        if (data.status === 'open') {
          const t = setTimeout(check, 30000);
          prPollTimers.current.set(prNumber, t);
        } else {
          prPollTimers.current.delete(prNumber);
        }
      } catch {}
    };

    check();
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

  async function deleteTicket(id: string) {
    if (!confirm('Are you sure you want to delete this ticket? This action cannot be undone.')) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setTickets(prev => prev.filter(tk => tk.id !== id));
        setSelected(null);
      }
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
    <DomainProvider value={{ isDark, lastToolCall, setLastToolCall, postContext: '', setPostContext: () => {} }}>
    <div style={{ display: 'flex', height: '100vh', background: t.bg, color: t.text }}>

      {/* ── Standard sidebar ────────────────────────────────────────────── */}
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}
      <div className="lg:hidden">
        <SidebarMobile
          isSidebarOpen={isSidebarOpen} isDarkMode={isDark} onClose={() => setIsSidebarOpen(false)}
          conversations={convList} currentConversationId={convId}
          loadConversation={loadConversation} deleteConversation={handleDelete}
          pinConversation={pinConversation} renameConversation={renameConversation}
          isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail}
          onLogout={handleLogout} onToggleTheme={toggleTheme}
        />
      </div>
      <div className="hidden lg:block">
        <SidebarDesktop
          isSidebarCollapsed={isSidebarCollapsed} setIsSidebarCollapsed={setSidebarCollapsed}
          isDarkMode={isDark} conversations={convList} currentConversationId={convId}
          loadConversation={loadConversation} deleteConversation={handleDelete}
          pinConversation={pinConversation} renameConversation={renameConversation}
          isAdmin={isAdmin} onNewConversation={clearChat} userName={userName ?? undefined} userEmail={userEmail}
          onLogout={handleLogout} onToggleTheme={toggleTheme}
        />
      </div>

      {/* ── Main area (tickets + chat) ───────────────────────────────────── */}
      <div className={`flex-1 flex flex-col overflow-hidden ${isSidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>

      {/* Mobile tab bar */}
      <div className={`lg:hidden flex-shrink-0 flex items-center border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <button onClick={() => setIsSidebarOpen(true)} className={`px-3 py-2.5 ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        {(['tickets', 'chat'] as const).map(tab => (
          <button key={tab} onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === tab
                ? `border-b-2 border-indigo-500 ${isDark ? 'text-white' : 'text-gray-900'}`
                : isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab === 'tickets' ? 'Tickets' : 'Chat'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>

      {/* ── Tickets panel (filters + list + detail) ───────────────────── */}
      <div className={`${mobileTab === 'tickets' ? 'flex' : 'hidden'} lg:flex`} style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>

      {/* ── Ticket filters sidebar — desktop only ────────────────────────── */}
      <div className="hidden lg:flex" style={{ width: 220, borderRight: `1px solid ${t.border}`, flexDirection: 'column', flexShrink: 0, fontFamily: 'monospace', fontSize: 13 }}>
        <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>🎫 Tickets</div>
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

      {/* ── list — hidden when ticket selected ──────────────────────────── */}
      <div className={selected ? 'hidden' : 'flex'} style={{ flex: 1, flexDirection: 'column', minWidth: 0, fontFamily: 'monospace', fontSize: 13 }}>

        {/* Mobile: filter pills */}
        <div className="lg:hidden" style={{ padding: '8px 12px', borderBottom: `1px solid ${t.border}`, display: 'flex', gap: 6, overflowX: 'auto' }}>
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '4px 10px', borderRadius: 12, border: 'none', cursor: 'pointer', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0,
                background: filter === f.id ? (isDark ? '#1f6feb' : '#0969da') : (isDark ? '#21262d' : '#eaeef2'),
                color: filter === f.id ? '#fff' : t.textMuted,
              }}
            >
              {f.label} {counts[f.id]}
            </button>
          ))}
        </div>

        <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ color: t.textMuted, fontSize: 12 }}>{visible.length} tickets</span>
          <button
            className="lg:hidden"
            onClick={() => setShowForm(true)}
            style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: t.btnResolve, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            + New
          </button>
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
                  <span style={{ fontSize: 10, color: t.textGhost, flexShrink: 0, marginRight: 6 }}>#{tk.number}</span>
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

      {/* ── detail — full width when selected ───────────────────────────── */}
      {selected && (
        <div className="flex flex-1" style={{ borderLeft: `1px solid ${t.border}`, flexDirection: 'column', overflowY: 'auto', background: t.bg, fontFamily: 'monospace', fontSize: 13 }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${t.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                onClick={() => setSelected(null)}
                className="lg:hidden"
                style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: 0 }}
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Tickets
              </button>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Detail</span>
            </div>
            <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: t.textMuted, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ padding: 16, flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, lineHeight: 1.5, color: t.text }}>
              <span style={{ color: t.textGhost, fontWeight: 400, fontSize: 12, marginRight: 8 }}>#{selected.number}</span>{selected.title}
            </div>

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
              const steps = run.progressLog ? parseSteps(run.progressLog) : [];
              const hasNewFormat = run.progressLog ? (run.progressLog.includes('ok:') || run.progressLog.includes('err:')) : false;
              const finalText = run.result && !run.result.startsWith('## ') ? run.result : null;
              const pr = run.progressLog ? parsePRFromLog(run.progressLog) : null;
              return (
                <>
                {pr && (() => {
                  const prStatus = prStatuses.get(pr.pr_number);
                  const statusLabel = prStatus?.status === 'merged' ? 'MERGED' : prStatus?.status === 'closed' ? 'CLOSED' : 'OPEN';
                  const statusColor = prStatus?.status === 'merged' ? '#bd93f9' : prStatus?.status === 'closed' ? '#ff5555' : '#27c93f';
                  const bgColor = prStatus?.status === 'merged' ? '#2a1a3a' : prStatus?.status === 'closed' ? '#3a1a1a' : '#1a3a1a';
                  const borderColor = statusColor;
                  return (
                    <a
                      href={pr.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
                        background: bgColor, border: `1px solid ${borderColor}`, borderRadius: 8,
                        padding: '10px 14px', textDecoration: 'none', color: statusColor,
                      }}
                    >
                      <span style={{ fontSize: 16 }}>⤴</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>
                            Pull Request #{pr.pr_number}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, background: statusColor, color: '#000', borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5 }}>
                            {statusLabel}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: statusColor, opacity: 0.8, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {prStatus?.title || pr.title || 'Ver no GitHub →'}
                        </div>
                      </div>
                      <span style={{ fontSize: 10, opacity: 0.6 }}>→</span>
                    </a>
                  );
                })()}
                <div style={{ background: t.surface, border: `1px solid ${t.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: t.textFaint, textTransform: 'uppercase', letterSpacing: 1 }}>Agent Run</span>
                    <span style={{ fontSize: 11, color: statusColors[run.status] ?? t.textMuted, fontWeight: 600 }}>
                      {!isDone && '⟳ '}{run.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Step-by-step timeline */}
                  {steps.length > 0 && (
                    <div style={{ background: t.bg, borderRadius: 6, padding: '8px 10px', maxHeight: 280, overflowY: 'auto', marginBottom: 10, fontFamily: 'monospace' }}>
                      {steps.map((step, i) => {
                        const icon = step.status === 'ok' ? '✓'
                          : step.status === 'error' ? '✗'
                          : (isDone && !hasNewFormat) ? '·' : '⟳';
                        const iconColor = step.status === 'ok' ? '#27c93f'
                          : step.status === 'error' ? '#ff5555'
                          : (isDone && !hasNewFormat) ? t.textGhost : '#f1fa8c';
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '3px 0', borderBottom: i < steps.length - 1 ? `1px solid ${t.border}` : 'none' }}>
                            <span style={{ fontSize: 11, flexShrink: 0, width: 12, color: iconColor }}>{icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 11, color: '#ffb86c' }}>{step.tool}</span>
                              {step.args && (
                                <span style={{ fontSize: 10, color: t.textFaint, marginLeft: 6 }}>{step.args.slice(0, 60)}</span>
                              )}
                              {step.status === 'ok' && step.detail && (
                                <span style={{ fontSize: 10, color: t.textGhost, marginLeft: 6 }}>{step.detail.slice(0, 80)}</span>
                              )}
                              {step.status === 'error' && step.detail && (
                                <div style={{ fontSize: 10, color: '#ff5555', marginTop: 2, wordBreak: 'break-all', lineHeight: 1.4 }}>
                                  {step.detail.slice(0, 300)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Final text result */}
                  {finalText && (
                    <div style={{ fontSize: 11, color: t.textMuted, lineHeight: 1.6, maxHeight: 200, overflowY: 'auto', marginBottom: 10, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: t.bg, borderRadius: 6, padding: '8px 10px' }}>
                      {finalText}
                    </div>
                  )}

                  {run.error && (
                    <div style={{ fontSize: 11, color: '#ff5555', marginBottom: 8 }}>{run.error}</div>
                  )}
                  <a href="/logs" style={{ fontSize: 11, color: t.selectedBorder, textDecoration: 'none' }}>
                    Ver logs completos →
                  </a>
                </div>
                </>
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
                {(() => {
                  const run = agentRuns.get(selected.id);
                  const isDone = run && ['completed', 'failed', 'cancelled'].includes(run.status);
                  return isDone ? (
                    <button
                      disabled={actionLoading}
                      onClick={() => rerunTicket(selected)}
                      style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: 'none', background: '#3a2a5a', color: '#bd93f9', cursor: 'pointer', fontSize: 12 }}
                    >
                      ↺ Re-executar
                    </button>
                  ) : null;
            {(selected.status === 'resolved' || selected.status === 'cancelled') && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  disabled={actionLoading}
                  onClick={() => updateStatus(selected.id, 'open')}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid ${t.borderLight}`, background: 'transparent', color: t.textMuted, cursor: 'pointer', fontSize: 12 }}
                >
                  ↺ Reopen
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => deleteTicket(selected.id)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid #ff5555`, background: 'transparent', color: '#ff5555', cursor: 'pointer', fontSize: 12 }}
                >
                  🗑 Delete
                </button>
              </div>
            )}

            {/* Delete button for all statuses */}
            {selected.status !== 'resolved' && selected.status !== 'cancelled' && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button
                  disabled={actionLoading}
                  onClick={() => deleteTicket(selected.id)}
                  style={{ flex: 1, padding: '7px 0', borderRadius: 6, border: `1px solid #ff5555`, background: 'transparent', color: '#ff5555', cursor: 'pointer', fontSize: 12 }}
                >
                  🗑 Delete
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

      </div>{/* end tickets wrapper D */}

      {/* ── Chat panel ──────────────────────────────────────────────────── */}
      <div className={`${mobileTab === 'chat' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-none lg:w-[360px] flex-col border-l overflow-hidden ${isDark ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        {messages.length === 0 && !sending ? (
          <div className={`flex-1 flex flex-col items-center justify-center px-4 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
            <div className="w-full max-w-lg">
              <div className="text-center mb-8">
                <div className="w-fit mx-auto mb-6"><AlleracIcon size={64} /></div>
                <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
                  Hello, {displayName}!
                </h2>
                <h3 className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Ask me to list, create, or update your tickets.
                </h3>
              </div>
              <ChatInput
                inputMessage={input} setInputMessage={setInput}
                handleKeyPress={handleKeyPress} handleSendMessage={send}
                isSending={sending} githubToken={githubToken} isDarkMode={isDark}
                setIsDocumentModalOpen={() => {}}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                MODELS={MODELS}
                githubConfigured={true} googleConfigured={true} ollamaConnected={true}
                isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                onSaveMemory={handleSaveToMemory} hasConversation={!!convId} onStop={stop}
              />
            </div>
          </div>
        ) : (
          <>
            <div className={`flex-1 overflow-y-auto ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
              <ChatMessages
                messages={messages as unknown as Message[]}
                isSending={sending} selectedModel={selectedModel} MODELS={MODELS}
                isDarkMode={isDark} currentConversationId={convId}
                userId={userId} githubToken={githubToken}
                messagesEndRef={messagesEndRef} domainSlug="tickets"
              />
            </div>
            <div
              className={`flex-shrink-0 px-3 sm:px-4 pt-3 ${isDark ? 'bg-gray-900' : 'bg-white'}`}
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.75rem)' }}
            >
              <ChatInput
                inputMessage={input} setInputMessage={setInput}
                handleKeyPress={handleKeyPress} handleSendMessage={send}
                isSending={sending} githubToken={githubToken} isDarkMode={isDark}
                setIsDocumentModalOpen={() => {}}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                MODELS={MODELS}
                githubConfigured={true} googleConfigured={true} ollamaConnected={true}
                isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                onSaveMemory={handleSaveToMemory} hasConversation={!!convId} onStop={stop}
              />
            </div>
          </>
        )}
      </div>

      </div>{/* end inner row C (flex-row tickets+chat) */}
      </div>{/* end main area A (flex-col) */}

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

      <MemorySaveModal
        isOpen={memoryOpen}
        onClose={() => { setMemoryOpen(false); setMemoryResult(null); }}
        loading={memoryLoading} result={memoryResult} isDarkMode={isDark}
      />
      <MyAlleracModal
        isOpen={isMyAlleracOpen}
        onClose={() => setIsMyAlleracOpen(false)}
        isDarkMode={isDark} userId={userId} githubToken={githubToken}
        userName={userName ?? undefined} domainSlug="tickets"
      />
    </div>
    </DomainProvider>
  );
}
