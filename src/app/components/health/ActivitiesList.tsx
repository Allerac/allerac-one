'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

interface Activity {
  activityId?: string;
  activityName?: string;
  activityType?: string;
  startTimeInSeconds?: number;
  startTimeLocal?: string;
  duration?: number;
  calories?: number;
  distance?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
}

interface ActivitiesListProps {
  isDarkMode: boolean;
  startDate: string;
  endDate: string;
}

export default function ActivitiesList({ isDarkMode, startDate, endDate }: ActivitiesListProps) {
  const t = useTranslations();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchActivities();
  }, [startDate, endDate]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/health/activities-range?startDate=${startDate}&endDate=${endDate}`);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to fetch activities (${response.status}): ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      setActivities(data.activities || []);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      setActivities([]);
    } finally {
      setLoading(false);
    }
  };

  const bgColor = isDarkMode ? 'bg-gray-900' : 'bg-gray-50';
  const borderColor = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const textColor = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-600';

  if (loading) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${textMuted} text-sm`}>Loading activities...</div>
      </div>
    );
  }

  if (error && activities.length === 0) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${textMuted} text-sm`}>No activities found</div>
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className={`${bgColor} border ${borderColor} rounded-lg p-4`}>
        <div className={`${textMuted} text-sm`}>No activities for this period</div>
      </div>
    );
  }

  return (
    <div className={`${bgColor} border ${borderColor} rounded-lg overflow-hidden`}>
      <div className={`px-4 py-3 border-b ${borderColor}`}>
        <h3 className={`text-xs font-semibold uppercase tracking-wide ${textMuted}`}>Activities</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`text-xs ${textMuted} ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
              <th className="text-left px-4 py-2 font-medium">Activity</th>
              <th className="text-left px-3 py-2 font-medium">Date</th>
              <th className="text-right px-3 py-2 font-medium">⏱️</th>
              <th className="text-right px-3 py-2 font-medium">🔥</th>
              <th className="text-right px-3 py-2 font-medium">📍</th>
              <th className="text-right px-3 py-2 font-medium">❤️</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((activity) => {
              let date = '—';
              if (activity.startTimeLocal) {
                date = new Date(activity.startTimeLocal + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              } else if (activity.startTimeInSeconds) {
                const ms = typeof activity.startTimeInSeconds === 'string'
                  ? parseInt(activity.startTimeInSeconds) * 1000
                  : activity.startTimeInSeconds * 1000;
                date = new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
              }
              if (date === '—') {
                console.log('[ActivitiesList] Missing date:', { startTimeLocal: activity.startTimeLocal, startTimeInSeconds: activity.startTimeInSeconds });
              }
              const duration = activity.duration ? `${Math.floor(activity.duration / 60)}m` : '—';
              const calories = activity.calories ? Math.round(activity.calories) : '—';
              const distance = activity.distance && activity.distance > 0 ? `${(activity.distance / 1000).toFixed(1)}km` : '—';
              const hr = activity.maxHeartRate && activity.maxHeartRate > 0 ? `${activity.maxHeartRate}` : '—';

              return (
                <tr
                  key={activity.activityId}
                  className={`border-t ${borderColor} ${isDarkMode ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'} transition-colors`}
                >
                  <td className={`px-4 py-2.5 text-xs font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {activity.activityName || '—'}
                  </td>
                  <td className={`px-3 py-2.5 text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {date}
                  </td>
                  <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {duration}
                  </td>
                  <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {calories}
                  </td>
                  <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {distance}
                  </td>
                  <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    {hr}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
