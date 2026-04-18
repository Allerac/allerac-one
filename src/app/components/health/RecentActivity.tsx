'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

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
}

interface RecentActivityProps {
  isDarkMode: boolean;
}

export default function RecentActivity({ isDarkMode }: RecentActivityProps) {
  const t = useTranslations();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActivity();
  }, []);

  const fetchActivity = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/health/activities?limit=1');
      if (!response.ok) throw new Error('Failed to fetch activity');
      const data = await response.json();
      const activities = data.activities || [];
      setActivity(activities[0] || null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setActivity(null);
    } finally {
      setLoading(false);
    }
  };

  const fmtDuration = (ms?: number) => {
    if (!ms) return '—';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
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
        <div className={`${secondaryText} text-sm`}>
          {error ? `Error: ${error}` : 'No recent activities'}
        </div>
      </div>
    );
  }

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg p-4 space-y-3`}>
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

      <div className="grid grid-cols-2 gap-3 text-sm">
        {activity.duration && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1`}>Duration</p>
            <p className={`${textColor} font-semibold`}>{fmtDuration(activity.duration)}</p>
          </div>
        )}
        {activity.calories && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1`}>Calories</p>
            <p className={`${textColor} font-semibold`}>{activity.calories.toFixed(0)}</p>
          </div>
        )}
        {activity.distance && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1`}>Distance</p>
            <p className={`${textColor} font-semibold`}>{fmtDistance(activity.distance)}</p>
          </div>
        )}
        {activity.avgHeartRate && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1`}>Avg HR</p>
            <p className={`${textColor} font-semibold`}>{activity.avgHeartRate} bpm</p>
          </div>
        )}
        {activity.elevationGain && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1`}>Elevation</p>
            <p className={`${textColor} font-semibold`}>{activity.elevationGain}m</p>
          </div>
        )}
        {activity.maxHeartRate && (
          <div>
            <p className={`${secondaryText} text-xs font-medium mb-1`}>Max HR</p>
            <p className={`${textColor} font-semibold`}>{activity.maxHeartRate} bpm</p>
          </div>
        )}
      </div>
    </div>
  );
}
