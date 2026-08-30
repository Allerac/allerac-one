'use client';

// Usage charts for the BOTS tab. Colors for the top-models breakdown come from
// the dataviz skill's validated default categorical palette (dark mode, slots
// 1-3: blue/orange/aqua) — the page's existing pastel terminal accents
// (#50fa7b/#f1fa8c/#bd93f9/…) failed the categorical lightness-band and
// chroma-floor checks against this page's #111 card surface, so they aren't
// used for series identity here (they're fine for the single-hue status dots
// elsewhere on this page, which aren't subject to the categorical checks).
// Validated via: node scripts/validate_palette.js "#3987e5,#d95926,#199e70"
// --mode dark --surface "#111111" --pairs all → ALL CHECKS PASS.

import { useEffect, useRef, useState } from 'react';
import {
  getPublicAgentRequestSeries,
  getPublicAgentTopModels,
} from '@/app/actions/external-agents';
import type {
  ModelUsageShare,
  UsageBucket,
  UsageGranularity,
} from '@/app/services/domains/external-agent-metrics.service';

const MODEL_COLORS = ['#3987e5', '#d95926', '#199e70'];
const OTHER_COLOR = '#5a5a5a';
const VOLUME_COLOR = '#3987e5';

const GRANULARITIES: { id: UsageGranularity; label: string }[] = [
  { id: 'day', label: 'Day' },
  { id: 'week', label: 'Week' },
  { id: 'month', label: 'Month' },
];

function formatBucketLabel(iso: string, granularity: UsageGranularity): string {
  const d = new Date(iso);
  if (granularity === 'month') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  if (granularity === 'week') return `wk ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toggleBtnStyle(active: boolean): React.CSSProperties {
  return {
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '3px',
    cursor: 'pointer',
    background: active ? '#1a1a2e' : 'transparent',
    border: `1px solid ${active ? '#444' : 'transparent'}`,
    color: active ? '#8be9fd' : '#666',
    fontFamily: 'inherit',
  };
}

export function RequestVolumeChart({ domainSlug }: { domainSlug: string }) {
  const [granularity, setGranularity] = useState<UsageGranularity>('day');
  const [series, setSeries] = useState<UsageBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<number | null>(null);

  const requestId = useRef(0);

  // No loading flip on granularity change — the chart holds its previous
  // render while refetching (see dataviz skill's interaction.md: "refetch
  // keeps the frame... no skeleton, no flash"). `loading` only covers the
  // very first fetch, via its initial state above.
  useEffect(() => {
    const id = ++requestId.current;
    void getPublicAgentRequestSeries(domainSlug, granularity).then(data => {
      if (id !== requestId.current) return; // a newer request superseded this one
      setSeries(data);
      setLoading(false);
    });
  }, [domainSlug, granularity]);

  const max = Math.max(1, ...series.map(s => s.requests));
  const maxIndex = series.length > 0
    ? series.reduce((best, s, i) => (s.requests > series[best].requests ? i : best), 0)
    : -1;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Requests
        </span>
        <div style={{ display: 'flex', gap: '4px' }} role="group" aria-label="Time granularity">
          {GRANULARITIES.map(g => (
            <button key={g.id} onClick={() => setGranularity(g.id)} style={toggleBtnStyle(granularity === g.id)}>
              {g.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '11px' }}>
          loading…
        </div>
      ) : series.length === 0 ? (
        <div style={{ height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: '11px' }}>
          no data yet
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px',
            borderBottom: '1px solid #2c2c2a', padding: '16px 2px 0',
          }}>
            {series.map((bucket, i) => {
              const heightPct = bucket.requests > 0 ? Math.max((bucket.requests / max) * 100, 4) : 0;
              return (
                <div
                  key={bucket.bucket}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  tabIndex={bucket.requests > 0 ? 0 : -1}
                  role="img"
                  aria-label={`${formatBucketLabel(bucket.bucket, granularity)}: ${bucket.requests} requests`}
                  style={{
                    flex: '1 1 0',
                    maxWidth: '24px',
                    height: `${heightPct}%`,
                    background: VOLUME_COLOR,
                    borderRadius: '4px 4px 0 0',
                    position: 'relative',
                    opacity: hovered === null || hovered === i ? 1 : 0.55,
                    outline: 'none',
                  }}
                >
                  {i === maxIndex && bucket.requests > 0 && hovered !== i && (
                    <span style={{
                      position: 'absolute', top: '-16px', left: '50%', transform: 'translateX(-50%)',
                      fontSize: '9px', color: '#999', whiteSpace: 'nowrap',
                    }}>
                      {bucket.requests}
                    </span>
                  )}
                  {hovered === i && (
                    <div style={{
                      position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
                      marginBottom: '4px', background: '#1a1a2e', border: '1px solid #333', borderRadius: '3px',
                      padding: '3px 6px', fontSize: '10px', color: '#e0e0e0', whiteSpace: 'nowrap', zIndex: 5,
                    }}>
                      <strong style={{ color: '#fff' }}>{bucket.requests}</strong> reqs · {formatBucketLabel(bucket.bucket, granularity)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#666', marginTop: '4px' }}>
            <span>{formatBucketLabel(series[0].bucket, granularity)}</span>
            <span>{formatBucketLabel(series[series.length - 1].bucket, granularity)}</span>
          </div>
        </>
      )}
    </div>
  );
}

export function TopModelsChart({ domainSlug }: { domainSlug: string }) {
  const [models, setModels] = useState<ModelUsageShare[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void getPublicAgentTopModels(domainSlug).then(data => {
      setModels(data);
      setLoading(false);
    });
  }, [domainSlug]);

  const max = Math.max(1, ...models.map(m => m.requests));

  return (
    <div>
      <div style={{ fontSize: '10px', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
        Top Models — This Month
      </div>
      {loading ? (
        <div style={{ color: '#555', fontSize: '11px' }}>loading…</div>
      ) : models.length === 0 ? (
        <div style={{ color: '#555', fontSize: '11px' }}>no data yet</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {models.map((m, i) => {
            const widthPct = Math.max((m.requests / max) * 100, 3);
            const color = m.model === null ? OTHER_COLOR : (MODEL_COLORS[i] ?? OTHER_COLOR);
            const label = m.model ?? 'Other';
            return (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{ fontSize: '10px', color: '#bbb', width: '130px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={label}
                >
                  {label}
                </span>
                <div style={{ flex: 1, height: '14px', background: '#1a1a1a', borderRadius: '3px', position: 'relative' }}>
                  <div style={{ width: `${widthPct}%`, height: '100%', background: color, borderRadius: '0 3px 3px 0' }} />
                </div>
                <span style={{ fontSize: '10px', color: '#999', width: '36px', textAlign: 'right', flexShrink: 0 }}>
                  {m.requests}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
