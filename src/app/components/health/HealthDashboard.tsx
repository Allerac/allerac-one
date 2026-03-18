'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import * as healthActions from '@/app/actions/health';
import GarminSettings from '../settings/GarminSettings';

interface HealthDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId?: string;
}

type Period = 'week' | 'month';

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
  body_battery_end: number | null;
}

// ─── Simple bar chart (pure SVG, no dependencies) ──────────────────────────

function BarChart({
  data,
  color,
  height = 48,
}: {
  data: (number | null)[];
  color: string;
  height?: number;
}) {
  const values = data.map((v) => v ?? 0);
  const max = Math.max(...values, 1);
  const barW = 8;
  const gap = 3;
  const width = values.length * (barW + gap) - gap;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {values.map((v, i) => {
        const h = Math.max(2, (v / max) * height);
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={2}
            className={color}
            opacity={v === 0 ? 0.2 : 0.85}
          />
        );
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
  return (
    <div className={`rounded-xl border p-4 ${card} flex flex-col gap-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{icon}</span>
          <span className={`text-xs font-medium ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div>
          <span className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{value}</span>
          {unit && <span className={`text-xs ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{unit}</span>}
        </div>
        <div className="flex-shrink-0">
          <BarChart data={chartData} color={chartColor} />
        </div>
      </div>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function HealthDashboard({ isOpen, onClose, isDarkMode, userId }: HealthDashboardProps) {
  const t = useTranslations('health');

  const [garminConnected, setGarminConnected] = useState<boolean | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('week');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [metrics, setMetrics] = useState<DayMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const status = await healthActions.getGarminStatus(userId);
      setGarminConnected(!!status.is_connected);
      setLastSync(status.last_sync_at ? new Date(status.last_sync_at).toLocaleString() : null);

      if (status.is_connected) {
        const days = period === 'week' ? 7 : 30;
        const endDate = new Date().toISOString().split('T')[0];
        const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        const [sum, met] = await Promise.all([
          healthActions.getHealthSummary(userId, period),
          healthActions.getHealthMetrics(userId, startDate, endDate),
        ]);

        setSummary({
          avg_steps: sum.avg_steps ? Number(sum.avg_steps) : null,
          avg_calories: sum.avg_calories ? Number(sum.avg_calories) : null,
          avg_resting_hr: sum.avg_resting_hr ? Number(sum.avg_resting_hr) : null,
          avg_sleep_hours: sum.avg_sleep_hours ? Number(sum.avg_sleep_hours) : null,
          total_steps: sum.total_steps ? Number(sum.total_steps) : null,
          days_with_data: sum.days_with_data ? Number(sum.days_with_data) : null,
        });
        setMetrics(met);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, period]);

  useEffect(() => {
    if (isOpen && userId) loadData();
  }, [isOpen, loadData]);

  useEffect(() => {
    if (syncMessage) {
      const t = setTimeout(() => setSyncMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [syncMessage]);

  async function handleSync() {
    if (!userId) return;
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await healthActions.triggerHealthSync(userId);
      setSyncMessage({ type: 'success', text: t('syncSuccess', { records: result.records }) });
      await loadData();
    } catch (e: any) {
      setSyncMessage({ type: 'error', text: e.message });
    } finally {
      setSyncing(false);
    }
  }

  if (!isOpen) return null;

  const overlay = 'fixed inset-0 z-50 flex items-start justify-end';
  const panel = `fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] flex flex-col shadow-2xl overflow-hidden
    ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`;
  const border = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';

  const chartSteps = metrics.map((m) => m.steps);
  const chartHr = metrics.map((m) => m.resting_hr);
  const chartSleep = metrics.map((m) => m.sleep_duration_minutes ? m.sleep_duration_minutes / 60 : null);
  const chartBattery = metrics.map((m) => m.body_battery_end);

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
            {garminConnected && (
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
            /* Not connected — show Garmin settings inline */
            <div className="p-5">
              <p className={`text-sm mb-4 ${textMuted}`}>{t('connectPrompt')}</p>
              <GarminSettings userId={userId} isDarkMode={isDarkMode} />
            </div>
          ) : (
            <div className="p-5 space-y-5">
              {/* Period selector */}
              <div className="flex gap-2">
                {(['week', 'month'] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors
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

              {/* No data yet */}
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
                    value={summary?.avg_steps ? summary.avg_steps.toLocaleString() : '—'}
                    unit={t('avgDay')}
                    icon="👟"
                    chartData={chartSteps}
                    chartColor="fill-brand-500"
                    isDarkMode={isDarkMode}
                  />
                  <MetricCard
                    label={t('sleep')}
                    value={summary?.avg_sleep_hours ? summary.avg_sleep_hours.toFixed(1) : '—'}
                    unit="h"
                    icon="😴"
                    chartData={chartSleep}
                    chartColor="fill-blue-400"
                    isDarkMode={isDarkMode}
                  />
                  <MetricCard
                    label={t('restingHr')}
                    value={summary?.avg_resting_hr ? String(summary.avg_resting_hr) : '—'}
                    unit="bpm"
                    icon="❤️"
                    chartData={chartHr}
                    chartColor="fill-red-400"
                    isDarkMode={isDarkMode}
                  />
                  <MetricCard
                    label={t('bodyBattery')}
                    value={metrics.length > 0 && metrics[metrics.length - 1]?.body_battery_end != null
                      ? String(metrics[metrics.length - 1].body_battery_end)
                      : '—'}
                    unit={t('today')}
                    icon="⚡"
                    chartData={chartBattery}
                    chartColor="fill-yellow-400"
                    isDarkMode={isDarkMode}
                  />
                </div>
              )}

              {/* Daily breakdown table */}
              {metrics.length > 0 && (
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
                              {new Date(m.date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {m.steps != null ? m.steps.toLocaleString() : <span className={textMuted}>—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {m.resting_hr != null ? `${m.resting_hr} bpm` : <span className={textMuted}>—</span>}
                            </td>
                            <td className={`px-3 py-2.5 text-right text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {m.sleep_duration_minutes != null
                                ? `${(m.sleep_duration_minutes / 60).toFixed(1)}h`
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
