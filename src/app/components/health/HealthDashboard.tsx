'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as healthActions from '@/app/actions/health';
import GarminSettings from '../settings/GarminSettings';
import RecentActivity from './RecentActivity';
import DailyHealthMetrics from './DailyHealthMetrics';
import HealthTodayCharts from './HealthTodayCharts';
import ActivitiesList from './ActivitiesList';

interface HealthDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId?: string;
  inline?: boolean;
  onViewChange?: (period: Period, selectedDate: string) => void;
}

type Period = 'today' | '3days' | '7days' | '30days';

const PERIOD_CONFIG: Record<Period, { days: number; summaryPeriod: 'day' | '3days' | 'week' | 'month' }> = {
  today:    { days: 1,  summaryPeriod: 'day' },
  '3days':  { days: 3,  summaryPeriod: '3days' },
  '7days':  { days: 7,  summaryPeriod: 'week' },
  '30days': { days: 30, summaryPeriod: 'month' },
};


interface DayMetric {
  date: string;
  steps: number | null;
  calories: number | null;
  resting_hr: number | null;
  max_hr: number | null;
  sleep_duration_minutes: number | null;
  sleep_deep_minutes: number | null;
  sleep_light_minutes: number | null;
  sleep_rem_minutes: number | null;
  sleep_awake_minutes: number | null;
  sleep_score: number | null;
  body_battery_end: number | null;
  stress_avg: number | null;
  distance_meters: number | null;
  hrv_last_night: number | null;
  hrv_weekly_avg: number | null;
  hrv_status: string | null;
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

// ─── Main component ─────────────────────────────────────────────────────────

export default function HealthDashboard({ isOpen, onClose, isDarkMode, userId, inline = false, onViewChange }: HealthDashboardProps) {
  const t = useTranslations('health');

  const [garminConnected, setGarminConnected] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
  const [metrics, setMetrics] = useState<DayMetric[]>([]);
  const [hrHistory, setHrHistory] = useState<{ date: string; value: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reset to today when switching away from 'today' period and back
  useEffect(() => {
    if (period !== 'today') setSelectedDate(getTodayStr());
  }, [period]);

  useEffect(() => {
    onViewChange?.(period, selectedDate);
  }, [period, selectedDate]);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const status = await healthActions.getGarminStatus();
      setGarminConnected(!!status.is_connected);
      setLastSync(status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : null);

      if (status.is_connected) {
        const { days } = PERIOD_CONFIG[period];
        const isSingle = period === 'today';
        const endDate   = isSingle ? selectedDate : getTodayStr();
        const startDate = isSingle
          ? selectedDate
          : new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const met = await healthActions.getHealthMetrics(startDate, endDate);
        setMetrics(met);

        // Always keep 7-day resting HR history for the sparkline (independent of period)
        const hrEnd   = getTodayStr();
        const hrStart = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const hrMet   = await healthActions.getHealthMetrics(hrStart, hrEnd);
        setHrHistory(
          hrMet
            .filter((m: any) => m.resting_hr != null)
            .map((m: any) => ({ date: String(m.date).split('T')[0], value: m.resting_hr }))
        );
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
      const result = await healthActions.triggerHealthSync(PERIOD_CONFIG[period].days);
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

  const border = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const isSingleDay = period === 'today';
  const isViewingToday = isSingleDay && selectedDate === getTodayStr();
  const dayMetric = isSingleDay ? (metrics[0] ?? null) : null;


  // Sleep phases
  const sleepRows = metrics.filter(m => m.sleep_duration_minutes != null);
  const avgPhase = (key: keyof DayMetric) =>
    sleepRows.length ? Math.round(sleepRows.reduce((s, m) => s + ((m[key] as number) ?? 0), 0) / sleepRows.length) : null;
  const sleepPhases = isSingleDay
    ? { deep: dayMetric?.sleep_deep_minutes ?? null, light: dayMetric?.sleep_light_minutes ?? null, rem: dayMetric?.sleep_rem_minutes ?? null, awake: dayMetric?.sleep_awake_minutes ?? null, score: dayMetric?.sleep_score ?? null }
    : { deep: avgPhase('sleep_deep_minutes'), light: avgPhase('sleep_light_minutes'), rem: avgPhase('sleep_rem_minutes'), awake: avgPhase('sleep_awake_minutes'), score: null };

  // Hide sync when viewing a past day — data is already there, user can switch to 7/30d to re-sync a range
  const showSync = !!garminConnected;

  if (inline) {
    return (
      <div className={`h-full w-full flex flex-col overflow-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>

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
            <>
              <div className={`sticky top-0 z-10 px-5 py-3 border-b ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
              {/* Period + date nav: one compact row */}
              <div className="flex items-center gap-2">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className={`px-2 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0 ${isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-gray-100 border-transparent text-gray-700'}`}
                >
                  {(['today', '3days', '7days', '30days'] as Period[]).map((p) => (
                    <option key={p} value={p}>{t(`period.${p}`)}</option>
                  ))}
                </select>

                {isSingleDay && (
                  <>
                    <button
                      onClick={goToPrevDay}
                      className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors flex-shrink-0
                        ${isDarkMode
                          ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      max={getTodayStr()}
                      className={`px-2 py-1.5 rounded-lg text-sm font-semibold border transition-colors
                        ${isDarkMode
                          ? 'bg-gray-800 border-gray-700 text-gray-200 focus:border-brand-500 focus:outline-none'
                          : 'bg-white border-gray-200 text-gray-900 focus:border-brand-500 focus:outline-none'}`}
                    />
                    <button
                      onClick={goToNextDay}
                      disabled={isViewingToday}
                      className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors flex-shrink-0
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
                  </>
                )}

                {loading && (
                  <div className={`animate-spin rounded-full h-4 w-4 border-2 border-t-transparent flex-shrink-0 ${isDarkMode ? 'border-gray-500' : 'border-gray-400'}`} />
                )}

                {showSync && (
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    title={syncing ? t('syncing') : t('syncNow')}
                    className={`ml-auto h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50
                      ${isDarkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
              </div>
              <div className="p-5 space-y-4">

              {/* No data */}
              {!loading && metrics.length === 0 && (
                <div className={`rounded-xl border ${border} p-8 text-center`}>
                  <p className={`text-sm ${textMuted}`}>{t('noData')}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{t('noDataHint')}</p>
                </div>
              )}

              {/* Single day view */}
              {isSingleDay && (
                <>
                  {/* Mobile: stacked | Desktop: side by side (charts 2/3, metrics 1/3) */}
                  <div className="flex flex-col lg:flex-row gap-3">
                    <div className="lg:flex-[2] min-w-0">
                      <HealthTodayCharts
                        sleepPhases={sleepPhases}
                        steps={dayMetric?.steps ?? null}
                        distance={dayMetric?.distance_meters ?? null}
                        sleepMinutes={dayMetric?.sleep_duration_minutes ?? null}
                        hrv={dayMetric?.hrv_weekly_avg ?? null}
                        hrvStatus={dayMetric?.hrv_status ?? null}
                        restingHr={dayMetric?.resting_hr ?? null}
                        maxHr={dayMetric?.max_hr ?? null}
                        hrTrend={hrHistory}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                    <div className="lg:flex-1 min-w-0">
                      <DailyHealthMetrics isDarkMode={isDarkMode} selectedDate={selectedDate} />
                    </div>
                  </div>

                  {/* Recent activity card */}
                  <RecentActivity isDarkMode={isDarkMode} selectedDate={selectedDate} />
                </>
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
                            onClick={() => { setPeriod('today'); setSelectedDate(m.date); }}
                            className={`border-t ${border} ${isDarkMode ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'} transition-colors cursor-pointer`}
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

              {/* Activities list — multi-day only */}
              {!isSingleDay && (() => {
                const { days } = PERIOD_CONFIG[period];
                const endDate = getTodayStr();
                const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                return <ActivitiesList isDarkMode={isDarkMode} startDate={startDate} endDate={endDate} />;
              })()}
            </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className={`fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] flex flex-col shadow-2xl overflow-hidden
        ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${border} flex-shrink-0`}>
          <div className="flex items-center gap-3">
            <span className="text-xl">❤️</span>
            <div>
              <h2 className={`text-base font-semibold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t('title')}</h2>
              {lastSync && <p className={`text-xs ${textMuted}`}>{t('lastSync')}: {lastSync}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${isDarkMode ? 'text-gray-400 hover:bg-gray-700 hover:text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
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
            <>
              <div className={`sticky top-0 z-10 px-5 py-3 border-b ${isDarkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
              {/* Period + date nav: one compact row */}
              <div className="flex items-center gap-2">
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value as Period)}
                  className={`px-2 py-1.5 rounded-lg text-sm font-medium border transition-colors flex-shrink-0 ${isDarkMode ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-gray-100 border-transparent text-gray-700'}`}
                >
                  {(['today', '3days', '7days', '30days'] as Period[]).map((p) => (
                    <option key={p} value={p}>{t(`period.${p}`)}</option>
                  ))}
                </select>

                {isSingleDay && (
                  <>
                    <button
                      onClick={goToPrevDay}
                      className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors flex-shrink-0
                        ${isDarkMode
                          ? 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700 hover:text-white'
                          : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-900'}`}
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <input
                      type="date"
                      value={selectedDate}
                      onChange={(e) => setSelectedDate(e.target.value)}
                      max={getTodayStr()}
                      className={`px-2 py-1.5 rounded-lg text-sm font-semibold border transition-colors
                        ${isDarkMode
                          ? 'bg-gray-800 border-gray-700 text-gray-200 focus:border-brand-500 focus:outline-none'
                          : 'bg-white border-gray-200 text-gray-900 focus:border-brand-500 focus:outline-none'}`}
                    />
                    <button
                      onClick={goToNextDay}
                      disabled={isViewingToday}
                      className={`h-8 w-8 flex items-center justify-center rounded-full border transition-colors flex-shrink-0
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
                  </>
                )}

                {loading && (
                  <div className={`animate-spin rounded-full h-4 w-4 border-2 border-t-transparent flex-shrink-0 ${isDarkMode ? 'border-gray-500' : 'border-gray-400'}`} />
                )}

                {showSync && (
                  <button
                    onClick={handleSync}
                    disabled={syncing}
                    title={syncing ? t('syncing') : t('syncNow')}
                    className={`ml-auto h-8 w-8 flex-shrink-0 flex items-center justify-center rounded-lg transition-colors disabled:opacity-50
                      ${isDarkMode ? 'bg-gray-800 text-gray-300 hover:bg-gray-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    <svg className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                )}
              </div>
              </div>
              <div className="p-5 space-y-4">

              {/* No data */}
              {!loading && metrics.length === 0 && (
                <div className={`rounded-xl border ${border} p-8 text-center`}>
                  <p className={`text-sm ${textMuted}`}>{t('noData')}</p>
                  <p className={`text-xs mt-1 ${textMuted}`}>{t('noDataHint')}</p>
                </div>
              )}

              {/* Single day view */}
              {isSingleDay && (
                <>
                  {/* Mobile: stacked | Desktop: side by side (charts 2/3, metrics 1/3) */}
                  <div className="flex flex-col lg:flex-row gap-3">
                    <div className="lg:flex-[2] min-w-0">
                      <HealthTodayCharts
                        sleepPhases={sleepPhases}
                        steps={dayMetric?.steps ?? null}
                        distance={dayMetric?.distance_meters ?? null}
                        sleepMinutes={dayMetric?.sleep_duration_minutes ?? null}
                        hrv={dayMetric?.hrv_weekly_avg ?? null}
                        hrvStatus={dayMetric?.hrv_status ?? null}
                        restingHr={dayMetric?.resting_hr ?? null}
                        maxHr={dayMetric?.max_hr ?? null}
                        hrTrend={hrHistory}
                        isDarkMode={isDarkMode}
                      />
                    </div>
                    <div className="lg:flex-1 min-w-0">
                      <DailyHealthMetrics isDarkMode={isDarkMode} selectedDate={selectedDate} />
                    </div>
                  </div>

                  {/* Recent activity card */}
                  <RecentActivity isDarkMode={isDarkMode} selectedDate={selectedDate} />
                </>
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
                            onClick={() => { setPeriod('today'); setSelectedDate(m.date); }}
                            className={`border-t ${border} ${isDarkMode ? 'hover:bg-gray-800/30' : 'hover:bg-gray-50'} transition-colors cursor-pointer`}
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

              {/* Activities list — multi-day only */}
              {!isSingleDay && (() => {
                const { days } = PERIOD_CONFIG[period];
                const endDate = getTodayStr();
                const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                return <ActivitiesList isDarkMode={isDarkMode} startDate={startDate} endDate={endDate} />;
              })()}
            </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
