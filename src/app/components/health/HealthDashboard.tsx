'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as healthActions from '@/app/actions/health';
import GarminSettings from '../settings/GarminSettings';
import RecentActivity from './RecentActivity';

interface HealthDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId?: string;
}

type Period = 'today' | '3days' | '7days' | '30days';

const PERIOD_CONFIG: Record<Period, { days: number; summaryPeriod: 'day' | '3days' | 'week' | 'month' }> = {
  today:    { days: 1,  summaryPeriod: 'day' },
  '3days':  { days: 3,  summaryPeriod: '3days' },
  '7days':  { days: 7,  summaryPeriod: 'week' },
  '30days': { days: 30, summaryPeriod: 'month' },
};

interface Summary {
  avg_steps: number | null;
  avg_calories: number | null;
  avg_resting_hr: number | null;
  avg_sleep_hours: number | null;
  total_steps: number | null;
  days_with_data: number | null;
}

interface DayMetric {
  date: string;
  steps: number | null;
  calories: number | null;
  resting_hr: number | null;
  sleep_duration_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_light_minutes: number | null;
  sleep_rem_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_score: number | null;
  body_battery_end: number | null;
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function fmtNavDate(date: string) {
  return new Date(date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtMins(mins: number | null) {
  if (mins == null) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// ─── Spark chart — bars for ≤5 points, line for more ───────────────────────

function SparkChart({
  data,
  color,
  height = 48,
  width = 80,
}: {
  data: (number | null)[];
  color: string;
  height?: number;
  width?: number;
}) {
  if (data.length === 0) return null;

  const values = data.map((v) => v ?? 0);
  const max = Math.max(...values, 1);

  if (values.length <= 5) {
    const barW = Math.max(4, Math.floor((width - (values.length - 1) * 3) / values.length));
    const gap = 3;
    const totalW = values.length * barW + (values.length - 1) * gap;
    return (
      <svg width={totalW} height={height} className="overflow-visible">
        {values.map((v, i) => {
          const h = Math.max(2, (v / max) * height);
          return (
            <rect key={i} x={i * (barW + gap)} y={height - h}
              width={barW} height={h} rx={2}
              className={color} opacity={v === 0 ? 0.2 : 0.85} />
          );
        })}
      </svg>
    );
  }

  // Line chart
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - Math.max(2, (v / max) * (height - 4));
    return `${x},${y}`;
  });
  const areaBottom = values.map((_v, i) => {
    const x = (i / (values.length - 1)) * width;
    return `${x},${height}`;
  });
  const fillPts = [...pts, ...areaBottom.reverse()].join(' ');
  const strokeClass = color.replace('fill-', 'stroke-');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polygon points={fillPts} className={color} opacity={0.15} />
      <polyline points={pts.join(' ')} fill="none"
        className={strokeClass} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - Math.max(2, (v / max) * (height - 4));
        return v > 0
          ? <circle key={i} cx={x} cy={y} r={2} className={color} opacity={0.8} />
          : null;
      })}
    </svg>
  );
}

