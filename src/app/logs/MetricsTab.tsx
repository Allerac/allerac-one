'use client';

import { useEffect, useState } from 'react';
import { getTokenStats, getTavilyStats } from '@/app/actions/metrics';

interface TokenStats {
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_requests: number;
  estimated_cost_usd: number;
}

interface TavilyStats {
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  avg_response_time_ms: number;
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderTop: `2px solid ${color ?? '#444'}`,
      padding: '12px 16px',
      minWidth: 140,
      flex: '1 1 140px',
    }}>
      <div style={{ fontSize: '10px', color: '#555', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 500, color: color ?? '#e0e0e0', fontFamily: '"JetBrains Mono", monospace' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '10px', color: '#444', marginTop: '4px' }}>{sub}</div>
      )}
    </div>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px',
      color: '#555',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      padding: '16px 0 8px',
      borderBottom: '1px solid #1a1a1a',
      marginBottom: '12px',
    }}>
      {children}
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}


export default function MetricsTab() {
  const [tokens24h, setTokens24h] = useState<TokenStats | null>(null);
  const [tokensMonth, setTokensMonth] = useState<TokenStats | null>(null);
  const [tavily24h, setTavily24h] = useState<TavilyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getTokenStats(24, false),
      getTokenStats(24, true),
      getTavilyStats(24, false),
    ]).then(([t24, tMonth, tv24]) => {
      setTokens24h(t24 as unknown as TokenStats);
      setTokensMonth(tMonth as unknown as TokenStats);
      setTavily24h(tv24 as unknown as TavilyStats);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '32px', color: '#444', textAlign: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
        loading metrics...
      </div>
    );
  }

  return (
    <div style={{
      padding: '16px 20px',
      overflowY: 'auto',
      flex: 1,
      fontFamily: '"JetBrains Mono", "Courier New", monospace',
    }}>

      {/* ── Token usage ── */}
      <SectionHeader>Token Usage</SectionHeader>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <StatBox
          label="Tokens today"
          value={fmtTokens(tokens24h?.total_tokens ?? 0)}
          sub={`↑ ${fmtTokens(tokens24h?.prompt_tokens ?? 0)} prompt  ↓ ${fmtTokens(tokens24h?.completion_tokens ?? 0)} output`}
          color="#00ff41"
        />
        <StatBox
          label="Cost today"
          value={fmtCost(tokens24h?.estimated_cost_usd ?? 0)}
          sub="estimated"
          color={tokens24h?.estimated_cost_usd ? '#f1fa8c' : '#444'}
        />
        <StatBox
          label="Tokens this month"
          value={fmtTokens(tokensMonth?.total_tokens ?? 0)}
          color="#8be9fd"
        />
        <StatBox
          label="Cost this month"
          value={fmtCost(tokensMonth?.estimated_cost_usd ?? 0)}
          sub="estimated"
          color={tokensMonth?.estimated_cost_usd ? '#f1fa8c' : '#444'}
        />
        <StatBox
          label="Requests today"
          value={String(tokens24h?.total_requests ?? 0)}
          sub="LLM calls"
          color="#bd93f9"
        />
      </div>

      {/* ── Web search ── */}
      <SectionHeader>Web Search (Tavily)</SectionHeader>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '20px' }}>
        <StatBox
          label="Searches today"
          value={String(tavily24h?.total_calls ?? 0)}
          color="#ff79c6"
        />
        <StatBox
          label="Success rate"
          value={tavily24h?.total_calls
            ? `${(((tavily24h.successful_calls ?? 0) / tavily24h.total_calls) * 100).toFixed(0)}%`
            : '—'}
          color={tavily24h?.total_calls && (tavily24h.successful_calls / tavily24h.total_calls) >= 0.95 ? '#50fa7b' : '#f1fa8c'}
        />
        <StatBox
          label="Avg latency"
          value={tavily24h?.avg_response_time_ms ? `${Math.round(tavily24h.avg_response_time_ms)}ms` : '—'}
          color="#ffb86c"
        />
      </div>

      {/* ── Hint ── */}
      {(tokens24h?.total_tokens === 0 && tavily24h?.total_calls === 0) && (
        <div style={{ color: '#333', fontSize: '11px', marginTop: '24px', textAlign: 'center' }}>
          — no activity in the last 24 hours —<br />
          <span style={{ fontSize: '10px', color: '#2a2a2a' }}>
            send a message in any domain to see metrics here
          </span>
        </div>
      )}
    </div>
  );
}
