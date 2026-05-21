'use client';

import { useState, useEffect } from 'react';

interface ExerciseSet {
  category: string;
  subCategory?: string;
  reps?: number;
  sets?: number;
  duration?: number;
  maxWeight?: number;
  volume?: number;
}

interface Activity {
  activityId?: string;
  activityName?: string;
  activityType?: string;
  startTimeInSeconds?: number;
  duration?: number;
  calories?: number;
  distance?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationGain?: number;
  activeSets?: number;
  totalExerciseReps?: number;
  summarizedExerciseSets?: ExerciseSet[];
}

interface Props {
  isDarkMode: boolean;
  selectedDate?: string;
}

const ACTIVITY_ICONS: Record<string, string> = {
  strength_training: '🏋️',
  running:           '🏃',
  cycling:           '🚴',
  swimming:          '🏊',
  walking:           '🚶',
  yoga:              '🧘',
  cardio:            '💓',
  hiking:            '🥾',
  elliptical:        '⚙️',
};

function formatName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function activityIcon(type?: string): string {
  return ACTIVITY_ICONS[type?.toLowerCase() ?? ''] ?? '⚡';
}

function fmtDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(seconds?: number): string {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function RecentActivity({ isDarkMode, selectedDate }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => { fetchActivity(); }, [selectedDate]);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/health/activities?limit=1${selectedDate ? `&date=${selectedDate}` : ''}`);
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      setActivity((data.activities || [])[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
      setActivity(null);
    } finally {
      setLoading(false);
    }
  };

  const d = isDarkMode;
  const cardCls   = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const textMain  = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const divider   = d ? 'border-gray-700' : 'border-gray-200';

  if (loading) return (
    <div className={`${cardCls}`}>
      <p className={`text-sm ${textMuted}`}>Loading activity…</p>
    </div>
  );

  if (!activity) return (
    <div className={`${cardCls} flex items-center justify-between`}>
      <p className={`text-sm ${textMuted}`}>{error ? `Error: ${error}` : 'No recent activities found'}</p>
      {error && (
        <button onClick={fetchActivity} className={`text-xs px-2 py-1 rounded ${d ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}>
          Retry
        </button>
      )}
    </div>
  );

  const isStrength = activity.activityType === 'strength_training';
  const name = activity.activityName ? formatName(activity.activityName) : formatName(activity.activityType ?? 'Activity');

  const stats = [
    { icon: '⏱️', label: 'Duration',  value: fmtDuration(activity.duration) },
    { icon: '🔥', label: 'Calories',  value: activity.calories ? `${Math.round(activity.calories)} kcal` : null },
    { icon: '📍', label: 'Distance',  value: activity.distance ? `${(activity.distance / 1000).toFixed(2)} km` : null },
    { icon: '❤️', label: 'Avg HR',    value: activity.avgHeartRate ? `${activity.avgHeartRate} bpm` : null },
    { icon: '💓', label: 'Max HR',    value: activity.maxHeartRate ? `${activity.maxHeartRate} bpm` : null },
    { icon: '⬆️', label: 'Elevation', value: activity.elevationGain ? `${Math.round(activity.elevationGain)} m` : null },
    { icon: '💪', label: 'Sets',      value: isStrength && activity.activeSets ? String(activity.activeSets) : null },
    { icon: '🔄', label: 'Reps',      value: isStrength && activity.totalExerciseReps ? String(activity.totalExerciseReps) : null },
  ].filter(s => s.value != null) as { icon: string; label: string; value: string }[];

  const exercises = activity.summarizedExerciseSets ?? [];

  return (
    <div className={cardCls}>

      {/* Header: title left, stats right */}
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-3xl flex-shrink-0">{activityIcon(activity.activityType)}</span>
          <div className="min-w-0">
            <h3 className={`font-semibold text-base leading-tight ${textMain}`}>{name}</h3>
            <p className={`text-xs mt-0.5 ${textMuted}`}>
              {formatName(activity.activityType ?? '')} · {fmtDate(activity.startTimeInSeconds)}
            </p>
          </div>
        </div>

        {/* Stats — compact, top right */}
        <div className="flex flex-wrap justify-end gap-x-4 gap-y-1 flex-shrink-0">
          {stats.map(({ icon, label, value }) => (
            <div key={label} className="text-right">
              <p className={`text-sm font-bold leading-tight ${textMain}`}>{value}</p>
              <p className={`text-xs ${textMuted}`}>{icon} {label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Exercises */}
      {isStrength && exercises.length > 0 && (
        <div className={`border-t ${divider} mt-4 pt-3`}>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${textMuted}`}>Exercises</p>
          <table className="w-full border-collapse">
            <tbody>
              {exercises.map((ex, i) => {
                const rawName = ex.category?.toUpperCase() === 'UNKNOWN' ? 'Unknown Exercise' : formatName(ex.category);
                const exName = rawName + (ex.subCategory && ex.subCategory.toUpperCase() !== ex.category.toUpperCase() ? ` · ${formatName(ex.subCategory)}` : '');
                const detail = [
                  ex.sets      ? `${ex.sets} ${ex.sets === 1 ? 'set' : 'sets'}`     : null,
                  ex.reps      ? `${ex.reps} ${ex.reps === 1 ? 'rep' : 'reps'}`     : null,
                  ex.maxWeight ? `${ex.maxWeight} kg`                                : null,
                  ex.duration  ? `${(ex.duration / 1000 / 60).toFixed(1)} min`      : null,
                ].filter(Boolean).join(' · ');
                return (
                  <tr key={i} className={`rounded-md ${d ? 'hover:bg-gray-700/40' : 'hover:bg-gray-100'} transition-colors`}>
                    <td className={`py-1.5 pl-2 text-sm font-medium align-top ${textMain}`}>{exName}</td>
                    <td className={`py-1.5 pr-2 text-xs text-right whitespace-nowrap align-top ${textMuted}`}>{detail}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
