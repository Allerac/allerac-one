'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

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
  movingDuration?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
  elevationGain?: number;
  elevationLoss?: number;
  activeSets?: number;
  totalExerciseReps?: number;
  summarizedExerciseSets?: ExerciseSet[];
}

interface RecentActivityProps {
  isDarkMode: boolean;
  selectedDate?: string;
}

export default function RecentActivity({ isDarkMode, selectedDate }: RecentActivityProps) {
  const t = useTranslations();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActivity();
  }, [selectedDate]);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      const dateParam = selectedDate ? `&date=${selectedDate}` : '';
      console.log('[RecentActivity] Fetching activities...', { selectedDate });
      const response = await fetch(`/api/health/activities?limit=1${dateParam}`);
      console.log('[RecentActivity] Response status:', response.status);
      if (!response.ok) {
        const text = await response.text();
        console.log('[RecentActivity] Error response:', text.slice(0, 200));
        throw new Error(`Failed to fetch activity (${response.status})`);
      }
      const data = await response.json();
      console.log('[RecentActivity] Data received:', data);
      const activities = data.activities || [];
      setActivity(activities[0] || null);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.log('[RecentActivity] Error:', message);
      setError(message);
      setActivity(null);
    } finally {
      setLoading(false);
    }
  };

  const fmtDuration = (seconds?: number) => {
    if (!seconds || seconds <= 0) return '—';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const fmtDistance = (meters?: number) => {
    if (!meters) return '—';
    const km = meters / 1000;
    return km.toFixed(2) + ' km';
  };

  const fmtDate = (seconds?: number) => {
    if (!seconds) return '—';
    const date = new Date(seconds * 1000);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const bgColor = isDarkMode ? 'bg-gray-900' : 'bg-gray-50';
  const textColor = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const secondaryText = isDarkMode ? 'text-gray-400' : 'text-gray-600';
  const borderColor = isDarkMode ? 'border-gray-700' : 'border-gray-200';

  if (loading) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${secondaryText} text-sm`}>Loading activity...</div>
      </div>
    );
  }

  if (error || !activity) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className="flex items-center justify-between">
          <div className={`${secondaryText} text-sm`}>
            {error ? `Error: ${error}` : 'No recent activities found'}
          </div>
          {error && (
            <button
              onClick={fetchActivity}
              className={`px-2 py-1 rounded text-xs font-medium transition ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
            >
              Retry
            </button>
          )}
        </div>
      </div>
    );
  }

  const isStrengthTraining = activity.activityType === 'strength_training';

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className={`${textColor} font-semibold text-base`}>
            {activity.activityName || 'Activity'}
          </h3>
          <p className={`${secondaryText} text-sm mt-1`}>
            {activity.activityType || 'Unknown Type'} · {fmtDate(activity.startTimeInSeconds)}
          </p>
        </div>
        <button
          onClick={fetchActivity}
          className={`px-2 py-1 rounded text-xs font-medium transition ${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-gray-200 hover:bg-gray-300 text-gray-900'}`}
        >
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        {activity.duration != null && activity.duration > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>⏱️</span> Duration
            </p>
            <p className={`${textColor} font-semibold`}>{fmtDuration(activity.duration)}</p>
          </div>
        )}
        {activity.calories != null && activity.calories > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>🔥</span> Calories
            </p>
            <p className={`${textColor} font-semibold`}>{activity.calories.toFixed(0)}</p>
          </div>
        )}
        {activity.distance != null && activity.distance > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>📍</span> Distance
            </p>
            <p className={`${textColor} font-semibold`}>{fmtDistance(activity.distance)}</p>
          </div>
        )}
        {activity.avgHeartRate != null && activity.avgHeartRate > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>❤️</span> Avg HR
            </p>
            <p className={`${textColor} font-semibold`}>{activity.avgHeartRate} bpm</p>
          </div>
        )}
        {activity.maxHeartRate != null && activity.maxHeartRate > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>💓</span> Max HR
            </p>
            <p className={`${textColor} font-semibold`}>{activity.maxHeartRate} bpm</p>
          </div>
        )}
        {activity.elevationGain != null && activity.elevationGain > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>⬆️</span> Elevation Gain
            </p>
            <p className={`${textColor} font-semibold`}>{activity.elevationGain}m</p>
          </div>
        )}
        {activity.elevationLoss != null && activity.elevationLoss > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>⬇️</span> Elevation Loss
            </p>
            <p className={`${textColor} font-semibold`}>{activity.elevationLoss}m</p>
          </div>
        )}
        {isStrengthTraining && activity.activeSets != null && activity.activeSets > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>💪</span> Sets
            </p>
            <p className={`${textColor} font-semibold`}>{activity.activeSets}</p>
          </div>
        )}
        {isStrengthTraining && activity.totalExerciseReps != null && activity.totalExerciseReps > 0 && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1 flex items-center gap-1`}>
              <span>🔄</span> Total Reps
            </p>
            <p className={`${textColor} font-semibold`}>{activity.totalExerciseReps}</p>
          </div>
        )}
      </div>

      {isStrengthTraining && activity.summarizedExerciseSets && activity.summarizedExerciseSets.length > 0 && (
        <div className={`border-t ${borderColor} pt-3`}>
          <p className={`${secondaryText} text-xs font-medium mb-2`}>Exercises</p>
          <div className="space-y-2">
            {activity.summarizedExerciseSets.map((exercise, idx) => (
              <div key={idx} className="flex justify-between items-start text-sm">
                <div>
                  <p className={`${textColor} font-medium`}>
                    {exercise.category}
                    {exercise.subCategory && ` (${exercise.subCategory})`}
                  </p>
                </div>
                <div className={`${secondaryText} text-xs text-right`}>
                  {exercise.reps && <p>{exercise.reps} reps</p>}
                  {exercise.sets && <p>{exercise.sets} sets</p>}
                  {exercise.duration && <p>{(exercise.duration / 1000 / 60).toFixed(1)}m</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
