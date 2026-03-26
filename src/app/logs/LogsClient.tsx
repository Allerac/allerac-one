'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { CONTEXT_COLORS, type LogEntry, type LogLevel } from '@/lib/logger-shared';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import type { Model } from '@/app/types';

// Lazy-load heavy tabs
const MetricsTab      = dynamic(() => import('./MetricsTab'),    { ssr: false });
const BenchmarkPanel  = dynamic(() => import('@/app/components/system/BenchmarkPanel'), { ssr: false });
const SkillEvalPanel  = dynamic(() => import('@/app/components/system/SkillEvalPanel'), { ssr: false });

// ── Colour helpers ────────────────────────────────────────────────────────────

function contextColor(context: string): string {
  return CONTEXT_COLORS[context] ?? '#b0bec5';
}

function levelColor(level: LogLevel): string {
  if (level === 'error') return '#ff5555';
  if (level === 'warn')  return '#f1fa8c';
  return '';
}

function lineColor(entry: LogEntry): string {
  return levelColor(entry.level) || contextColor(entry.context);
}

// ── Log filters ───────────────────────────────────────────────────────────────

const LOG_FILTERS = [
  { id: 'ALL',       label: 'ALL',      match: (_: LogEntry) => true },
  { id: 'CHAT',      label: 'CHAT',     match: (e: LogEntry) => e.context === 'ChatRoute' },
  { id: 'SKILLS',    label: 'SKILLS',   match: (e: LogEntry) => e.context === 'Skills' || e.context === 'SystemSkills' },
  { id: 'MEMORY',    label: 'MEMORY',   match: (e: LogEntry) => e.context === 'Memory' },
  { id: 'RAG',       label: 'RAG',      match: (e: LogEntry) => e.context === 'RAG' },
  { id: 'LLM',       label: 'LLM',      match: (e: LogEntry) => e.context === 'LLM' },
  { id: 'WORKSPACE', label: 'WORK',     match: (e: LogEntry) => e.context === 'Workspace' },
  { id: 'HEALTH',    label: 'HEALTH',   match: (e: LogEntry) => e.context === 'Health' },
  { id: 'ERRORS',    label: 'ERRORS',   match: (e: LogEntry) => e.level === 'error' || e.level === 'warn' },
];

// ── Shared retro styles ───────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: '"JetBrains Mono", "Courier New", monospace' };

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
  ...MONO,
  background: active ? '#1a1a2e' : 'transparent',
  border: active ? '1px solid #444' : '1px solid transparent',
  borderBottom: active ? '1px solid #1a1a2e' : '1px solid transparent',
  color: active ? '#8be9fd' : '#555',
  padding: '6px 16px',
  cursor: 'pointer',
  fontSize: '11px',
  borderRadius: '3px 3px 0 0',
  transition: 'all 0.1s',
  flexShrink: 0,
});

const filterBtnStyle = (active: boolean): React.CSSProperties => ({
  ...MONO,
  background: active ? '#1a1a2e' : 'transparent',
  border: active ? '1px solid #444' : '1px solid transparent',
  color: active ? '#8be9fd' : '#555',
  padding: '2px 8px',
  cursor: 'pointer',
  fontSize: '11px',
  borderRadius: '3px',
  transition: 'all 0.1s',
});

// ── Main component ────────────────────────────────────────────────────────────

interface LogsClientProps {
  userId: string;
  MODELS: Model[];
  defaultModel: string;
}

