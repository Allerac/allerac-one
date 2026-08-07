'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import ActivityCharts, { SeriesPoint, formatPace } from './ActivityCharts';
import ActivityLapsPanel, { Lap } from './ActivityLapsPanel';
import ActivityZonesPanel, { Zone } from './ActivityZonesPanel';
import ActivityDynamicsPanel from './ActivityDynamicsPanel';
import type { RoutePoint, RouteBounds } from './ActivityRouteMap';

// Leaflet needs `window` — load client-only, matching the exact pattern
// src/app/space/SpaceClient.tsx uses for another window-dependent visual
// component (a 3D canvas).
const ActivityRouteMap = dynamic(() => import('./ActivityRouteMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[280px] flex items-center justify-center text-sm text-gray-400">
      Loading map…
    </div>
  ),
});

type DetailSyncStatus = 'pending' | 'syncing' | 'complete' | 'partial' | 'failed';

export interface ActivityRow {
  activity_id: string;
  activity_name: string | null;
  activity_type: string | null;
  date: string;
  start_time_seconds: number | null;
  duration_seconds: number | null;
  calories: number | null;
  distance_meters: number | null;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  elevation_gain: number | null;
  average_pace_seconds_per_km: number | null;
  average_power_watts: number | null;
  average_cadence_spm: number | null;
  average_stride_length_meters: number | null;
  average_vertical_oscillation_cm: number | null;
  average_vertical_ratio_percent: number | null;
  average_ground_contact_time_ms: number | null;
  estimated_sweat_loss_ml: number | null;
  beginning_stamina_percent: number | null;
  ending_stamina_percent: number | null;
  training_effect_aerobic: number | null;
  training_effect_anaerobic: number | null;
  training_benefit: string | null;
  exercise_load: number | null;
  vo2_max: number | null;
  detail_sync_status: DetailSyncStatus;
  [key: string]: unknown;
}

interface RouteData {
  coordinates: RoutePoint[];
  bounds: RouteBounds | null;
  redacted: boolean;
}

// What gets handed up to the chat's context (see HealthClient.tsx's
// buildActivityContext) — deliberately excludes `route`/`series`. Per
// docs/roadmap/health-detailed-activities.md's "Assistant access"/"Privacy
// and security" sections: exact GPS coordinates must never reach chat
// context, logs, or analytics.
export interface ActivityDetailData {
  activity: ActivityRow;
  laps: Lap[];
  zones: Zone[];
}

const ACTIVITY_ICONS: Record<string, string> = {
  strength_training: '🏋️',
  running: '🏃',
  cycling: '🚴',
  swimming: '🏊',
  walking: '🚶',
  yoga: '🧘',
  cardio: '💓',
  hiking: '🥾',
  elliptical: '⚙️',
};

