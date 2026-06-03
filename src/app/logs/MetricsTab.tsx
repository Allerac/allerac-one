'use client';

import { useEffect, useState, useCallback } from 'react';
import { getTokenStats, getTavilyStats, getTokenStatsByModel, getTokenStatsByUser, getModelPricing, saveModelPricing } from '@/app/actions/metrics';

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

interface ModelStats {
  model: string;
  provider: string;
  total_tokens: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_requests: number;
  estimated_cost_usd: number;
}

interface UserStats {
  user_id: string;
  total_tokens: number;
  total_requests: number;
  estimated_cost_usd: number;
}

interface ModelPricing {
  model_id: string;
  provider: string;
  display_name: string;
  input_price_per_1m: number;
  output_price_per_1m: number;
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
      <div style={{ fontSize: '10px', color: '#999', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontSize: '22px', fontWeight: 500, color: color ?? '#e0e0e0', fontFamily: '"JetBrains Mono", monospace' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>{sub}</div>
      )}
    </div>
  );
}

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '10px',
      color: '#aaa',
      letterSpacing: '0.15em',
      textTransform: 'uppercase',
      padding: '16px 0 8px',
      borderBottom: '1px solid #333',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
    }}>
      <span>{children}</span>
      {action}
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

const PROVIDER_COLOR: Record<string, string> = {
  anthropic: '#cc785c',
  gemini: '#4285f4',
  'github-models': '#58a6ff',
  github: '#58a6ff',
  ollama: '#50fa7b',
};

