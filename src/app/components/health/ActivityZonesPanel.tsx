'use client';

import { useTranslations } from 'next-intl';

export interface Zone {
  metric_type: string;
  zone_number: number;
  lower_bound: number | null;
  upper_bound: number | null;
  duration_seconds: number | null;
  percent: number | null;
}

interface Props {
  zones: Zone[];
  isDarkMode: boolean;
}

// Zone 1 (recovery) -> Zone 5 (max effort), consistent across metrics.
const ZONE_COLORS = ['#3b82f6', '#22c55e', '#eab308', '#f97316', '#ef4444'];

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ActivityZonesPanel({ zones, isDarkMode }: Props) {
  const t = useTranslations('health');
  const d = isDarkMode;
  const cardCls = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const textMain = d ? 'text-gray-100' : 'text-gray-900';
  const trackBg = d ? 'bg-gray-700' : 'bg-gray-200';

  if (zones.length === 0) return null;

  const byMetric = new Map<string, Zone[]>();
  for (const z of zones) {
    const list = byMetric.get(z.metric_type) ?? [];
    list.push(z);
    byMetric.set(z.metric_type, list);
  }

  const metricLabel = (metric: string) =>
    metric === 'heart_rate' ? t('heartRate') : metric === 'power' ? t('power') : metric;

  return (
    <div className={cardCls}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${textMuted}`}>{t('zones')}</p>
      <div className="flex flex-col gap-4">
        {Array.from(byMetric.entries()).map(([metric, metricZones]) => (
          <div key={metric}>
            <p className={`text-xs font-medium mb-1.5 ${textMuted}`}>{metricLabel(metric)}</p>
            <div className="flex flex-col gap-1">
              {metricZones
                .slice()
                .sort((a, b) => a.zone_number - b.zone_number)
                .map((z) => {
                  const color = ZONE_COLORS[Math.min(Math.max(z.zone_number - 1, 0), ZONE_COLORS.length - 1)];
                  const pct = z.percent ?? 0;
                  return (
                    <div key={z.zone_number} className="flex items-center gap-2 text-xs">
                      <span className={`w-8 flex-shrink-0 ${textMuted}`}>Z{z.zone_number}</span>
                      <div className={`flex-1 h-3 rounded-full overflow-hidden ${trackBg}`}>
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                        />
                      </div>
                      <span className={`w-14 flex-shrink-0 text-right ${textMain}`}>{fmtDuration(z.duration_seconds)}</span>
                      <span className={`w-10 flex-shrink-0 text-right ${textMuted}`}>{Math.round(pct)}%</span>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
