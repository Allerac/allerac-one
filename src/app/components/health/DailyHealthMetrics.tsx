'use client';

import { useState, useEffect } from 'react';

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
  const [metrics, setMetrics] = useState<DailyMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const bgColor = isDarkMode ? 'bg-gray-900' : 'bg-gray-50';
  const textColor = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const secondaryText = isDarkMode ? 'text-gray-400' : 'text-gray-600';
  const borderColor = isDarkMode ? 'border-gray-700' : 'border-gray-200';

  if (loading) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${secondaryText} text-sm`}>Loading metrics...</div>
      </div>
    );
  }

  if (error && !metrics) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${secondaryText} text-sm`}>No data available for this date</div>
      </div>
    );
  }

  if (!metrics || Object.keys(metrics).length === 0) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${secondaryText} text-sm`}>No health data for this date</div>
      </div>
    );
  }

  const formatMins = (mins: number | null | undefined) => {
    if (mins == null) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const MetricItem = ({ label, value, unit, icon }: { label: string; value: any; unit?: string; icon: string }) => {
    if (value == null) return null;
    return (
      <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-opacity-50 hover:bg-opacity-100 transition">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className={`text-sm font-medium ${secondaryText}`}>{label}</span>
        </div>
        <span className={`font-semibold ${textColor}`}>
          {value}
          {unit && <span className={`text-xs ml-1 ${secondaryText}`}>{unit}</span>}
        </span>
      </div>
    );
  };

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 space-y-3`}>
      <h3 className={`font-semibold text-sm uppercase tracking-wide ${secondaryText}`}>Daily Metrics</h3>

      <div className="grid grid-cols-2 gap-2">
        <MetricItem label="Steps" value={metrics.steps?.toLocaleString()} icon="👟" />
        <MetricItem label="Distance" value={metrics.distance_meters ? `${(metrics.distance_meters / 1000).toFixed(2)} km` : undefined} icon="📍" />
        <MetricItem label="Calories" value={metrics.calories?.toFixed(0)} icon="🔥" />
        <MetricItem label="Active Min" value={metrics.active_minutes} unit="min" icon="💪" />
        <MetricItem label="Floors" value={metrics.floors_climbed ? Math.round(metrics.floors_climbed) : undefined} icon="🏢" />
        <MetricItem label="Resting HR" value={metrics.resting_hr} unit="bpm" icon="❤️" />
        <MetricItem label="Avg HR" value={metrics.avg_hr} unit="bpm" icon="💓" />
        <MetricItem label="Max HR" value={metrics.max_hr} unit="bpm" icon="🏃" />
        <MetricItem label="Sleep" value={formatMins(metrics.sleep_duration_minutes)} icon="😴" />
        <MetricItem label="Sleep Score" value={metrics.sleep_score} icon="⭐" />
        <MetricItem label="Battery End" value={metrics.body_battery_end} icon="⚡" />
        <MetricItem label="Stress Avg" value={metrics.stress_avg?.toFixed(0)} icon="😰" />
        <MetricItem label="HRV" value={metrics.hrv_last_night?.toFixed(0)} icon="📈" />
        <MetricItem label="HRV Status" value={metrics.hrv_status} icon="🫀" />
      </div>
    </div>
  );
}