function formatName(raw: string): string {
  return raw.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function activityIcon(type?: string | null): string {
  return ACTIVITY_ICONS[type?.toLowerCase() ?? ''] ?? '⚡';
}

function fmtDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtDate(seconds: number | null): string {
  if (!seconds) return '';
  return new Date(seconds * 1000).toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

async function fetchJson(url: string): Promise<{ ok: boolean; status: number; data: any }> {
  const res = await fetch(url);
  if (!res.ok) return { ok: false, status: res.status, data: null };
  const body = await res.json();
  return { ok: true, status: res.status, data: body.data };
}

interface Props {
  activityId: string;
  isDarkMode: boolean;
  // Fires whenever the loaded activity/laps/zones change (including a
  // clearing `null` on error/not-found) — lets an embedding page (the /health
  // dashboard) feed exactly this data into the AI chat's context, so the
  // assistant sees the same activity the user is looking at.
  onDataChange?: (data: ActivityDetailData | null) => void;
}

// The full activity-detail content (header, map, charts, dynamics, laps,
// zones) — shared between the standalone /health/activities/[id] page
// (ActivityDetailClient.tsx) and the inline dashboard view (RecentActivity.tsx),
// so "today's activity" on /health shows exactly the same information as the
// dedicated detail page, not a stripped-down summary.
export default function ActivityDetailPanel({ activityId, isDarkMode: d, onDataChange }: Props) {
  const t = useTranslations('health');

  const [activity, setActivity] = useState<ActivityRow | null>(null);
  const [laps, setLaps] = useState<Lap[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [route, setRoute] = useState<RouteData | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [hoveredSampleIndex, setHoveredSampleIndex] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const activityRes = await fetchJson(`/api/v1/health/activities/${activityId}`);
      if (activityRes.status === 404) {
        setNotFound(true);
        return;
      }
      if (!activityRes.ok) throw new Error(`${activityRes.status}`);
      const row: ActivityRow = activityRes.data.activity;
      setActivity(row);

      const [lapsRes, zonesRes] = await Promise.all([
        fetchJson(`/api/v1/health/activities/${activityId}/laps`),
        fetchJson(`/api/v1/health/activities/${activityId}/zones`),
      ]);
      setLaps(lapsRes.ok ? (lapsRes.data.laps ?? []) : []);
      setZones(zonesRes.ok ? (zonesRes.data.zones ?? []) : []);

      if (row.detail_sync_status === 'complete' || row.detail_sync_status === 'partial') {
        const [routeRes, seriesRes] = await Promise.all([
          fetchJson(`/api/v1/health/activities/${activityId}/route?detail=true`),
          fetchJson(`/api/v1/health/activities/${activityId}/series`),
        ]);
        setRoute(
          routeRes.ok
            ? { coordinates: routeRes.data.coordinates ?? [], bounds: routeRes.data.bounds ?? null, redacted: routeRes.data.redacted }
            : null,
        );
        setSeries(seriesRes.ok ? (seriesRes.data.points ?? []) : []);
      } else {
        setRoute(null);
        setSeries([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'error');
    } finally {
      setLoading(false);
    }
  }, [activityId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    onDataChange?.(activity ? { activity, laps, zones } : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, laps, zones]);

  // True unmount (parent stops rendering this panel, e.g. RecentActivity
  // falls back to "no activity for this day") — clear the parent's context
  // rather than leaving a stale activity behind for the chat to see.
  useEffect(() => () => onDataChange?.(null), []);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await fetch(`/api/v1/health/activities/${activityId}/sync`, { method: 'POST' });
      // Detail sync runs asynchronously in the background (src/agent-worker.ts)
      // — reload once after a short delay rather than assuming it's instant.
      setTimeout(load, 4000);
    } finally {
      setSyncing(false);
    }
  };

  // Not every sample has a GPS fix — a non-empty coordinates array can still
  // have nothing plottable (see ActivityRouteMap.tsx), so this must check
  // for at least one actual lat/lng, not just array length.
  const hasValidRoute = route?.coordinates.some((c) => c.latitude != null && c.longitude != null) ?? false;

  const cardCls = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const textMain = d ? 'text-gray-100' : 'text-gray-900';
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const buttonCls = `text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50 ${
    d ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
  }`;

  if (loading) {
    return (
      <div className={cardCls}>
        <p className={`text-sm ${textMuted}`}>{t('loadingActivity')}</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className={cardCls}>
        <p className={`text-sm ${textMuted}`}>{t('activityNotFound')}</p>
      </div>
    );
  }

  if (error && !activity) {
    return (
      <div className={`${cardCls} flex items-center justify-between`}>
        <p className={`text-sm ${textMuted}`}>{t('errorLoadingActivity')}: {error}</p>
        <button onClick={load} className={buttonCls}>{t('retry')}</button>
      </div>
    );
  }

  if (!activity) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className={cardCls}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl flex-shrink-0">{activityIcon(activity.activity_type)}</span>
            <div className="min-w-0">
              <h1 className={`font-semibold text-lg leading-tight ${textMain}`}>
                {activity.activity_name ? formatName(activity.activity_name) : formatName(activity.activity_type ?? 'Activity')}
              </h1>
              <p className={`text-xs mt-0.5 ${textMuted}`}>
                {formatName(activity.activity_type ?? '')} · {fmtDate(activity.start_time_seconds)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button onClick={handleSync} disabled={syncing} className={buttonCls}>
              {syncing ? t('syncing') : t('syncDetails')}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-x-6 gap-y-3 mt-4">
          {[
            { icon: '⏱️', label: t('duration'), value: fmtDuration(activity.duration_seconds) },
            { icon: '📍', label: t('distance'), value: activity.distance_meters ? `${(activity.distance_meters / 1000).toFixed(2)} km` : null },
            { icon: '🔥', label: t('calories'), value: activity.calories ? `${Math.round(activity.calories)} kcal` : null },
            { icon: '❤️', label: t('avgHr'), value: activity.avg_heart_rate ? `${Math.round(activity.avg_heart_rate)} bpm` : null },
            { icon: '💓', label: t('maxHr'), value: activity.max_heart_rate ? `${Math.round(activity.max_heart_rate)} bpm` : null },
            { icon: '🏃', label: t('pace'), value: activity.average_pace_seconds_per_km ? formatPace(activity.average_pace_seconds_per_km) : null },
            { icon: '⚡', label: t('power'), value: activity.average_power_watts ? `${Math.round(activity.average_power_watts)} W` : null },
            { icon: '⬆️', label: t('elevation'), value: activity.elevation_gain ? `${Math.round(activity.elevation_gain)} m` : null },
          ].filter((s) => s.value != null).map(({ icon, label, value }) => (
            <div key={label}>
              <p className={`text-sm font-bold leading-tight ${textMain}`}>{value}</p>
              <p className={`text-xs ${textMuted}`}>{icon} {label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Degraded-state banner */}
      {activity.detail_sync_status !== 'complete' && (
        <div className={`${cardCls} flex items-center justify-between`}>
          <p className={`text-sm ${textMuted}`}>
            {activity.detail_sync_status === 'failed'
              ? t('detailSyncFailed')
              : activity.detail_sync_status === 'partial'
                ? t('detailSyncPartial')
                : t('detailSyncPending')}
          </p>
          <button onClick={handleSync} disabled={syncing} className={buttonCls}>
            {syncing ? t('syncing') : t('syncDetails')}
          </button>
        </div>
      )}

      {/* Map + charts */}
      {(hasValidRoute || series.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {route && hasValidRoute && (
            <div className={`${cardCls} p-0 overflow-hidden`}>
              <div className="h-72 lg:h-full min-h-[280px]">
                <ActivityRouteMap coordinates={route.coordinates} bounds={route.bounds} hoveredSampleIndex={hoveredSampleIndex} />
              </div>
              {route.redacted && (
                <p className={`text-xs px-3 py-2 border-t ${d ? 'border-gray-700 text-gray-500' : 'border-gray-200 text-gray-400'}`}>
                  {t('routeRedacted')}
                </p>
              )}
            </div>
          )}
          {series.length > 0 && (
            <div className={cardCls}>
              <ActivityCharts series={series} isDarkMode={d} onHoverSampleIndexChange={setHoveredSampleIndex} />
            </div>
          )}
        </div>
      )}

      <ActivityDynamicsPanel activity={activity} isDarkMode={d} />
      <ActivityLapsPanel laps={laps} isDarkMode={d} />
      <ActivityZonesPanel zones={zones} isDarkMode={d} />
    </div>
  );
}