export default function LogsClient({ userId, MODELS, defaultModel }: LogsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<'logs' | 'metrics' | 'benchmark' | 'evals'>('logs');

  // Logs state
  const [entries, setEntries]       = useState<LogEntry[]>([]);
  const [filter, setFilter]         = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [connected, setConnected]   = useState(false);
  const [cleared, setCleared]       = useState(0);
  const [cursorOn, setCursorOn]     = useState(true);

  const bottomRef    = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Blinking cursor
  useEffect(() => {
    const t = setInterval(() => setCursorOn(v => !v), 530);
    return () => clearInterval(t);
  }, []);

  // SSE — always connected regardless of active tab so history is never stale
  useEffect(() => {
    const es = new EventSource('/api/logs');
    es.onopen    = () => setConnected(true);
    es.onerror   = () => setConnected(false);
    es.onmessage = (evt) => {
      try {
        const entry: LogEntry = JSON.parse(evt.data);
        setEntries(prev => [...prev, entry]);
      } catch { /* skip malformed */ }
    };
    return () => es.close();
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (tab === 'logs' && autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'instant' });
    }
  }, [entries, autoScroll, tab]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const filterFn = LOG_FILTERS.find(f => f.id === filter)?.match ?? (() => true);
  const visible  = entries.filter(e => e.id > cleared).filter(filterFn);

  return (
    <div style={{
      ...MONO,
      background: '#0d0d0d',
      height: '100dvh',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      color: '#b0bec5',
      fontSize: '13px',
    }}>

      {/* ── Title bar ── */}
      <div style={{
        background: '#1a1a2e',
        borderBottom: '1px solid #333',
        padding: '6px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => router.push('/')}
            title="Back to Desktop"
            style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f56', border: 'none', cursor: 'pointer' }}
          />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ffbd2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#27c93f' }} />
        </div>

        <span style={{ color: '#8be9fd', fontWeight: 'bold', fontSize: '12px', letterSpacing: '0.05em' }}>
          📟 ALLERAC SYSTEM MONITOR v1.0
        </span>

        <div style={{ flex: 1 }} />

        {/* Pop-out button — opens Monitor in a floating window */}
        <button
          onClick={() => window.open('/logs', 'allerac-monitor', 'width=860,height=640,menubar=no,toolbar=no,location=no,status=no,resizable=yes')}
          title="Open in floating window"
          style={{
            background: 'transparent',
            border: '1px solid #333',
            color: '#555',
            cursor: 'pointer',
            borderRadius: '3px',
            padding: '2px 7px',
            fontSize: '13px',
            fontFamily: 'inherit',
            lineHeight: 1,
          }}
        >
          ⧉
        </button>

        {/* LIVE indicator — only meaningful on Logs tab */}
        {tab === 'logs' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: connected ? '#27c93f' : '#ff5f56',
              boxShadow: connected ? '0 0 6px #27c93f' : 'none',
            }} />
            <span style={{ fontSize: '11px', color: connected ? '#27c93f' : '#ff5f56' }}>
              {connected ? '■ LIVE' : '● RECONNECTING'}
            </span>
          </div>
        )}

        {tab === 'logs' && (
          <span style={{ fontSize: '11px', color: '#555', marginLeft: '8px' }}>
            {visible.length} lines
          </span>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        background: '#0d0d0d',
        borderBottom: '1px solid #1a1a1a',
        padding: '8px 12px 0',
        display: 'flex',
        gap: '4px',
        flexShrink: 0,
      }}>
        <button style={tabBtnStyle(tab === 'logs')}       onClick={() => setTab('logs')}>
          📋 LOGS
        </button>
        <button style={tabBtnStyle(tab === 'metrics')}    onClick={() => setTab('metrics')}>
          📊 METRICS
        </button>
        <button style={tabBtnStyle(tab === 'benchmark')}  onClick={() => setTab('benchmark')}>
          🏃 BENCHMARK
        </button>
        <button style={tabBtnStyle(tab === 'evals')}      onClick={() => setTab('evals')}>
          🧪 EVALS
        </button>
      </div>

      {/* ── LOGS tab ── */}
      {tab === 'logs' && (
        <>
          {/* Filter bar */}
          <div style={{
            background: '#111',
            borderBottom: '1px solid #1a1a1a',
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}>
            {LOG_FILTERS.map(f => (
              <button key={f.id} style={filterBtnStyle(filter === f.id)} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}

            <div style={{ flex: 1 }} />

            <button
              onClick={() => setAutoScroll(v => !v)}
              style={{
                ...filterBtnStyle(false),
                background: autoScroll ? '#1a2e1a' : 'transparent',
                border: `1px solid ${autoScroll ? '#27c93f' : '#333'}`,
                color: autoScroll ? '#27c93f' : '#555',
              }}
            >
              {autoScroll ? '⬇ FOLLOW' : '⏸ PAUSED'}
            </button>

            <button
              onClick={() => setCleared(entries[entries.length - 1]?.id ?? 0)}
              style={{ ...filterBtnStyle(false), border: '1px solid #333', color: '#555' }}
            >
              CLEAR
            </button>
          </div>

          {/* Log lines */}
          <div
            ref={containerRef}
            onScroll={handleScroll}
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '8px 12px',
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.08) 1px, rgba(0,0,0,0.08) 2px)',
            }}
          >
            {visible.length === 0 && (
              <div style={{ color: '#2a2a2a', marginTop: '24px', textAlign: 'center', fontSize: '12px' }}>
                — waiting for output —
              </div>
            )}

            {visible.map(entry => <LogLine key={entry.id} entry={entry} />)}

            <div style={{ height: '4px', display: 'flex', alignItems: 'center', paddingTop: '2px' }}>
              <span style={{ color: '#00ff41', opacity: cursorOn ? 1 : 0 }}>▋</span>
            </div>

            <div ref={bottomRef} />
          </div>
        </>
      )}

      {/* ── METRICS tab ── */}
      {tab === 'metrics' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <MetricsTab />
        </div>
      )}

      {/* ── BENCHMARK tab ── */}
      {tab === 'benchmark' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <BenchmarkPanel
            isDarkMode={true}
            userId={userId}
            MODELS={MODELS}
            selectedModel={defaultModel}
          />
        </div>
      )}

      {/* ── EVALS tab ── */}
      {tab === 'evals' && (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SkillEvalPanel
            userId={userId}
            MODELS={MODELS}
            selectedModel={defaultModel}
          />
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap');
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0d0d0d; }
        ::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #444; }
      `}</style>
    </div>
  );
}

// ── Log line ──────────────────────────────────────────────────────────────────

function LogLine({ entry }: { entry: LogEntry }) {
  const color = lineColor(entry);
  return (
    <div style={{
      display: 'flex',
      gap: 0,
      lineHeight: 1.5,
      padding: '0.5px 0',
      fontSize: '12.5px',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      fontFamily: '"JetBrains Mono", "Courier New", monospace',
    }}>
      <span style={{ color: '#2a2a2a', flexShrink: 0, marginRight: 10, userSelect: 'none' }}>
        {entry.ts}
      </span>
      <span style={{ color: contextColor(entry.context), flexShrink: 0, marginRight: 10, minWidth: 110, display: 'inline-block', opacity: 0.9 }}>
        [{entry.context}]
      </span>
      {(entry.level === 'error' || entry.level === 'warn') && (
        <span style={{ color: levelColor(entry.level), fontWeight: 'bold', flexShrink: 0, marginRight: 8 }}>
          {entry.level.toUpperCase()}
        </span>
      )}
      <span style={{ color }}>{entry.message}</span>
    </div>
  );
}
