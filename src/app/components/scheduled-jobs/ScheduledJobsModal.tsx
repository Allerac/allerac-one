'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ScheduledJob, JobExecution } from '../../types';
import {
  getScheduledJobs,
  createScheduledJob,
  updateScheduledJob,
  deleteScheduledJob,
  toggleJobEnabled,
  getJobExecutions,
} from '../../actions/scheduled-jobs';

// ─── Timezone helpers ────────────────────────────────────────────────────────

/** Convert local hour+minute to UTC. offsetOverride in minutes (same sign as getTimezoneOffset). */
function localToUtc(hour: string, minute: string, offsetOverride?: number | null): [string, string] {
  const h = parseInt(hour, 10) || 0;
  const m = parseInt(minute, 10) || 0;
  const offsetMin = offsetOverride ?? new Date().getTimezoneOffset();
  const utcTotal = ((h * 60 + m + offsetMin) % (24 * 60) + 24 * 60) % (24 * 60);
  return [String(Math.floor(utcTotal / 60)), String(utcTotal % 60).padStart(2, '0')];
}

function userTimezone(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

/** UTC offset options from UTC-12 to UTC+14 */
const UTC_OFFSETS = Array.from({ length: 27 }, (_, i) => {
  const h = i - 12;
  const label = h === 0 ? 'UTC+0' : h > 0 ? `UTC+${h}` : `UTC${h}`;
  return { label, offsetMin: -h * 60 }; // same sign as getTimezoneOffset
});

// ─── Cron helpers ────────────────────────────────────────────────────────────

type Preset = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

function buildCronExpr(
  preset: Preset,
  hour: string,
  minute: string,
  weekday: string,
  monthDay: string,
  cronExpr: string,
  customMinute = '0',
  customHour = '8',
  customDom = '*',
  customMonth = '*',
  customDow = '*',
  offsetOverride: number | null = null,
): string {
  switch (preset) {
    case 'hourly':
      return '0 * * * *';
    case 'daily': {
      const [uh, um] = localToUtc(hour, minute, offsetOverride);
      return `${um} ${uh} * * *`;
    }
    case 'weekly': {
      const [uh, um] = localToUtc(hour, minute, offsetOverride);
      return `${um} ${uh} * * ${weekday}`;
    }
    case 'monthly': {
      const [uh, um] = localToUtc(hour, minute, offsetOverride);
      return `${um} ${uh} ${monthDay} * *`;
    }
    case 'custom': {
      let cm = customMinute;
      let ch = customHour;
      if (ch !== '*' && cm !== '*') {
        [ch, cm] = localToUtc(ch, cm, offsetOverride);
      }
      return `${cm} ${ch} ${customDom} ${customMonth} ${customDow}`;
    }
    default:
      return cronExpr;
  }
}

/** Compute next N run times for simple preset-based crons (no library needed). */
function getNextRuns(preset: Preset, hour: string, minute: string, weekday: string, monthDay: string): string[] {
  if (preset === 'custom') return [];

  const h = parseInt(hour, 10);
  const m = parseInt(minute, 10);
  const runs: string[] = [];
  const now = new Date();
  let candidate = new Date(now);

  const fmt = (d: Date) =>
    d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const advance = () => {
    switch (preset) {
      case 'hourly': {
        // next full hour boundary
        candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
        candidate.setMinutes(0, 0, 0);
        break;
      }
      case 'daily': {
        candidate = new Date(candidate);
        candidate.setDate(candidate.getDate() + 1);
        candidate.setHours(h, m, 0, 0);
        break;
      }
      case 'weekly': {
        const dow = parseInt(weekday, 10); // 0=Sun
        candidate = new Date(candidate);
        candidate.setDate(candidate.getDate() + 1);
        while (candidate.getDay() !== dow) {
          candidate.setDate(candidate.getDate() + 1);
        }
        candidate.setHours(h, m, 0, 0);
        break;
      }
      case 'monthly': {
        const day = parseInt(monthDay, 10);
        candidate = new Date(candidate);
        candidate.setDate(candidate.getDate() + 1);
        // advance to next occurrence of that day number
        while (candidate.getDate() !== day) {
          candidate.setDate(candidate.getDate() + 1);
        }
        candidate.setHours(h, m, 0, 0);
        break;
      }
    }
  };

  // seed candidate at the start
  switch (preset) {
    case 'hourly':
      candidate.setMinutes(0, 0, 0);
      if (candidate <= now) candidate = new Date(candidate.getTime() + 3600 * 1000);
      break;
    case 'daily':
      candidate.setHours(h, m, 0, 0);
      if (candidate <= now) candidate.setDate(candidate.getDate() + 1);
      break;
    case 'weekly': {
      const dow = parseInt(weekday, 10);
      candidate.setHours(h, m, 0, 0);
      while (candidate.getDay() !== dow || candidate <= now) {
        candidate.setDate(candidate.getDate() + 1);
      }
      break;
    }
    case 'monthly': {
      const day = parseInt(monthDay, 10);
      candidate.setHours(h, m, 0, 0);
      candidate.setDate(day);
      if (candidate <= now) {
        candidate.setMonth(candidate.getMonth() + 1);
        candidate.setDate(day);
      }
      break;
    }
  }

  runs.push(fmt(candidate));
  for (let i = 1; i < 3; i++) {
    advance();
    runs.push(fmt(candidate));
  }
  return runs;
}

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'list' | 'create' | 'edit';

interface FormData {
  name: string;
  prompt: string;
  channels: string[];
  enabled: boolean;
  preset: Preset;
  hour: string;
  minute: string;
  weekday: string;
  monthDay: string;
  cronExpr: string;
  // Visual custom builder fields
  customMinute: string;
  customHour: string;
  customDom: string;
  customMonth: string;
  customDow: string;
}

// Days will be provided by translations

const defaultForm: FormData = {
  name: '',
  prompt: '',
  channels: ['telegram'],
  enabled: true,
  preset: 'daily',
  hour: '8',
  minute: '0',
  weekday: '1',
  monthDay: '1',
  cronExpr: '',
  customMinute: '0',
  customHour: '8',
  customDom: '*',
  customMonth: '*',
  customDow: '*',
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
  inline?: boolean;
  domainSlug?: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScheduledJobsModal({ isOpen, onClose, isDarkMode, userId, inline = false, domainSlug }: Props) {
  const t = useTranslations('scheduledJobs');
  const DAYS = t.raw('days') as string[];
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [executions, setExecutions] = useState<Record<string, JobExecution[]>>({});
  const [selectedJob, setSelectedJob] = useState<ScheduledJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultForm);

  const [tzOffsetMin, setTzOffsetMin] = useState<number | null>(null); // null = auto-detect
  const tz = userTimezone();
  const activeOffset = tzOffsetMin ?? new Date().getTimezoneOffset();
  const autoOffsetH = -Math.round(new Date().getTimezoneOffset() / 60);

  // Derived cron expression (always in UTC)
  const derivedCron = buildCronExpr(
    formData.preset,
    formData.hour,
    formData.minute,
    formData.weekday,
    formData.monthDay,
    formData.cronExpr,
    formData.customMinute,
    formData.customHour,
    formData.customDom,
    formData.customMonth,
    formData.customDow,
    tzOffsetMin,
  );

  const nextRuns = getNextRuns(formData.preset, formData.hour, formData.minute, formData.weekday, formData.monthDay);

  // Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Load jobs when opened
  useEffect(() => {
    if (isOpen && userId) loadJobs();
  }, [isOpen, userId]);

  const loadJobs = async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    const res = await getScheduledJobs(userId);
    setLoading(false);
    if (!res.success) { setError(res.error ?? t('errors.loadFailed')); return; }
    const jobList = res.data ?? [];
    setJobs(jobList);
    // Load last 3 executions for each job in parallel
    const exMap: Record<string, JobExecution[]> = {};
    await Promise.all(jobList.map(async j => {
      const ex = await getJobExecutions(j.id);
      if (ex.success) exMap[j.id] = (ex.data ?? []).slice(0, 3);
    }));
    setExecutions(exMap);
  };

  const openCreate = () => {
    setSelectedJob(null);
    setFormData(defaultForm);
    setError(null);
    setSuccess(null);
    setActiveTab('create');
  };

  const openEdit = (job: ScheduledJob) => {
    setSelectedJob(job);
    // Try to reverse-map preset
    setFormData({
      ...defaultForm,
      name: job.name,
      prompt: job.prompt,
      channels: job.channels,
      enabled: job.enabled,
      preset: 'custom',
      cronExpr: job.cronExpr,
    });
    setError(null);
    setSuccess(null);
    setActiveTab('edit');
  };

  const handleDelete = async (jobId: string) => {
    if (!userId) return;
    if (!confirm(t('confirm.delete'))) return;
    setLoading(true);
    const res = await deleteScheduledJob(jobId, userId);
    setLoading(false);
    if (res.success) {
      setSuccess(t('success.deleted'));
      await loadJobs();
    } else {
      setError(res.error ?? t('errors.deleteFailed'));
    }
  };

  const handleToggle = async (job: ScheduledJob) => {
    if (!userId) return;
    const res = await toggleJobEnabled(job.id, userId);
    if (res.success && res.data) {
      setJobs(prev => prev.map(j => j.id === job.id ? res.data! : j));
    }
  };

  const handleSave = async () => {
    if (!userId) return;

    if (!formData.name.trim()) { setError(t('errors.nameRequired')); return; }
    if (!formData.prompt.trim()) { setError(t('errors.promptRequired')); return; }
    if (formData.channels.length === 0) { setError(t('errors.channelRequired')); return; }

    const cron = derivedCron.trim();

    setLoading(true);
    setError(null);

    if (activeTab === 'create') {
      const res = await createScheduledJob(userId, {
        name: formData.name,
        cronExpr: cron,
        prompt: formData.prompt,
        channels: formData.channels,
        enabled: formData.enabled,
        domainSlug: domainSlug ?? null,
      });
      setLoading(false);
      if (res.success) {
        setSuccess(t('success.created'));
        await loadJobs();
        setActiveTab('list');
      } else {
        setError(res.error ?? t('errors.createFailed'));
      }
    } else if (activeTab === 'edit' && selectedJob) {
      const res = await updateScheduledJob(selectedJob.id, userId, {
        name: formData.name,
        cronExpr: cron,
        prompt: formData.prompt,
        channels: formData.channels,
        enabled: formData.enabled,
      });
      setLoading(false);
      if (res.success) {
        setSuccess(t('success.updated'));
        await loadJobs();
        setActiveTab('list');
      } else {
        setError(res.error ?? t('errors.updateFailed'));
      }
    }
  };

  const toggleChannel = (ch: string) => {
    setFormData(prev => ({
      ...prev,
      channels: prev.channels.includes(ch)
        ? prev.channels.filter(c => c !== ch)
        : [...prev.channels, ch],
    }));
  };

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm ${
    isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
  }`;
  const labelCls = `block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`;
  const tabCls = (active: boolean) =>
    `px-6 py-3 font-medium transition-colors ${
      active
        ? isDarkMode ? 'border-b-2 border-brand-500 text-brand-400' : 'border-b-2 border-brand-600 text-brand-600'
        : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'
    }`;

  if (!isOpen) return null;

  const inner = (
    <>
      {/* Header — only shown when not inline (inline = inside MyAlleracModal) */}
      {!inline && (
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <svg className="inline-block mr-2 h-6 w-6 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('title')}
            </h2>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('description')}</p>
          </div>
          <button onClick={onClose} className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className={`flex border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <button onClick={() => setActiveTab('list')} className={tabCls(activeTab === 'list')}>{t('tabs.list')}</button>
        <button onClick={openCreate} className={tabCls(activeTab === 'create')}>{t('newJob')}</button>
        {activeTab === 'edit' && <button className={tabCls(true)}>{t('tabs.edit')}</button>}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
          {/* Notifications */}
          {error && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${isDarkMode ? 'bg-red-900/20 text-red-400 border border-red-800' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {error}
            </div>
          )}
          {success && (
            <div className={`mb-4 p-3 rounded-lg text-sm ${isDarkMode ? 'bg-green-900/20 text-green-400 border border-green-800' : 'bg-green-50 text-green-700 border border-green-200'}`}>
              {success}
            </div>
          )}

          {/* ── LIST TAB ── */}
          {activeTab === 'list' && (
            <div className="space-y-3">
              {loading && jobs.length === 0 ? (
                <p className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('loading')}</p>
              ) : jobs.length === 0 ? (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <svg className="mx-auto h-12 w-12 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg mb-2">{t('noJobs')}</p>
                  <p className="text-sm">{t('noJobsHint')}</p>
                </div>
              ) : (
                jobs.map(job => (
                  <div
                    key={job.id}
                    className={`p-4 rounded-lg border ${
                      isDarkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      {/* Toggle */}
                      <button
                        onClick={() => handleToggle(job)}
                        className={`mt-0.5 flex-shrink-0 w-10 h-6 rounded-full transition-colors relative ${
                          job.enabled ? 'bg-brand-500' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                        }`}
                        title={job.enabled ? t('toggleDisable') : t('toggleEnable')}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                            job.enabled ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{job.name}</span>
                          {job.channels.map(ch => (
                            <span
                              key={ch}
                              className={`text-xs px-2 py-0.5 rounded-full ${
                                isDarkMode ? 'bg-brand-900/40 text-brand-300' : 'bg-brand-100 text-brand-700'
                              }`}
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                        <p className={`text-xs mt-1 font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{job.cronExpr}</p>
                        <p className={`text-xs mt-1 truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{job.prompt}</p>
                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {t('lastRun')}: {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : t('never')}
                        </p>
                        {/* Execution history */}
                        {(executions[job.id]?.length ?? 0) > 0 && (
                          <div className="mt-2 space-y-1">
                            {executions[job.id].map(ex => (
                              <div key={ex.id} className="flex items-start gap-1.5">
                                <span className={`text-[10px] mt-0.5 flex-shrink-0 ${
                                  ex.status === 'completed' ? 'text-green-400' :
                                  ex.status === 'failed'    ? 'text-red-400' : 'text-yellow-400'
                                }`}>
                                  {ex.status === 'completed' ? '✓' : ex.status === 'failed' ? '✗' : '…'}
                                </span>
                                <div className="min-w-0">
                                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                    {new Date(ex.startedAt).toLocaleString()}
                                  </span>
                                  {ex.result && (
                                    <p className={`text-[10px] truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                      {ex.result.replace(/\n/g, ' ').slice(0, 100)}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Actions — below content to avoid horizontal overflow */}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => openEdit(job)}
                            className={`text-xs px-3 py-1 rounded transition-colors ${
                              isDarkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                            }`}
                        >
                          {t('actions.edit')}
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className={`text-xs px-3 py-1 rounded transition-colors ${
                            isDarkMode ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-100 text-red-600 hover:bg-red-200'
                          }`}
                          disabled={loading}
                        >
                          {t('actions.delete')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                ))
              )}
            </div>
          )}

          {/* ── CREATE / EDIT TAB ── */}
          {(activeTab === 'create' || activeTab === 'edit') && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Name */}
              <div>
                <label className={labelCls}>{t('fields.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className={inputCls}
                  placeholder={t('placeholderName')}
                />
              </div>

              {/* Prompt */}
              <div>
                <label className={labelCls}>{t('fields.prompt')}</label>
                <textarea
                  value={formData.prompt}
                  onChange={e => setFormData(p => ({ ...p, prompt: e.target.value }))}
                  rows={4}
                  className={inputCls}
                  placeholder={t('placeholderPrompt')}
                />
              </div>

              {/* Channels */}
              <div>
                <label className={labelCls}>{t('fields.channels')}</label>
                <div className="flex gap-4 flex-wrap">
                  {['telegram'].map(ch => (
                    <label key={ch} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.channels.includes(ch)}
                        onChange={() => toggleChannel(ch)}
                        className="rounded"
                      />
                      <span className={`text-sm capitalize ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>{ch}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Enabled */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFormData(p => ({ ...p, enabled: !p.enabled }))}
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    formData.enabled ? 'bg-brand-500' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      formData.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {formData.enabled ? t('enabledLabel') : t('disabledLabel')}
                </span>
              </div>

              {/* Frequency */}
              <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <label className={labelCls}>{t('fields.frequency')}</label>

                {/* Preset selector */}
                <select
                  value={formData.preset}
                  onChange={e => setFormData(p => ({ ...p, preset: e.target.value as Preset }))}
                  className={`${inputCls} mb-3`}
                >
                  <option value="hourly">{t('presets.hourly')}</option>
                  <option value="daily">{t('presets.daily')}</option>
                  <option value="weekly">{t('presets.weekly')}</option>
                  <option value="monthly">{t('presets.monthly')}</option>
                  <option value="custom">{t('presets.custom')}</option>
                </select>

                {/* Preset-specific controls */}
                {formData.preset === 'daily' && (
                  <div className="flex gap-2 items-center mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeAt')}</span>
                    <input
                      type="number" min="0" max="23"
                      value={formData.hour}
                      onChange={e => setFormData(p => ({ ...p, hour: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeH')}</span>
                    <input
                      type="number" min="0" max="59"
                      value={formData.minute}
                      onChange={e => setFormData(p => ({ ...p, minute: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeMin')}</span>
                  </div>
                )}

                {formData.preset === 'weekly' && (
                  <div className="flex gap-2 items-center flex-wrap mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeOn')}</span>
                    <select
                      value={formData.weekday}
                      onChange={e => setFormData(p => ({ ...p, weekday: e.target.value }))}
                      className={`px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeAt')}</span>
                    <input type="number" min="0" max="23" value={formData.hour}
                      onChange={e => setFormData(p => ({ ...p, hour: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeH')}</span>
                    <input type="number" min="0" max="59" value={formData.minute}
                      onChange={e => setFormData(p => ({ ...p, minute: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeMin')}</span>
                  </div>
                )}

                {formData.preset === 'monthly' && (
                  <div className="flex gap-2 items-center flex-wrap mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeOnDay')}</span>
                    <input type="number" min="1" max="28" value={formData.monthDay}
                      onChange={e => setFormData(p => ({ ...p, monthDay: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeAt')}</span>
                    <input type="number" min="0" max="23" value={formData.hour}
                      onChange={e => setFormData(p => ({ ...p, hour: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeH')}</span>
                    <input type="number" min="0" max="59" value={formData.minute}
                      onChange={e => setFormData(p => ({ ...p, minute: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeMin')}</span>
                  </div>
                )}

                {/* Cron expression preview (editable only for custom) */}
                {/* Custom visual builder */}
                {formData.preset === 'custom' && (
                  <div className="mb-3 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={`block text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Minuto</label>
                        <select value={formData.customMinute} onChange={e => setFormData(p => ({ ...p, customMinute: e.target.value }))}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="*">Qualquer (*)</option>
                          {[0,5,10,15,20,25,30,35,40,45,50,55].map(v => <option key={v} value={v}>{String(v).padStart(2,'0')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Hora</label>
                        <select value={formData.customHour} onChange={e => setFormData(p => ({ ...p, customHour: e.target.value }))}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="*">Qualquer (*)</option>
                          {Array.from({length:24},(_,i)=>i).map(v => <option key={v} value={v}>{String(v).padStart(2,'0')}:00</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Dia do mês</label>
                        <select value={formData.customDom} onChange={e => setFormData(p => ({ ...p, customDom: e.target.value }))}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="*">Qualquer (*)</option>
                          {Array.from({length:31},(_,i)=>i+1).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className={`block text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Mês</label>
                        <select value={formData.customMonth} onChange={e => setFormData(p => ({ ...p, customMonth: e.target.value }))}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="*">Qualquer (*)</option>
                          {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'].map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <label className={`block text-xs mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Dia da semana</label>
                        <select value={formData.customDow} onChange={e => setFormData(p => ({ ...p, customDow: e.target.value }))}
                          className={`w-full px-2 py-1.5 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                          <option value="*">Qualquer (*)</option>
                          {['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'].map((d,i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                      </div>
                    </div>
                    {formData.customHour !== '*' && formData.customMinute !== '*' && (
                      <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                        {formData.customHour}:{String(formData.customMinute).padStart(2,'0')} {tz} → {localToUtc(formData.customHour, formData.customMinute, tzOffsetMin)[0]}:{localToUtc(formData.customHour, formData.customMinute, tzOffsetMin)[1]} UTC
                      </p>
                    )}
                  </div>
                )}

                {/* Cron preview */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {t('cronPreview')}
                  </label>
                  <p className={`px-3 py-2 rounded font-mono text-sm ${isDarkMode ? 'bg-gray-800 text-green-400' : 'bg-gray-100 text-green-700'}`}>
                    {derivedCron}
                  </p>
                  {formData.preset !== 'hourly' && formData.preset !== 'custom' && (
                    <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                      {formData.hour}:{String(formData.minute).padStart(2,'0')} {tz} → {localToUtc(formData.hour, formData.minute, tzOffsetMin)[0]}:{localToUtc(formData.hour, formData.minute, tzOffsetMin)[1]} UTC
                    </p>
                  )}
                  {/* Timezone override selector */}
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>Fuso:</span>
                    <select
                      value={tzOffsetMin === null ? 'auto' : String(tzOffsetMin)}
                      onChange={e => setTzOffsetMin(e.target.value === 'auto' ? null : parseInt(e.target.value, 10))}
                      className={`text-xs px-2 py-0.5 rounded border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-700'}`}
                    >
                      <option value="auto">Auto ({tz}, UTC{autoOffsetH >= 0 ? '+' : ''}{autoOffsetH})</option>
                      {UTC_OFFSETS.map(o => (
                        <option key={o.label} value={o.offsetMin}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Next runs */}
                {nextRuns.length > 0 && (
                  <div className="mt-3">
                    <p className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t('nextRuns')}</p>
                    <ul className="space-y-0.5">
                      {nextRuns.map((r, i) => (
                        <li key={i} className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-6 py-2 rounded-lg font-medium bg-brand-900 hover:bg-brand-800 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? t('saving') : activeTab === 'create' ? t('createJob') : t('saveChanges')}
                </button>
                <button
                  onClick={() => { setActiveTab('list'); setError(null); setSuccess(null); }}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  {t('actions.cancel')}
                </button>
              </div>
            </div>
          )}
        </div>
    </>
  );

  if (inline) return inner;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-lg shadow-xl max-w-4xl w-full max-h-[90dvh] flex flex-col ${
        isDarkMode ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'
      }`}>
        {inner}
      </div>
    </div>
  );
}