// ─── Summary card ───────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  unit,
  icon,
  chartData,
  chartColor,
  isDarkMode,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: React.ReactNode;
  chartData: (number | null)[];
  chartColor: string;
  isDarkMode: boolean;
}) {
  const card = isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200';
  const hasChart = chartData.length > 0;
  return (
    <div className={`rounded-xl border p-4 ${card} flex flex-col gap-3`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value}</span>
          {unit && <span className={`text-xs ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{unit}</span>}
        </div>
        {hasChart && (
          <div className="hidden sm:block flex-shrink-0">
            <SparkChart data={chartData} color={chartColor} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function HealthDashboard({ isOpen, onClose, isDarkMode, userId }: HealthDashboardProps) {
  const t = useTranslations('health');

  const [garminConnected, setGarminConnected] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('7days');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<DayMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset to today when switching away from 'today' period and back
  useEffect(() => {
    if (period !== 'today') setSelectedDate(getTodayStr());
  }, [period]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const status = await healthActions.getGarminStatus(userId);
      setGarminConnected(!!status.is_connected);
      setLastSync(status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : null);

      if (status.is_connected) {
        if (period === 'today') {
          // Single day — no summary needed, just fetch the one day's metrics
          const met = await healthActions.getHealthMetrics(userId, selectedDate, selectedDate);
          setMetrics(met);
          setSummary(null);
        } else {
          const { days, summaryPeriod } = PERIOD_CONFIG[period];
          const endDate = getTodayStr();
          const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

          const [sum, met] = await Promise.all([
            healthActions.getHealthSummary(userId, summaryPeriod),
            healthActions.getHealthMetrics(userId, startDate, endDate),
          ]);

          setSummary({
            avg_steps:      sum.avg_steps      ? Number(sum.avg_steps)      : null,
            avg_calories:   sum.avg_calories   ? Number(sum.avg_calories)   : null,
            avg_resting_hr: sum.avg_resting_hr ? Number(sum.avg_resting_hr) : null,
            avg_sleep_hours: sum.avg_sleep_hours ? Number(sum.avg_sleep_hours) : null,
            total_steps:    sum.total_steps    ? Number(sum.total_steps)    : null,
            days_with_data: sum.days_with_data ? Number(sum.days_with_data) : null,
          });
          setMetrics(met);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [userId, period, selectedDate]);

  useEffect(() => {
    if (isOpen && userId) loadData();
  }, [isOpen, loadData]);

  useEffect(() => {
    if (syncMessage) {
      const timer = setTimeout(() => setSyncMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [syncMessage]);

  async function handleSync() {
    if (!userId) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await healthActions.triggerHealthSync(userId, PERIOD_CONFIG[period].days);
      setSyncMessage({ type: 'success', text: t('syncSuccess', { records: result.records }) });
      await loadData();
    } catch (e: any) {
      setSyncMessage({ type: 'error', text: e.message });
    } finally {
      setSyncing(false);
    }
  }

  function goToPrevDay() {
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  }

  function goToNextDay() {
    if (selectedDate >= getTodayStr()) return;
    const d = new Date(selectedDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split('T')[0]);
  }

  if (!isOpen) return null;

  const panel = `fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] flex flex-col shadow-2xl overflow-hidden
    ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`;
  const border = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const isSingleDay = period === 'today';
  const isViewingToday = isSingleDay && selectedDate === getTodayStr();
  const dayMetric = isSingleDay ? (metrics[0] ?? null) : null;

  // Charts only make sense for multi-day periods
  const chartSteps   = isSingleDay ? [] : metrics.map((m) => m.steps);
  const chartHr      = isSingleDay ? [] : metrics.map((m) => m.resting_hr);
  const chartSleep   = isSingleDay ? [] : metrics.map((m) => m.sleep_duration_minutes ? m.sleep_duration_minutes / 60 : null);
  const chartBattery = isSingleDay ? [] : metrics.map((m) => m.body_battery_end);

  // Sleep phases
  const sleepRows = metrics.filter(m => m.sleep_duration_minutes != null);
  const avgPhase = (key: keyof DayMetric) =>
    sleepRows.length ? Math.round(sleepRows.reduce((s, m) => s + ((m[key] as number) ?? 0), 0) / sleepRows.length) : null;
  const sleepPhases = isSingleDay
    ? { deep: dayMetric?.sleep_deep_minutes ?? null, light: dayMetric?.sleep_light_minutes ?? null, rem: dayMetric?.sleep_rem_minutes ?? null, awake: dayMetric?.sleep_awake_minutes ?? null, score: dayMetric?.sleep_score ?? null }
    : { deep: avgPhase('sleep_deep_minutes'), light: avgPhase('sleep_light_minutes'), rem: avgPhase('sleep_rem_minutes'), awake: avgPhase('sleep_awake_minutes'), score: null };

  // Hide sync when viewing a past day — data is already there, user can switch to 7/30d to re-sync a range
  const showSync = garminConnected && (!isSingleDay || isViewingToday);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className={panel}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">❤️</span>
            <div>
              <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('title')}</h2>
              {lastSync && <p className={`text-xs ${textMuted}`}>{t('lastSync')}: {lastSync}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {showSync && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50
                  ${isDarkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
              >
                <svg className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {syncing ? t('syncing') : t('syncNow')}
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100'}`}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Sync message */}
        {syncMessage && (
          <div className={`mx-5 mt-3 px-4 py-2 rounded-lg text-sm flex-shrink-0
            ${syncMessage.type === 'success'
              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
              : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}
          >
            {syncMessage.text}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading && garminConnected === null ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : garminConnected === false ? (
            <div className="p-5">
              <p className={`text-sm mb-4 ${textMuted}`}>{t('connectPrompt')}</p>
              <GarminSettings userId={userId} isDarkMode={isDarkMode} />
            </div>
          ) : (
            <div className="p-5 space-y-4">
              {/* Recent activity card */}
              <RecentActivity isDarkMode={isDarkMode} />

              {/* Period selector */}
              <div className="flex gap-2 flex-wrap">
                {(['today', '3days', '7days', '30days'] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
                      ${period === p
                        ? 'bg-brand-500 text-white'
                        : isDarkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {t(`period.${p}`)}
                  </button>
                ))}
                {loading && (
                  <div className="flex items-center ml-2">
                    <div className={`animate-spin rounded-full h-4 w-4 border-2 border-t-transparent ${isDarkMode ? 'border-gray-500' : 'border-gray-400'}`} />
                  </div>
                )}
              </div>

              {/* Day navigator — only in single-day mode */}
              {isSingleDay && (
                <div className="flex items-center justify-center gap-3">
                  {/* Prev button — circle */}
                  <button
                    onClick={goToPrevDay}
                    className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors
                      ${isDarkMode
                        ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
                        : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>

                  {/* Date card */}
                  <div className={`flex items-center gap-2 px-4 py-1.5 rounded-xl border ${border} ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                    <svg className={`h-3.5 w-3.5 ${textMuted}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className={`text-sm font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      {fmtNavDate(selectedDate)}
                    </span>
                  </div>

                  {/* Next button — circle (invisible when on today) */}
                  <button
                    onClick={goToNextDay}
                    disabled={isViewingToday}
                    className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors
                      ${isViewingToday
                        ? 'opacity-0 pointer-events-none'
                        : isDarkMode
                          ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}

              {/* No data */}
              {!loading && metrics.length === 0 && (
                <div className={`rounded-xl border ${border} p-8 text-center`}>
                  <p className={`text-sm ${textMuted}`}>{t('noData')}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{t('noDataHint')}</p>
                </div>
              )}

              {/* Summary cards */}
              {metrics.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label={t('steps')}
                    value={isSingleDay
                      ? (dayMetric?.steps != null ? dayMetric.steps.toLocaleString() : '—')
                      : (summary?.avg_steps ? summary.avg_steps.toLocaleString() : '—')}
                    unit={isSingleDay ? undefined : t('avgDay')}
                    icon="👟"
                    chartData={chartSteps}
                    chartColor="fill-brand-500"
                    isDarkMode={isDarkMode}
                  />
                  <MetricCard
                    label={t('sleep')}
                    value={isSingleDay
                      ? fmtMins(dayMetric?.sleep_duration_minutes ?? null)
                      : (summary?.avg_sleep_hours ? summary.avg_sleep_hours.toFixed(1) + 'h' : '—')}
                    unit={isSingleDay
                      ? (dayMetric?.sleep_score != null ? `score ${dayMetric.sleep_score}` : undefined)
                      : t('avgDay')}
                    icon="😴"
                    chartData={chartSleep}
                    chartColor="fill-blue-400"
                    isDarkMode={isDarkMode}
                  />
                  <MetricCard
                    label={t('restingHr')}
                    value={isSingleDay
                      ? (dayMetric?.resting_hr != null ? String(dayMetric.resting_hr) : '—')
                      : (summary?.avg_resting_hr ? String(summary.avg_resting_hr) : '—')}
                    unit="bpm"
                    icon="❤️"
                    chartData={chartHr}
                    chartColor="fill-red-400"
                    isDarkMode={isDarkMode}
                  />
                  <MetricCard
                    label={t('bodyBattery')}
                    value={isSingleDay
                      ? (dayMetric?.body_battery_end != null ? String(dayMetric.body_battery_end) : '—')
                      : (metrics[metrics.length - 1]?.body_battery_end != null ? String(metrics[metrics.length - 1].body_battery_end) : '—')}
                    unit={isSingleDay ? undefined : t('latest')}
                    icon="⚡"
                    chartData={chartBattery}
                    chartColor="fill-yellow-400"
                    isDarkMode={isDarkMode}
                  />
                </div>
              )}

              {/* Sleep detail */}
              {metrics.length > 0 && (sleepPhases.deep != null || sleepPhases.light != null || sleepPhases.rem != null) && (
                <div className={`rounded-xl border ${border} p-4`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className={`text-xs font-semibold uppercase tracking-wide ${textMuted}`}>{t('sleepDetail')}</h3>
                    {sleepPhases.score != null && (
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDarkMode ? 'bg-blue-500/20 text-blue-300' : 'bg-blue-50 text-blue-600'}`}>
                        {t('score')} {sleepPhases.score}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: t('sleepDeep'),  value: sleepPhases.deep,  color: isDarkMode ? 'text-indigo-400' : 'text-indigo-600', icon: '🌑' },
                      { label: t('sleepLight'), value: sleepPhases.light, color: isDarkMode ? 'text-blue-400'   : 'text-blue-500',   icon: '🌙' },
                      { label: t('sleepRem'),   value: sleepPhases.rem,   color: isDarkMode ? 'text-purple-400' : 'text-purple-600', icon: '💭' },
                      { label: t('sleepAwake'), value: sleepPhases.awake, color: isDarkMode ? 'text-orange-400' : 'text-orange-500', icon: '👁️' },
                    ].map(({ label, value, color, icon }) => (
                      <div key={label} className={`rounded-lg p-2.5 ${isDarkMode ? 'bg-gray-800/60' : 'bg-gray-50'} flex flex-col gap-1`}>
                        <span className="text-base">{icon}</span>
                        <span className={`text-xs font-bold ${value != null ? color : textMuted}`}>{fmtMins(value)}</span>
                        <span className={`text-xs ${textMuted}`}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Daily breakdown table — multi-day only */}
              {metrics.length > 0 && !isSingleDay && (
                <div className={`rounded-xl border ${border} overflow-hidden`}>
                  <div className={`px-4 py-3 border-b ${border}`}>
                    <h3 className={`text-xs font-semibold uppercase tracking-wide ${textMuted}`}>{t('dailyBreakdown')}</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={`text-xs ${textMuted} ${isDarkMode ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                          <th className="text-left px-4 py-2 font-medium">{t('date')}</th>
                          <th className="text-right px-3 py-2 font-medium">👟</th>
                          <th className="text-right px-3 py-2 font-medium">❤️</th>
                          <th className="text-right px-3 py-2 font-medium">😴</th>
                          <th className="text-right px-3 py-2 font-medium">{t('score')}</th>
                          <th className="text-right px-4 py-2 font-medium">⚡</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...metrics].reverse().map((m) => (
                          <tr
                            key={m.date}
                            className={`border-t ${border} ${isDarkMode ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'} transition-colors`}
                          >
                            <td className={`px-4 py-2.5 font-medium text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {fmtDate(m.date)}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {m.steps != null ? m.steps.toLocaleString() : <span className={textMuted}>—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {m.resting_hr != null ? `${m.resting_hr} bpm` : <span className={textMuted}>—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {fmtMins(m.sleep_duration_minutes)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-xs">
                              {m.sleep_score != null
                                ? <span className={isDarkMode ? 'text-blue-300' : 'text-blue-600'}>{m.sleep_score}</span>
                                : <span className={textMuted}>—</span>}
                            </td>
                            <td className={`px-4 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {m.body_battery_end != null ? m.body_battery_end : <span className={textMuted}>—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
