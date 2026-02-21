'use client';

import { useEffect, useState } from 'react';
import type { ScheduledJob } from '../../types';
import {
  getScheduledJobs,
  createScheduledJob,
  updateScheduledJob,
  deleteScheduledJob,
  toggleJobEnabled,
} from '../../actions/scheduled-jobs';

// ─── Cron helpers ────────────────────────────────────────────────────────────

type Preset = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

function buildCronExpr(
  preset: Preset,
  hour: string,
  minute: string,
  weekday: string,
  monthDay: string,
  cronExpr: string
): string {
  const h = hour.padStart(2, '0');
  const m = minute.padStart(2, '0');
  switch (preset) {
    case 'hourly':
      return '0 * * * *';
    case 'daily':
      return `${m} ${h} * * *`;
    case 'weekly':
      return `${m} ${h} * * ${weekday}`;
    case 'monthly':
      return `${m} ${h} ${monthDay} * *`;
    case 'custom':
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
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
};

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ScheduledJobsModal({ isOpen, onClose, isDarkMode, userId }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('list');
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [selectedJob, setSelectedJob] = useState<ScheduledJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(defaultForm);

  // Derived cron expression
  const derivedCron = buildCronExpr(
    formData.preset,
    formData.hour,
    formData.minute,
    formData.weekday,
    formData.monthDay,
    formData.cronExpr
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
    if (res.success) setJobs(res.data ?? []);
    else setError(res.error ?? 'Failed to load jobs');
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
      name: job.name,
      prompt: job.prompt,
      channels: job.channels,
      enabled: job.enabled,
      preset: 'custom',
      hour: '8',
      minute: '0',
      weekday: '1',
      monthDay: '1',
      cronExpr: job.cronExpr,
    });
    setError(null);
    setSuccess(null);
    setActiveTab('edit');
  };

  const handleDelete = async (jobId: string) => {
    if (!userId) return;
    if (!confirm('Delete this job?')) return;
    setLoading(true);
    const res = await deleteScheduledJob(jobId, userId);
    setLoading(false);
    if (res.success) {
      setSuccess('Job deleted');
      await loadJobs();
    } else {
      setError(res.error ?? 'Failed to delete');
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

    if (!formData.name.trim()) { setError('Name is required'); return; }
    if (!formData.prompt.trim()) { setError('Prompt is required'); return; }
    if (formData.channels.length === 0) { setError('At least one channel is required'); return; }

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
      });
      setLoading(false);
      if (res.success) {
        setSuccess('Job created');
        await loadJobs();
        setActiveTab('list');
      } else {
        setError(res.error ?? 'Failed to create job');
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
        setSuccess('Job updated');
        await loadJobs();
        setActiveTab('list');
      } else {
        setError(res.error ?? 'Failed to update job');
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
        ? isDarkMode ? 'border-b-2 border-blue-500 text-blue-400' : 'border-b-2 border-blue-600 text-blue-600'
        : isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'
    }`;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div
        className={`backdrop-blur-md rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col ${
          isDarkMode ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'
        }`}
      >
        {/* Header */}
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <svg className="inline-block mr-2 h-6 w-6 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Scheduled Jobs
            </h2>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Automate prompts on a schedule. Results are delivered to your configured channels.
            </p>
          </div>
          <button onClick={onClose} className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button onClick={() => setActiveTab('list')} className={tabCls(activeTab === 'list')}>
            Jobs
          </button>
          <button onClick={openCreate} className={tabCls(activeTab === 'create')}>
            + New Job
          </button>
          {activeTab === 'edit' && (
            <button className={tabCls(true)}>Edit</button>
          )}
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
                <p className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Loading...</p>
              ) : jobs.length === 0 ? (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <svg className="mx-auto h-12 w-12 mb-4 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-lg mb-2">No scheduled jobs yet</p>
                  <p className="text-sm">Click &quot;+ New Job&quot; to get started.</p>
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
                          job.enabled ? 'bg-blue-500' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                        }`}
                        title={job.enabled ? 'Disable' : 'Enable'}
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
                                isDarkMode ? 'bg-blue-900/40 text-blue-300' : 'bg-blue-100 text-blue-700'
                              }`}
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                        <p className={`text-xs mt-1 font-mono ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{job.cronExpr}</p>
                        <p className={`text-xs mt-1 truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{job.prompt}</p>
                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          Last run: {job.lastRunAt ? new Date(job.lastRunAt).toLocaleString() : 'Never'}
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 flex-shrink-0">
                        <button
                          onClick={() => openEdit(job)}
                          className={`text-xs px-3 py-1 rounded transition-colors ${
                            isDarkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(job.id)}
                          className={`text-xs px-3 py-1 rounded transition-colors ${
                            isDarkMode ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-100 text-red-600 hover:bg-red-200'
                          }`}
                          disabled={loading}
                        >
                          Delete
                        </button>
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
                <label className={labelCls}>Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className={inputCls}
                  placeholder="Daily digest"
                />
              </div>

              {/* Prompt */}
              <div>
                <label className={labelCls}>Prompt *</label>
                <textarea
                  value={formData.prompt}
                  onChange={e => setFormData(p => ({ ...p, prompt: e.target.value }))}
                  rows={4}
                  className={inputCls}
                  placeholder="Summarise the latest AI news and send it to me."
                />
              </div>

              {/* Channels */}
              <div>
                <label className={labelCls}>Channels *</label>
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
                    formData.enabled ? 'bg-blue-500' : isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                      formData.enabled ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
                <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  {formData.enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {/* Frequency */}
              <div className={`p-4 rounded-lg border ${isDarkMode ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                <label className={labelCls}>Frequency</label>

                {/* Preset selector */}
                <select
                  value={formData.preset}
                  onChange={e => setFormData(p => ({ ...p, preset: e.target.value as Preset }))}
                  className={`${inputCls} mb-3`}
                >
                  <option value="hourly">Every hour</option>
                  <option value="daily">Every day at…</option>
                  <option value="weekly">Every week on…</option>
                  <option value="monthly">Every month on day…</option>
                  <option value="custom">Custom (cron)</option>
                </select>

                {/* Preset-specific controls */}
                {formData.preset === 'daily' && (
                  <div className="flex gap-2 items-center mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>at</span>
                    <input
                      type="number" min="0" max="23"
                      value={formData.hour}
                      onChange={e => setFormData(p => ({ ...p, hour: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>h</span>
                    <input
                      type="number" min="0" max="59"
                      value={formData.minute}
                      onChange={e => setFormData(p => ({ ...p, minute: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>min</span>
                  </div>
                )}

                {formData.preset === 'weekly' && (
                  <div className="flex gap-2 items-center flex-wrap mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>on</span>
                    <select
                      value={formData.weekday}
                      onChange={e => setFormData(p => ({ ...p, weekday: e.target.value }))}
                      className={`px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    >
                      {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>at</span>
                    <input type="number" min="0" max="23" value={formData.hour}
                      onChange={e => setFormData(p => ({ ...p, hour: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>h</span>
                    <input type="number" min="0" max="59" value={formData.minute}
                      onChange={e => setFormData(p => ({ ...p, minute: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>min</span>
                  </div>
                )}

                {formData.preset === 'monthly' && (
                  <div className="flex gap-2 items-center flex-wrap mb-3">
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>on day</span>
                    <input type="number" min="1" max="28" value={formData.monthDay}
                      onChange={e => setFormData(p => ({ ...p, monthDay: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>at</span>
                    <input type="number" min="0" max="23" value={formData.hour}
                      onChange={e => setFormData(p => ({ ...p, hour: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>h</span>
                    <input type="number" min="0" max="59" value={formData.minute}
                      onChange={e => setFormData(p => ({ ...p, minute: e.target.value }))}
                      className={`w-20 px-2 py-1 rounded border text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                    />
                    <span className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>min</span>
                  </div>
                )}

                {/* Cron expression preview (editable only for custom) */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Cron expression
                  </label>
                  {formData.preset === 'custom' ? (
                    <input
                      type="text"
                      value={formData.cronExpr}
                      onChange={e => setFormData(p => ({ ...p, cronExpr: e.target.value }))}
                      className={`${inputCls} font-mono`}
                      placeholder="*/5 * * * *"
                    />
                  ) : (
                    <p className={`px-3 py-2 rounded font-mono text-sm ${isDarkMode ? 'bg-gray-800 text-green-400' : 'bg-gray-100 text-green-700'}`}>
                      {derivedCron}
                    </p>
                  )}
                </div>

                {/* Next runs */}
                {nextRuns.length > 0 && (
                  <div className="mt-3">
                    <p className={`text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>Next 3 runs</p>
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
                  className="px-6 py-2 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Saving…' : activeTab === 'create' ? 'Create Job' : 'Save Changes'}
                </button>
                <button
                  onClick={() => { setActiveTab('list'); setError(null); setSuccess(null); }}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
