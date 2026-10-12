'use client';

import { useEffect, useState, useCallback } from 'react';
import { getPublicAgentDashboard } from '@/app/actions/external-agents';
import type { PublicAgentSummary } from '@/app/services/domains/external-agent-metrics.service';
import { RequestVolumeChart, TopModelsChart } from './UsageCharts';

function fmtCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.001) return '<$0.001';
  return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

function usageColor(usedPercent: number): string {
  if (usedPercent >= 90) return '#ff5555';
  if (usedPercent >= 50) return '#f1fa8c';
  return '#50fa7b';
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#111',
      border: '1px solid #222',
      borderTop: `2px solid ${color ?? '#444'}`,
      padding: '10px 14px',
      minWidth: 120,
      flex: '1 1 120px',
    }}>
      <div style={{ fontSize: '10px', color: '#999', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 500, color: color ?? '#e0e0e0', fontFamily: '"JetBrains Mono", monospace' }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '10px', color: '#888', marginTop: '3px' }}>{sub}</div>}
    </div>
  );
}

function AgentCard({ agent }: { agent: PublicAgentSummary }) {
  return (
    <div style={{ border: '1px solid #222', background: '#0d0d0d', marginBottom: '20px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #222', background: '#111',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: '#8be9fd', fontWeight: 600 }}>{agent.displayName}</span>
          <span style={{ fontSize: '10px', color: '#666' }}>/{agent.domainSlug}</span>
        </div>
        {!agent.ownerEmail && (
          <span style={{ fontSize: '10px', color: '#ff5555' }}>⚠ no bot account provisioned</span>
        )}
      </div>

      <div style={{ padding: '12px 14px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <StatBox
            label="Model"
            value={agent.modelId ?? '— not set —'}
            sub={agent.provider ?? undefined}
            color={agent.modelId ? '#bd93f9' : '#ff5555'}
          />
          <StatBox label="Cost today" value={fmtCost(agent.today.costUsd)} sub={`${agent.today.requests} reqs`} color={agent.today.costUsd > 0 ? '#f1fa8c' : '#444'} />
          <StatBox label="Cost this month" value={fmtCost(agent.month.costUsd)} sub={`${agent.month.requests} reqs · ${fmtTokens(agent.month.tokens)} tok`} color={agent.month.costUsd > 0 ? '#f1fa8c' : '#444'} />
          <StatBox
            label="Alerts"
            value={agent.alertsConfigured ? 'Configured' : 'Not set'}
            sub={agent.alertsConfigured ? `at ${agent.alertThresholdsPercent.join('%, ')}%` : 'no Telegram alert'}
            color={agent.alertsConfigured ? '#50fa7b' : '#f1fa8c'}
          />
        </div>

        {agent.usage && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#999', marginBottom: '4px' }}>
              <span>{agent.usage.used} / {agent.usage.limit} requests today ({agent.usage.usedPercent}%)</span>
              <span>resets in {formatDuration(agent.usage.resetSeconds)}</span>
            </div>
            <div style={{ height: '6px', background: '#1a1a1a', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, agent.usage.usedPercent)}%`,
                background: usageColor(agent.usage.usedPercent),
                transition: 'width 0.2s',
              }} />
            </div>
          </div>
        )}

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '20px',
          marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #1a1a1a',
        }}>
          <div style={{ flex: '2 1 280px', minWidth: 0 }}>
            <RequestVolumeChart domainSlug={agent.domainSlug} />
          </div>
          <div style={{ flex: '1 1 220px', minWidth: 0 }}>
            <TopModelsChart domainSlug={agent.domainSlug} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BotsTab() {
  const [agents, setAgents] = useState<PublicAgentSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await getPublicAgentDashboard();
    setAgents(data);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await refresh();
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    load();
    // Background refresh only — doesn't toggle `loading`, so the cards don't
    // flash back to the loading state every 30s.
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [load, refresh]);

  if (loading) {
    return (
      <div style={{ padding: '32px', color: '#888', textAlign: 'center', fontFamily: '"JetBrains Mono", monospace', fontSize: '12px' }}>
        loading bots...
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
      <div style={{
        fontSize: '10px', color: '#aaa', letterSpacing: '0.15em', textTransform: 'uppercase',
        padding: '0 0 12px', borderBottom: '1px solid #333', marginBottom: '16px',
      }}>
        Public-Facing Agents
      </div>

      {agents.length === 0 && (
        <div style={{ color: '#777', fontSize: '11px', textAlign: 'center', marginTop: '24px' }}>
          — no public-facing domains configured —
        </div>
      )}

      {agents.map(agent => <AgentCard key={agent.domainSlug} agent={agent} />)}
    </div>
  );
}
