'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';

// Phase 4 (docs/roadmap/health-detailed-activities.md): one chart per
// metric (never dual-axis — see the dataviz skill's "one axis" rule),
// stacked and linked via Recharts' syncId so hovering one moves the
// cursor on all of them. Reports the hovered sample_index up to the
// parent so ActivityRouteMap can place a matching marker.

export interface SeriesPoint {
  sample_index: number;
  elapsed_seconds: number | null;
  heart_rate_bpm?: number | null;
  pace_seconds_per_km?: number | null;
  power_watts?: number | null;
  elevation_meters?: number | null;
  // Present whenever the /series fetch didn't explicitly narrow ?metrics= —
  // used only to label the tooltip's x-axis position, not plotted as its
  // own chart.
  distance_meters?: number | string | null;
  [key: string]: unknown;
}

interface MetricSpec {
  key: keyof SeriesPoint;
  label: string;
  color: string;
  unit: string;
  reversed?: boolean;
  formatValue?: (value: number) => string;
}

interface Props {
  series: SeriesPoint[];
  isDarkMode: boolean;
  onHoverSampleIndexChange: (sampleIndex: number | null) => void;
}

export function formatPace(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}/km`;
}

// mm:ss, or h:mm:ss past the first hour — reads far easier on hover than a
// raw "315s" label.
export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

export default function ActivityCharts({ series, isDarkMode, onHoverSampleIndexChange }: Props) {
  const t = useTranslations('health');
  const d = isDarkMode;
  const gridColor = d ? '#374151' : '#e5e7eb';
  const axisColor = d ? '#9ca3af' : '#6b7280';
  const tooltipBg = d ? '#1f2937' : '#ffffff';

  const allMetrics: MetricSpec[] = [
    { key: 'heart_rate_bpm', label: t('heartRate'), color: '#ef4444', unit: 'bpm', formatValue: (v) => `${Math.round(v)} bpm` },
    { key: 'pace_seconds_per_km', label: t('pace'), color: '#3b82f6', unit: '/km', reversed: true, formatValue: formatPace },
    { key: 'power_watts', label: t('power'), color: '#8b5cf6', unit: 'W', formatValue: (v) => `${Math.round(v)} W` },
    { key: 'elevation_meters', label: t('elevation'), color: '#22c55e', unit: 'm', formatValue: (v) => `${v.toFixed(2)} m` },
  ];
  const metrics = allMetrics.filter((m) => series.some((p) => p[m.key] != null));

  if (series.length === 0 || metrics.length === 0) return null;

  // Recharts v3's onMouseMove reports a numeric index into `data` (the
  // `series` array passed below, unmodified), not the payload object
  // directly — index into `series` ourselves to get the true sample_index.
  const handleMove = (state: any) => {
    const index = typeof state?.activeTooltipIndex === 'number' ? state.activeTooltipIndex : undefined;
    onHoverSampleIndexChange(index != null ? series[index]?.sample_index ?? null : null);
  };
  const handleLeave = () => onHoverSampleIndexChange(null);

  return (
    <div className="flex flex-col gap-4">
      {metrics.map((m) => (
        <div key={String(m.key)}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
            {m.label}
          </p>
          <ResponsiveContainer width="100%" height={110}>
            <LineChart data={series} syncId="activity-detail" onMouseMove={handleMove} onMouseLeave={handleLeave}>
              <CartesianGrid stroke={gridColor} vertical={false} />
              <XAxis dataKey="elapsed_seconds" tick={false} axisLine={{ stroke: gridColor }} tickLine={false} />
              <YAxis
                width={44}
                tick={{ fill: axisColor, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                reversed={m.reversed}
                domain={['auto', 'auto']}
              />
              <Tooltip
                formatter={(value) => {
                  const num = typeof value === 'number' ? value : Number(value);
                  return [m.formatValue ? m.formatValue(num) : `${num} ${m.unit}`, m.label];
                }}
                labelFormatter={(elapsed, payload) => {
                  const time = formatElapsed(Number(elapsed));
                  // Postgres NUMERIC comes back from the API as a string —
                  // Number() first, same as everywhere else this bit us.
                  const rawDistance = payload?.[0]?.payload?.distance_meters;
                  const distance = rawDistance != null ? Number(rawDistance) : null;
                  return distance != null && Number.isFinite(distance)
                    ? `${time} · ${(distance / 1000).toFixed(2)} km`
                    : time;
                }}
                contentStyle={{ background: tooltipBg, border: `1px solid ${gridColor}`, fontSize: 12, borderRadius: 6 }}
              />
              <Line type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
