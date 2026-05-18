'use client';

import { useState, useEffect } from 'react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { useTranslations } from 'next-intl';

interface SleepPhases {
  deep: number | null;
  light: number | null;
  rem: number | null;
  awake: number | null;
  score: number | null;
}

const HRV_STATUS: Record<string, { label: string; color: string }> = {
  BALANCED:   { label: 'Balanced',   color: '#22c55e' },
  LOW:        { label: 'Low',        color: '#ef4444' },
  UNBALANCED: { label: 'Unbalanced', color: '#f59e0b' },
};

interface Props {
  sleepPhases: SleepPhases;
  steps: number | null;
  distance: number | null;
  sleepMinutes: number | null;
  hrv: number | null;
  hrvStatus: string | null;
  restingHr: number | null;
  maxHr: number | null;
  hrTrend?: { date: string; value: number }[];
  isDarkMode: boolean;
}

const DEFAULT_STEPS_GOAL = 10000;
const STEPS_GOAL_KEY = 'health_steps_goal';

const SLEEP_SEGMENTS = [
  { key: 'deep'  as const, label: 'Deep',  color: '#6366f1' },
  { key: 'light' as const, label: 'Light', color: '#60a5fa' },
  { key: 'rem'   as const, label: 'REM',   color: '#a78bfa' },
  { key: 'awake' as const, label: 'Awake', color: '#fb923c' },
];

function sleepScoreColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 70) return '#6366f1';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function fmtMins(mins: number | null): string {
  if (mins == null || mins === 0) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function HealthTodayCharts({ sleepPhases, steps, distance, sleepMinutes, hrv, hrvStatus, restingHr, maxHr, hrTrend, isDarkMode }: Props) {
  const t = useTranslations('health');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [stepsGoal, setStepsGoal] = useState(DEFAULT_STEPS_GOAL);
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem(STEPS_GOAL_KEY);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed) && parsed > 0) setStepsGoal(parsed);
    }
  }, []);

  const startEditGoal = () => {
    setGoalInput(String(stepsGoal));
    setEditingGoal(true);
  };

  const saveGoal = () => {
    const parsed = parseInt(goalInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setStepsGoal(parsed);
      localStorage.setItem(STEPS_GOAL_KEY, String(parsed));
    }
    setEditingGoal(false);
  };

  const d = isDarkMode;
  const textMuted = d ? 'text-gray-400' : 'text-gray-500';
  const textMain  = d ? 'text-gray-100' : 'text-gray-900';
  const cardCls      = `rounded-lg border p-4 ${d ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`;
  const metricCardCls = `flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${d ? 'border-gray-700 bg-gray-800/40 hover:bg-gray-800/70' : 'border-gray-200 bg-white hover:bg-gray-50'}`;

  const sleepData = SLEEP_SEGMENTS
    .map(s => ({ ...s, value: sleepPhases[s.key] ?? 0 }))
    .filter(s => s.value > 0);
  const hasSleep = sleepData.length > 0;
  const totalSleepMins = sleepData.reduce((sum, s) => sum + s.value, 0);


  const stepsPercent = steps ? Math.min((steps / stepsGoal) * 100, 100) : 0;

  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:h-full">

      {/* Column 1: Sleep bar + Steps */}
      <div className="flex-1 flex flex-col gap-3">

        {/* A — Sleep horizontal stacked bar */}
        <div className={cardCls}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">😴</span>
              <div className="min-w-0">
                <p className={`text-base font-bold leading-tight ${textMain}`}>
                  {sleepMinutes != null ? fmtMins(sleepMinutes) : '—'}
                  <span className={`text-xs font-normal ml-1 ${textMuted}`}>total</span>
                </p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>{t('sleep')}</p>
              </div>
            </div>
            {sleepPhases.score != null && (
              <div className="text-right">
                <p className="text-2xl font-bold leading-none" style={{ color: sleepScoreColor(sleepPhases.score) }}>
                  {sleepPhases.score}
                </p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>score</p>
              </div>
            )}
          </div>

          {hasSleep ? (
            <>
              {/* Phase labels above bar */}
              <div className="flex w-full mb-0.5">
                {sleepData.map((s, i) => {
                  const pct = (s.value / totalSleepMins) * 100;
                  return (
                    <div
                      key={s.key}
                      style={{ width: `${pct}%` }}
                      className="flex justify-center"
                      onMouseEnter={() => setActiveIndex(i)}
                      onMouseLeave={() => setActiveIndex(null)}
                    >
                      {(s.key !== 'awake' || pct >= 5) && (
                        <span className="text-xs font-medium" style={{ color: s.color }}>
                          {s.label}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Stacked bar */}
              <div className="w-full h-5 rounded-full overflow-hidden flex">
                {sleepData.map((s, i) => (
                  <div
                    key={s.key}
                    style={{
                      width: `${(s.value / totalSleepMins) * 100}%`,
                      background: s.color,
                      opacity: activeIndex == null || activeIndex === i ? 1 : 0.4,
                      transition: 'opacity 0.15s',
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                  />
                ))}
              </div>

              {/* Times below */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                {sleepData.map((s, i) => (
                  <div
                    key={s.label}
                    className="flex items-center gap-1 cursor-default"
                    onMouseEnter={() => setActiveIndex(i)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className={`text-xs ${textMuted}`}>{s.label}</span>
                    <span className="text-xs font-semibold ml-0.5" style={{ color: s.color }}>{fmtMins(s.value)}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2 py-1">
              <p>😴</p>
              <p className={`text-xs ${textMuted}`}>No data</p>
            </div>
          )}
        </div>

        {/* B — Steps + Distance */}
        {steps != null && (
          <div className={`${cardCls} flex-1 flex flex-col gap-3`}>

            {/* Header: Distance (left) + Steps count (right, like sleep score) */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl flex-shrink-0">📍</span>
                <div className="min-w-0">
                  <p className={`text-base font-bold leading-tight ${distance != null ? textMain : textMuted}`}>
                    {distance != null ? (distance / 1000).toFixed(2) : '—'}
                    {distance != null && <span className={`text-xs font-normal ml-1 ${textMuted}`}>km</span>}
                  </p>
                  <p className={`text-xs mt-0.5 ${textMuted}`}>Distance</p>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-2xl font-bold leading-none ${textMain}`}>
                  {steps.toLocaleString()}
                </p>
                <p className={`text-xs mt-0.5 ${textMuted}`}>
                  /&nbsp;
                  {editingGoal ? (
                    <input
                      type="number"
                      value={goalInput}
                      onChange={e => setGoalInput(e.target.value)}
                      onBlur={saveGoal}
                      onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false); }}
                      className={`w-16 bg-transparent border-b outline-none ${isDarkMode ? 'border-gray-400 text-gray-200' : 'border-gray-500 text-gray-700'}`}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="cursor-pointer hover:underline"
                      title="Click to set goal"
                      onClick={startEditGoal}
                    >{stepsGoal.toLocaleString()}</span>
                  )}
                  &nbsp;steps
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div>
              <div className={`h-3 rounded-full overflow-hidden ${d ? 'bg-gray-700' : 'bg-gray-200'}`}>
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${stepsPercent}%` }} />
              </div>
              <div className="flex justify-between items-center mt-1.5">
                <p className={`text-xs ${textMuted}`}>{Math.round(stepsPercent)}% of daily goal</p>
                {!editingGoal && (
                  <button onClick={startEditGoal} className={`text-xs ${textMuted} hover:underline`}>set goal</button>
                )}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Column 2: single card with Heart + Recovery sections */}
      <div className={`flex-1 ${cardCls} flex flex-col gap-4`}>

        {/* Heart section */}
        <div>
          <p className={`text-xs font-semibold uppercase tracking-wide mb-3 ${textMuted}`}>🫀 Heart</p>

          {/* HRV — large */}
          <div className="mb-3">
            <p className={`text-2xl font-bold leading-tight ${hrv != null ? textMain : textMuted}`}>
              {hrv != null ? `${hrv} ` : '—'}
              {hrv != null && <span className="text-sm font-normal">ms</span>}
            </p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-xs ${textMuted}`}>{t('hrvFull')}</span>
              {hrvStatus && HRV_STATUS[hrvStatus.toUpperCase()] && (
                <>
                  <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: HRV_STATUS[hrvStatus.toUpperCase()].color }} />
                  <span className="text-xs" style={{ color: HRV_STATUS[hrvStatus.toUpperCase()].color }}>
                    {HRV_STATUS[hrvStatus.toUpperCase()].label}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* FC Reposo — large */}
          <div className="mb-3">
            <p className={`text-2xl font-bold leading-tight ${restingHr != null ? textMain : textMuted}`}>
              {restingHr != null ? `${restingHr} ` : '—'}
              {restingHr != null && <span className="text-sm font-normal">bpm</span>}
            </p>
            <p className={`text-xs mt-0.5 ${textMuted}`}>{t('restingHrFull')}</p>
          </div>

          {/* FC Máx — large */}
          <div className="mb-3">
            <p className={`text-2xl font-bold leading-tight ${maxHr != null ? textMain : textMuted}`}>
              {maxHr != null ? `${maxHr} ` : '—'}
              {maxHr != null && <span className="text-sm font-normal">bpm</span>}
            </p>
            <p className={`text-xs mt-0.5 ${textMuted}`}>{t('maxHrFull')}</p>
          </div>

          {/* Sparkline — resting HR últimos 7 dias */}
          {hrTrend && hrTrend.length >= 2 && (
            <div>
              <ResponsiveContainer width="100%" height={48}>
                <LineChart data={hrTrend}>
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#f43f5e"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
              <p className={`text-xs mt-0.5 ${textMuted}`}>{t('last7days')}</p>
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
