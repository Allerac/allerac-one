'use client';

import { useTranslations } from 'next-intl';
import { formatPace } from './ActivityCharts';

export interface Lap {
  lap_index: number;
  duration_seconds: number | null;
  distance_meters: number | null;
  pace_seconds_per_km: number | null;
  average_heart_rate: number | null;
  average_power_watts: number | null;
  average_cadence_spm: number | null;
  ascent_meters: number | null;
  descent_meters: number | null;
}

interface Props {
  laps: Lap[];
  isDarkMode: boolean;
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ActivityLapsPanel({ laps, isDarkMode }: Props) {
  const t = useTranslations('health');
  const d = isDarkMode;
  const cardCls = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const textMain = d ? 'text-gray-100' : 'text-gray-900';
  const rowHover = d ? 'hover:bg-gray-700/40' : 'hover:bg-gray-100';

  if (laps.length === 0) return null;

  return (
    <div className={cardCls}>
      <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${textMuted}`}>{t('laps')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className={`text-xs ${textMuted}`}>
              <th className="text-left pb-2 pr-3 font-medium">#</th>
              <th className="text-right pb-2 px-2 font-medium">{t('duration')}</th>
              <th className="text-right pb-2 px-2 font-medium">{t('distance')}</th>
              <th className="text-right pb-2 px-2 font-medium">{t('pace')}</th>
              <th className="text-right pb-2 px-2 font-medium">❤️</th>
              <th className="text-right pb-2 pl-2 font-medium">⬆️</th>
            </tr>
          </thead>
          <tbody>
            {laps.map((lap) => (
              <tr key={lap.lap_index} className={`border-t ${d ? 'border-gray-700' : 'border-gray-200'} ${rowHover} transition-colors`}>
                <td className={`py-1.5 pr-3 font-medium ${textMain}`}>{lap.lap_index}</td>
                <td className={`py-1.5 px-2 text-right ${textMain}`}>{fmtDuration(lap.duration_seconds)}</td>
                <td className={`py-1.5 px-2 text-right ${textMain}`}>
                  {lap.distance_meters ? `${(lap.distance_meters / 1000).toFixed(2)}km` : '—'}
                </td>
                <td className={`py-1.5 px-2 text-right ${textMain}`}>
                  {lap.pace_seconds_per_km ? formatPace(lap.pace_seconds_per_km) : '—'}
                </td>
                <td className={`py-1.5 px-2 text-right ${textMain}`}>
                  {lap.average_heart_rate ? Math.round(lap.average_heart_rate) : '—'}
                </td>
                <td className={`py-1.5 pl-2 text-right ${textMain}`}>
                  {lap.ascent_meters ? `${Math.round(lap.ascent_meters)}m` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