export default function MetricsTab() {
  const [tokens24h, setTokens24h]         = useState<TokenStats | null>(null);
  const [tokensMonth, setTokensMonth]     = useState<TokenStats | null>(null);
  const [tavily24h, setTavily24h]         = useState<TavilyStats | null>(null);
  const [modelStats, setModelStats]       = useState<ModelStats[]>([]);
  const [userStats, setUserStats]         = useState<UserStats[]>([]);
  const [pricing, setPricing]             = useState<ModelPricing[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showPricing, setShowPricing]     = useState(false);
  const [editingPrice, setEditingPrice]   = useState<{ modelId: string; input: string; output: string } | null>(null);
  const [savingPrice, setSavingPrice]     = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [t24, tMonth, tv24, byModel, byUser, prices] = await Promise.all([
        getTokenStats(24, false),
        getTokenStats(24, true),
        getTavilyStats(24, false),
        getTokenStatsByModel(24, true),
        getTokenStatsByUser(24, true),
        getModelPricing(),
      ]);
      setTokens24h(t24 as unknown as TokenStats);
      setTokensMonth(tMonth as unknown as TokenStats);
      setTavily24h(tv24 as unknown as TavilyStats);
      setModelStats(byModel as unknown as ModelStats[]);
      setUserStats(byUser as unknown as UserStats[]);
      setPricing(prices as unknown as ModelPricing[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleSavePrice = async () => {
    if (!editingPrice) return;
    setSavingPrice(true);
    await saveModelPricing(editingPrice.modelId, parseFloat(editingPrice.input), parseFloat(editingPrice.output));
    setEditingPrice(null);
    setSavingPrice(false);
    const prices = await getModelPricing();
    setPricing(prices as unknown as ModelPricing[]);
  };

  if (loading) {
    return (
      <div style={{ padding: '32px', color: '#888', textAlign: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
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

      {/* ── By model this month ── */}
      {modelStats.length > 0 && (
        <>
          <SectionHeader>By Model — This Month</SectionHeader>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px' }}>
            <thead>
              <tr style={{ color: '#777', borderBottom: '1px solid #222' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}>Model</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Reqs</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Tokens</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {modelStats.map(row => (
                <tr key={row.model} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={{ padding: '5px 8px', color: PROVIDER_COLOR[row.provider] ?? '#e0e0e0' }}>
                    {row.model}
                  </td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#bbb' }}>{row.total_requests}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#bbb' }}>{fmtTokens(row.total_tokens)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: row.estimated_cost_usd > 0 ? '#f1fa8c' : '#555' }}>
                    {fmtCost(row.estimated_cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ── By user this month ── */}
      {userStats.length > 0 && (
        <>
          <SectionHeader>By User — This Month</SectionHeader>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px' }}>
            <thead>
              <tr style={{ color: '#777', borderBottom: '1px solid #222' }}>
                <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}>User</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Reqs</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Tokens</th>
                <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {userStats.map(row => (
                <tr key={row.user_id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                  <td style={{ padding: '5px 8px', color: '#e0e0e0' }}>{row.user_id}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#bbb' }}>{row.total_requests}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: '#bbb' }}>{fmtTokens(row.total_tokens)}</td>
                  <td style={{ padding: '5px 8px', textAlign: 'right', color: row.estimated_cost_usd > 0 ? '#f1fa8c' : '#555' }}>
                    {fmtCost(row.estimated_cost_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

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

      {/* ── Pricing config ── */}
      {pricing.length > 0 && (
        <>
          <SectionHeader
            action={
              <button
                onClick={() => setShowPricing(v => !v)}
                style={{ fontSize: '9px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em', textTransform: 'uppercase' }}
              >
                {showPricing ? 'hide' : 'edit'}
              </button>
            }
          >
            Model Pricing ($/1M tokens)
          </SectionHeader>

          {showPricing && (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '11px' }}>
              <thead>
                <tr style={{ color: '#777', borderBottom: '1px solid #222' }}>
                  <th style={{ textAlign: 'left', padding: '4px 8px', fontWeight: 400 }}>Model</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Input</th>
                  <th style={{ textAlign: 'right', padding: '4px 8px', fontWeight: 400 }}>Output</th>
                  <th style={{ padding: '4px 8px' }} />
                </tr>
              </thead>
              <tbody>
                {pricing.map(row => {
                  const isEditing = editingPrice?.modelId === row.model_id;
                  return (
                    <tr key={row.model_id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td style={{ padding: '5px 8px', color: PROVIDER_COLOR[row.provider] ?? '#e0e0e0' }}>
                        {row.display_name}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            value={editingPrice.input}
                            onChange={e => setEditingPrice(p => p ? { ...p, input: e.target.value } : null)}
                            style={{ width: 70, background: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', padding: '2px 4px', fontSize: '11px', textAlign: 'right', fontFamily: 'inherit' }}
                          />
                        ) : (
                          <span style={{ color: '#bbb' }}>${row.input_price_per_1m.toFixed(4)}</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                        {isEditing ? (
                          <input
                            value={editingPrice.output}
                            onChange={e => setEditingPrice(p => p ? { ...p, output: e.target.value } : null)}
                            style={{ width: 70, background: '#1a1a1a', border: '1px solid #333', color: '#e0e0e0', padding: '2px 4px', fontSize: '11px', textAlign: 'right', fontFamily: 'inherit' }}
                          />
                        ) : (
                          <span style={{ color: '#bbb' }}>${row.output_price_per_1m.toFixed(4)}</span>
                        )}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                        {isEditing ? (
                          <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button onClick={handleSavePrice} disabled={savingPrice}
                              style={{ fontSize: '10px', color: '#50fa7b', background: 'none', border: 'none', cursor: 'pointer' }}>
                              {savingPrice ? '...' : 'save'}
                            </button>
                            <button onClick={() => setEditingPrice(null)}
                              style={{ fontSize: '10px', color: '#ff5555', background: 'none', border: 'none', cursor: 'pointer' }}>
                              cancel
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={() => setEditingPrice({ modelId: row.model_id, input: String(row.input_price_per_1m), output: String(row.output_price_per_1m) })}
                            style={{ fontSize: '10px', color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}
                          >
                            edit
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {/* ── Hint ── */}
      {(tokens24h?.total_tokens === 0 && tavily24h?.total_calls === 0) && (
        <div style={{ color: '#777', fontSize: '11px', marginTop: '24px', textAlign: 'center' }}>
          — no activity in the last 24 hours —<br />
          <span style={{ fontSize: '10px', color: '#666' }}>
            send a message in any domain to see metrics here
          </span>
        </div>
      )}
    </div>
  );
}
