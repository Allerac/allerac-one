'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as healthActions from '@/app/actions/health';
import GarminSettings from '../settings/GarminSettings';
import RecentActivity from './RecentActivity';
import DailyHealthMetrics from './DailyHealthMetrics';
import ActivitiesList from './ActivitiesList';

interface HealthDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId?: string;
  inline?: boolean;
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

// ─── Main component ─────────────────────────────────────────────────────────

export default function HealthDashboard({ isOpen, onClose, isDarkMode, userId, inline = false }: HealthDashboardProps) {
  const t = useTranslations('health');

  const [garminConnected, setGarminConnected] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('today');
  const [selectedDate, setSelectedDate] = useState<string>(getTodayStr());
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
        const { days, summaryPeriod } = PERIOD_CONFIG[period];
        const endDate = getTodayStr();
        const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const met = await healthActions.getHealthMetrics(userId, startDate, endDate);
        setMetrics(met);
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
  const showSync = garminConnected && (!isSingleDay || isViewingToday);

  if (inline) {
    return (
      <div className={`h-full w-full flex flex-col overflow-hidden ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
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
                <div className="flex items-center justify-center gap-2">
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

                  {/* Date picker input */}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    max={getTodayStr()}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors
                      ${isDarkMode
                        ? 'bg-gray-800 border-gray-700 text-gray-200 focus:border-brand-500 focus:outline-none'
                        : 'bg-white border-gray-200 text-gray-900 focus:border-brand-500 focus:outline-none'}`}
                  />

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

              {/* Single day view */}
              {isSingleDay && (
                <>
                  {/* Daily health metrics — on-demand detail view */}
                  <DailyHealthMetrics isDarkMode={isDarkMode} selectedDate={selectedDate} />

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

              {/* Activities list — multi-day only */}
              {!isSingleDay && (() => {
                const { days } = PERIOD_CONFIG[period];
                const endDate = getTodayStr();
                const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                return <ActivitiesList isDarkMode={isDarkMode} startDate={startDate} endDate={endDate} />;
              })()}
            </div>
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
                <div className="flex items-center justify-center gap-2">
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

                  {/* Date picker input */}
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    max={getTodayStr()}
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors
                      ${isDarkMode
                        ? 'bg-gray-800 border-gray-700 text-gray-200 focus:border-brand-500 focus:outline-none'
                        : 'bg-white border-gray-200 text-gray-900 focus:border-brand-500 focus:outline-none'}`}
                  />

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

              {/* Single day view */}
              {isSingleDay && (
                <>
                  {/* Daily health metrics — on-demand detail view */}
                  <DailyHealthMetrics isDarkMode={isDarkMode} selectedDate={selectedDate} />

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

              {/* Activities list — multi-day only */}
              {!isSingleDay && (() => {
                const { days } = PERIOD_CONFIG[period];
                const endDate = getTodayStr();
                const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                return <ActivitiesList isDarkMode={isDarkMode} startDate={startDate} endDate={endDate} />;
              })()}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
