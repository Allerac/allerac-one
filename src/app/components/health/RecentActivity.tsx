'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import ActivityDetailPanel, { ActivityDetailData } from './ActivityDetailPanel';

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
  activityType?: string;
  activeSets?: number;
  totalExerciseReps?: number;
  summarizedExerciseSets?: ExerciseSet[];
}

// What RecentActivity reports up to the page for the chat's context —
// ActivityDetailPanel's data plus the strength-training exercise breakdown,
// which lives only on the basic activity fetch (not the normalized
// health_activities row ActivityDetailPanel reads).
export interface ActivityChatContext extends ActivityDetailData {
  exercises?: ExerciseSet[];
}

interface Props {
  isDarkMode: boolean;
  selectedDate?: string;
  onActivityContextChange?: (ctx: ActivityChatContext | null) => void;
}

function formatName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

export default function RecentActivity({ isDarkMode, selectedDate, onActivityContextChange }: Props) {
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Guards against out-of-order responses: a native <input type="date">
  // fires onChange once per segment while typing (day, then month, then
  // year), so an earlier, now-irrelevant request (e.g. for a date with no
  // cached activity, forcing a live Garmin fetch that can fail or take
  // longer) can resolve AFTER the final date's request and clobber good
  // data with an error/empty state. Only the latest-fired request's result
  // is ever applied.
  const latestRequestId = useRef(0);

  const fetchActivity = useCallback(async () => {
    const requestId = ++latestRequestId.current;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/health/activities?limit=1${selectedDate ? `&date=${selectedDate}` : ''}`);
      if (latestRequestId.current !== requestId) return;
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (latestRequestId.current !== requestId) return;
      setActivity((data.activities || [])[0] ?? null);
    } catch (err) {
      if (latestRequestId.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'error');
      setActivity(null);
    } finally {
      if (latestRequestId.current === requestId) setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const isStrength = activity?.activityType === 'strength_training';
  const exercises = activity?.summarizedExerciseSets ?? [];

  const handleDetailData = useCallback((data: ActivityDetailData | null) => {
    if (!data) { onActivityContextChange?.(null); return; }
    onActivityContextChange?.({ ...data, exercises: isStrength && exercises.length > 0 ? exercises : undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onActivityContextChange, isStrength, exercises]);

  // No activity for this day (or not loaded yet, or without an id to look
  // up detail for) — ActivityDetailPanel won't be mounted, so nothing else
  // will clear the chat context.
  useEffect(() => {
    if (!activity?.activityId) onActivityContextChange?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, onActivityContextChange]);

  const d = isDarkMode;
  const cardCls   = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const textMain  = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';

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

  return (
    <div className="flex flex-col gap-4">
      {activity.activityId ? (
        <ActivityDetailPanel activityId={activity.activityId} isDarkMode={d} onDataChange={handleDetailData} />
      ) : (
        <div className={cardCls}>
          <p className={`text-sm ${textMuted}`}>{formatName(activity.activityType ?? 'Activity')}</p>
        </div>
      )}

      {/* Exercises — strength-training sets/reps breakdown, not part of the
          detail panel (that data only exists on the live/cached basic
          activity fetch, not the normalized health_activities row). */}
      {isStrength && exercises.length > 0 && (
        <div className={cardCls}>
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
