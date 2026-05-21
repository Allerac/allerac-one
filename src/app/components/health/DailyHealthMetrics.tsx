'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface DailyMetrics {
  steps?: number;
  calories?: number;
  distance_meters?: number;
  active_minutes?: number;
  floors_climbed?: number;
  resting_hr?: number;
  avg_hr?: number;
  max_hr?: number;
  sleep_duration_minutes?: number;
  sleep_deep_minutes?: number;
  sleep_light_minutes?: number;
  sleep_rem_minutes?: number;
  sleep_awake_minutes?: number;
  sleep_score?: number;
  body_battery_max?: number;
  body_battery_min?: number;
  body_battery_end?: number;
  body_battery_charged?: number;
  body_battery_drained?: number;
  stress_avg?: number;
  stress_max?: number;
  stress_rest_duration_minutes?: number;
  hrv_weekly_avg?: number;
  hrv_last_night?: number;
  hrv_status?: string;
}

interface DailyHealthMetricsProps {
  isDarkMode: boolean;
  selectedDate?: string;
}

export default function DailyHealthMetrics({ isDarkMode, selectedDate }: DailyHealthMetricsProps) {
  const t = useTranslations('health');
  const [metrics, setMetrics] = useState<DailyMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedDate) {
      setMetrics(null);
      setLoading(false);
      return;
    }
    fetchMetrics();
  }, [selectedDate]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/health/daily?date=${selectedDate}`);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch metrics (${response.status}): ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      setMetrics(data);
    } catch {
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const textColor = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const secondaryText = isDarkMode ? 'text-gray-400' : 'text-gray-600';

  const items = [
    { label: t('calories'),  value: metrics?.calories != null ? metrics.calories.toFixed(0) : null,                      unit: 'kcal',    icon: '🔥' },
    { label: t('battery'),   value: metrics?.body_battery_end != null ? String(metrics.body_battery_end) : null,          unit: '%',       icon: '🔋' },
    { label: t('activeMin'), value: metrics?.active_minutes != null ? String(metrics.active_minutes) : null,              unit: 'min',     icon: '💪' },
    { label: t('stress'),    value: metrics?.stress_avg != null ? String(metrics.stress_avg) : null,                      unit: '/100',    icon: '🧠' },
    { label: t('floors'),    value: metrics?.floors_climbed != null ? String(Math.round(metrics.floors_climbed)) : null,  unit: undefined, icon: '🏢' },
  ];

  return (
    <div className="flex flex-col gap-2 h-full">
      {items.map(({ label, value, unit, icon }) => (
        <div
          key={label}
          className={`flex-1 flex items-center gap-2.5 px-3 py-3 lg:py-0 rounded-lg border transition-colors ${
            isDarkMode
              ? 'border-gray-700 bg-gray-800/40 hover:bg-gray-800/70'
              : 'border-gray-200 bg-white hover:bg-gray-50'
          }`}
        >
          <span className="text-2xl flex-shrink-0">{icon}</span>
          <p className={`text-xl font-bold leading-none ${value != null ? textColor : secondaryText}`}>
            {value ?? '—'}
            {value != null && unit && <span className={`text-sm font-normal ml-1 ${secondaryText}`}>{unit}</span>}
            <span className={`text-sm font-normal ml-2 ${secondaryText}`}>{label}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
