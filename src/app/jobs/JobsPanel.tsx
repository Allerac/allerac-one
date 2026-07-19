'use client';

import { useState, useEffect, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { ScheduledJob, JobExecution } from '@/app/types';
import { AlleracIcon } from '@/app/components/ui/AlleracIcon';
import { MODELS } from '@/app/services/llm/models';
import {
  getScheduledJobs, createScheduledJob, updateScheduledJob,
  deleteScheduledJob, toggleJobEnabled, getJobExecutions,
} from '@/app/actions/scheduled-jobs';

// ── Helpers (timezone + cron) ────────────────────────────────────────────────

type Preset = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

function localToUtc(hour: string, minute: string, offsetOverride?: number | null): [string, string] {
  const h = parseInt(hour, 10) || 0;
  const m = parseInt(minute, 10) || 0;
  const off = offsetOverride ?? new Date().getTimezoneOffset();
  const utc = ((h * 60 + m + off) % 1440 + 1440) % 1440;
  return [String(Math.floor(utc / 60)), String(utc % 60).padStart(2, '0')];
}

function userTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

const UTC_OFFSETS = Array.from({ length: 27 }, (_, i) => {
  const h = i - 12;
  return { label: h === 0 ? 'UTC+0' : h > 0 ? `UTC+${h}` : `UTC${h}`, offsetMin: -h * 60 };
});

function buildCron(preset: Preset, hour: string, minute: string, weekday: string,
  monthDay: string, cMin: string, cHour: string, cDom: string, cMonth: string, cDow: string,
  offset: number | null): string {
  switch (preset) {
    case 'hourly': return '0 * * * *';
    case 'daily':   { const [h, m] = localToUtc(hour, minute, offset); return `${m} ${h} * * *`; }
    case 'weekly':  { const [h, m] = localToUtc(hour, minute, offset); return `${m} ${h} * * ${weekday}`; }
    case 'monthly': { const [h, m] = localToUtc(hour, minute, offset); return `${m} ${h} ${monthDay} * *`; }
    case 'custom':  {
      let ch = cHour, cm = cMin;
      if (ch !== '*' && cm !== '*') [ch, cm] = localToUtc(ch, cm, offset);
      return `${cm} ${ch} ${cDom} ${cMonth} ${cDow}`;
    }
  }
}

// ── JobRow ───────────────────────────────────────────────────────────────────

function JobRow({ job, selected, onSelect, onToggle, d }: {
  job: ScheduledJob; selected: boolean; onSelect: () => void;
  onToggle: () => void; d: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 border-b transition-colors group ${
        selected
          ? d ? 'bg-indigo-950/50 border-b-indigo-900' : 'bg-indigo-50 border-b-indigo-100'
          : d ? 'border-b-gray-800 hover:bg-gray-800/60' : 'border-b-gray-100 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-start gap-2">
        {/* Mini toggle */}
        <div
          onClick={e => { e.stopPropagation(); onToggle(); }}
          className={`mt-0.5 flex-shrink-0 w-7 h-4 rounded-full relative transition-colors ${
            job.enabled ? 'bg-brand-500' : d ? 'bg-gray-600' : 'bg-gray-300'
          }`}
        >
          <span className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
            job.enabled ? 'translate-x-3' : 'translate-x-0'
          }`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-sm font-medium truncate ${
              selected ? d ? 'text-indigo-300' : 'text-indigo-700' : d ? 'text-gray-200' : 'text-gray-800'
            }`}>{job.name}</span>
            {job.channels.map(ch => (
              <span key={ch} className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                d ? 'bg-brand-900/40 text-brand-300' : 'bg-brand-100 text-brand-700'
              }`}>{ch}</span>
            ))}
          </div>
          <p className={`text-xs font-mono mt-0.5 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{job.cronExpr}</p>
          {job.lastRunAt && (
            <p className={`text-xs mt-0.5 ${d ? 'text-gray-500' : 'text-gray-400'}`}>
              {new Date(job.lastRunAt).toLocaleString()}
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

// ── JobEditor ────────────────────────────────────────────────────────────────

interface FormState {
  name: string; prompt: string; channels: string[]; enabled: boolean;
  modelSelection: string;
  preset: Preset; hour: string; minute: string; weekday: string; monthDay: string;
  cMin: string; cHour: string; cDom: string; cMonth: string; cDow: string; cronExpr: string;
}

const emptyForm: FormState = {
  name: '', prompt: '', channels: ['telegram'], enabled: true, modelSelection: 'automatic',
  preset: 'daily', hour: '8', minute: '0', weekday: '1', monthDay: '1',
  cMin: '0', cHour: '8', cDom: '*', cMonth: '*', cDow: '*', cronExpr: '',
};

function jobToForm(job: ScheduledJob): FormState {
  return { ...emptyForm, name: job.name, prompt: job.prompt, channels: job.channels, enabled: job.enabled, modelSelection: job.llmModel ?? 'automatic', preset: 'custom', cronExpr: job.cronExpr };
}

function JobEditor({ job, userId, isDarkMode: d, domainSlug, onSaved, onDeleted, onClose }: {
  job: ScheduledJob | null; userId: string; isDarkMode: boolean;
  domainSlug?: string | null; onSaved: () => void; onDeleted: () => void; onClose: () => void;
}) {
  const t = useTranslations('scheduledJobs');
  const DAYS = t.raw('days') as string[];
  const [form, setForm]       = useState<FormState>(job ? jobToForm(job) : emptyForm);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [tzOffset, setTzOffset] = useState<number | null>(null);
  const [executions, setExecs] = useState<JobExecution[]>([]);
  const tz = userTz();
  const autoOff = -Math.round(new Date().getTimezoneOffset() / 60);

  useEffect(() => {
    setForm(job ? jobToForm(job) : emptyForm);
    setError(''); setSuccess('');
    if (job) {
      getJobExecutions(job.id).then(r => { if (r.success) setExecs(r.data ?? []); });
    } else {
      setExecs([]);
    }
  }, [job?.id]);

  const derivedCron = buildCron(form.preset, form.hour, form.minute, form.weekday, form.monthDay,
    form.cMin, form.cHour, form.cDom, form.cMonth, form.cDow, tzOffset);

  const s = (p: Partial<FormState>) => setForm(prev => ({ ...prev, ...p }));

  const inputCls = `w-full px-3 py-2 rounded-lg border text-sm focus:outline-none focus:border-brand-500 ${
    d ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900'
  }`;
  const labelCls = `block text-xs font-medium mb-1.5 ${d ? 'text-gray-300' : 'text-gray-700'}`;

  const handleSave = async () => {
    if (!form.name.trim()) { setError(t('errors.nameRequired')); return; }
    if (!form.prompt.trim()) { setError(t('errors.promptRequired')); return; }
    if (form.channels.length === 0) { setError(t('errors.channelRequired')); return; }
    setSaving(true); setError('');
    const selectedModel = MODELS.find(model => model.id === form.modelSelection);
    const data = {
      name: form.name,
      cronExpr: derivedCron.trim(),
      prompt: form.prompt,
      channels: form.channels,
      enabled: form.enabled,
      domainSlug: domainSlug ?? null,
      llmModel: selectedModel?.id ?? null,
      llmProvider: selectedModel?.provider ?? null,
    };
    const res = job
      ? await updateScheduledJob(job.id, data)
      : await createScheduledJob(data);
    setSaving(false);
    if (res.success) { setSuccess(job ? t('success.saved') : t('success.created')); onSaved(); setTimeout(() => setSuccess(''), 2000); }
    else setError(res.error ?? 'Error');
  };

  const handleDelete = async () => {
    if (!job || !confirm(t('confirm.delete'))) return;
    const res = await deleteScheduledJob(job.id);
    if (res.success) onDeleted();
    else setError(res.error ?? 'Error');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className={`flex-shrink-0 flex items-center justify-between px-4 py-3 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-2">
          <button onClick={onClose} className={`lg:hidden text-xs ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'} transition-colors`}>
            ← Jobs
          </button>
          <span className={`text-sm font-semibold ${d ? 'text-gray-200' : 'text-gray-800'}`}>
            {job ? t('tabs.edit') : t('newJob')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {job && (
            <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-300 transition-colors">
              {t('actions.delete')}
            </button>
          )}
          <button onClick={onClose} className={`hidden lg:block text-lg leading-none ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>×</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="max-w-2xl mx-auto space-y-4">
        {/* Name */}
        <div>
          <label className={labelCls}>{t('fields.name')}</label>
          <input value={form.name} onChange={e => s({ name: e.target.value })} className={inputCls} placeholder={t('placeholderName')} />
        </div>

        {/* Prompt */}
        <div>
          <label className={labelCls}>{t('fields.prompt')}</label>
          <textarea value={form.prompt} onChange={e => s({ prompt: e.target.value })} rows={4} className={inputCls} placeholder={t('placeholderPrompt')} />
        </div>

        {/* Channels */}
        <div>
          <label className={labelCls}>Model</label>
          <select value={form.modelSelection} onChange={e => s({ modelSelection: e.target.value })} className={inputCls}>
            <option value="automatic">Automatic (current availability)</option>
            <optgroup label="Local models">
              {MODELS.filter(model => model.provider === 'ollama').map(model => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </optgroup>
            <optgroup label="Cloud models">
              {MODELS.filter(model => model.provider !== 'ollama').map(model => (
                <option key={model.id} value={model.id}>{model.name} ({model.provider})</option>
              ))}
            </optgroup>
          </select>
          <p className={`mt-1 text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>
            Local models can run asynchronously without consuming a cloud provider. Explicit selections fail if unavailable.
          </p>
        </div>

        {/* Channels */}
        <div>
          <label className={labelCls}>{t('fields.channels')}</label>
          <div className="flex gap-4">
            {['telegram'].map(ch => (
              <label key={ch} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.channels.includes(ch)}
                  onChange={() => s({ channels: form.channels.includes(ch) ? form.channels.filter(c => c !== ch) : [...form.channels, ch] })}
                  className="rounded" />
                <span className={`text-sm capitalize ${d ? 'text-gray-300' : 'text-gray-700'}`}>{ch}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Enabled */}
        <div className="flex items-center gap-2">
          <button onClick={() => s({ enabled: !form.enabled })}
            className={`w-9 h-5 rounded-full relative transition-colors ${form.enabled ? 'bg-brand-500' : d ? 'bg-gray-600' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
          <span className={`text-sm ${d ? 'text-gray-300' : 'text-gray-700'}`}>{form.enabled ? t('enabledLabel') : t('disabledLabel')}</span>
        </div>

        {/* Frequency */}
        <div className={`p-3 rounded-lg border ${d ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
          <label className={labelCls}>{t('fields.frequency')}</label>
          <select value={form.preset} onChange={e => s({ preset: e.target.value as Preset })} className={`${inputCls} mb-3`}>
            <option value="hourly">{t('presets.hourly')}</option>
            <option value="daily">{t('presets.daily')}</option>
            <option value="weekly">{t('presets.weekly')}</option>
            <option value="monthly">{t('presets.monthly')}</option>
            <option value="custom">{t('presets.custom')}</option>
          </select>

          {/* Daily/Weekly/Monthly time picker */}
          {(form.preset === 'daily' || form.preset === 'weekly' || form.preset === 'monthly') && (
            <div className="flex gap-2 items-center flex-wrap mb-3">
              {form.preset === 'weekly' && (
                <>
                  <span className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeOn')}</span>
                  <select value={form.weekday} onChange={e => s({ weekday: e.target.value })}
                    className={`px-2 py-1 rounded border text-sm ${d ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                    {DAYS.map((day, i) => <option key={i} value={i}>{day}</option>)}
                  </select>
                </>
              )}
              {form.preset === 'monthly' && (
                <>
                  <span className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeOnDay')}</span>
                  <input type="number" min="1" max="28" value={form.monthDay} onChange={e => s({ monthDay: e.target.value })}
                    className={`w-16 px-2 py-1 rounded border text-sm ${d ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
                </>
              )}
              <span className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>{t('timeAt')}</span>
              <input type="number" min="0" max="23" value={form.hour} onChange={e => s({ hour: e.target.value })}
                className={`w-16 px-2 py-1 rounded border text-sm ${d ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
              <span className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>h</span>
              <input type="number" min="0" max="59" value={form.minute} onChange={e => s({ minute: e.target.value })}
                className={`w-16 px-2 py-1 rounded border text-sm ${d ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`} />
              <span className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>min</span>
            </div>
          )}

          {/* Custom builder */}
          {form.preset === 'custom' && (
            <div className="mb-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: t('customFields.minute'),     val: form.cMin,  key: 'cMin',  opts: ['*',...[0,5,10,15,20,25,30,35,40,45,50,55].map(String)] },
                  { label: t('customFields.hour'),       val: form.cHour, key: 'cHour', opts: ['*',...Array.from({length:24},(_,i)=>String(i))] },
                  { label: t('customFields.dayOfMonth'), val: form.cDom,  key: 'cDom',  opts: ['*',...Array.from({length:31},(_,i)=>String(i+1))] },
                  { label: t('customFields.month'),      val: form.cMonth,key: 'cMonth',opts: ['*',...(t.raw('months') as string[]).map((_,i)=>String(i+1))] },
                ].map(({ label, val, key, opts }) => (
                  <div key={key}>
                    <label className={`block text-xs mb-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>{label}</label>
                    <select value={val} onChange={e => s({ [key]: e.target.value } as any)}
                      className={`w-full px-2 py-1 rounded border text-sm ${d ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                      {opts.map(o => <option key={o} value={o}>{o === '*' ? t('customFields.any') : o}</option>)}
                    </select>
                  </div>
                ))}
                <div className="col-span-2">
                  <label className={`block text-xs mb-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>{t('customFields.dayOfWeek')}</label>
                  <select value={form.cDow} onChange={e => s({ cDow: e.target.value })}
                    className={`w-full px-2 py-1 rounded border text-sm ${d ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}>
                    <option value="*">{t('customFields.any')}</option>
                    {(t.raw('days') as string[]).map((day,i) => <option key={i} value={i}>{day}</option>)}
                  </select>
                </div>
              </div>
              {form.cHour !== '*' && form.cMin !== '*' && (
                <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                  {form.cHour}:{String(form.cMin).padStart(2,'0')} {tz} → {localToUtc(form.cHour, form.cMin, tzOffset)[0]}:{localToUtc(form.cHour, form.cMin, tzOffset)[1]} UTC
                </p>
              )}
            </div>
          )}

          {/* Cron preview */}
          <div>
            <p className={`text-xs font-mono px-3 py-2 rounded ${d ? 'bg-gray-800 text-green-400' : 'bg-gray-100 text-green-700'}`}>{derivedCron}</p>
            {form.preset !== 'hourly' && form.preset !== 'custom' && (
              <p className={`text-xs mt-1 ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                {form.hour}:{String(form.minute).padStart(2,'0')} {tz} → {localToUtc(form.hour, form.minute, tzOffset)[0]}:{localToUtc(form.hour, form.minute, tzOffset)[1]} UTC
              </p>
            )}
          </div>

          {/* Timezone override */}
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{t('timezone')}</span>
            <select value={tzOffset === null ? 'auto' : String(tzOffset)}
              onChange={e => setTzOffset(e.target.value === 'auto' ? null : parseInt(e.target.value, 10))}
              className={`text-xs px-2 py-0.5 rounded border ${d ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-700'}`}>
              <option value="auto">Auto ({tz}, UTC{autoOff >= 0 ? '+' : ''}{autoOff})</option>
              {UTC_OFFSETS.map(o => <option key={o.label} value={o.offsetMin}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Execution history */}
        {executions.length > 0 && (
          <div>
            <p className={`text-xs font-medium mb-2 ${d ? 'text-gray-400' : 'text-gray-500'}`}>{t('execHistory')}</p>
            <div className="space-y-2">
              {executions.slice(0, 5).map(ex => (
                <div key={ex.id} className={`p-2 rounded-lg ${d ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${ex.status === 'completed' ? 'text-green-400' : ex.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}`}>
                      {ex.status === 'completed' ? '✓' : ex.status === 'failed' ? '✗' : '…'}
                    </span>
                    <span className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{new Date(ex.startedAt).toLocaleString()}</span>
                  </div>
                  {ex.result && (
                    <p className={`text-xs mt-1 ${d ? 'text-gray-400' : 'text-gray-600'} line-clamp-3`}>{ex.result}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-green-400">{success}</p>}
        </div>
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 border-t px-4 sm:px-6 py-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="max-w-2xl mx-auto">
          <button onClick={handleSave} disabled={saving}
            className="w-full px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium transition">
            {saving ? t('saving') : job ? t('saveChanges') : t('createJob')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── JobsPanel ────────────────────────────────────────────────────────────────

interface Props {
  userId: string;
  isDarkMode: boolean;
  domainSlug?: string | null;
}

export default function JobsPanel({ userId, isDarkMode: d, domainSlug }: Props) {
  const t = useTranslations('scheduledJobs');
  const [jobs, setJobs]               = useState<ScheduledJob[]>([]);
  const [selected, setSelected]       = useState<ScheduledJob | null>(null);
  const [isCreating, setIsCreating]   = useState(false);
  const [loading, setLoading]         = useState(true);
  const [mobileTab, setMobileTab]     = useState<'list' | 'editor'>('list');

  const load = useCallback(async () => {
    const res = await getScheduledJobs();
    if (res.success) setJobs(res.data ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (job: ScheduledJob) => {
    const res = await toggleJobEnabled(job.id);
    if (res.success && res.data) setJobs(prev => prev.map(j => j.id === job.id ? res.data! : j));
  };

  const handleSelect = (job: ScheduledJob) => {
    setSelected(job); setIsCreating(false); setMobileTab('editor');
  };

  const handleNew = () => {
    setSelected(null); setIsCreating(true); setMobileTab('editor');
  };

  const handleClose = () => {
    setSelected(null); setIsCreating(false); setMobileTab('list');
  };

  const handleSaved = () => {
    load();
    if (isCreating) { setIsCreating(false); setMobileTab('list'); }
  };

  const handleDeleted = () => {
    load(); handleClose();
  };

  const showEditor = selected !== null || isCreating;
  const border = d ? 'border-gray-700' : 'border-gray-200';
  const bg = d ? 'bg-gray-900' : 'bg-white';

  return (
    <div className={`flex flex-1 min-h-0 ${bg}`}>

      {/* Job list */}
      <div className={`${mobileTab === 'list' ? 'flex flex-col flex-1' : 'hidden'} lg:flex lg:flex-col lg:flex-none lg:w-64 border-r ${border} overflow-hidden`}>
        {/* List header */}
        <div className={`flex-shrink-0 flex items-center justify-between px-3 py-2.5 border-b ${border}`}>
          <span className={`text-xs font-semibold uppercase tracking-wider ${d ? 'text-gray-400' : 'text-gray-500'}`}>{t('tabs.list')}</span>
          <button onClick={handleNew}
            className={`text-xs px-2 py-1 rounded transition-colors ${d ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            {t('newJob')}
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className={`text-xs text-center py-8 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{t('loading')}</p>
          ) : jobs.length === 0 ? (
            <div className="text-center py-12 px-4">
              <p className={`text-2xl mb-2`}>⏰</p>
              <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{t('noJobs')}</p>
              <button onClick={handleNew} className="mt-3 text-xs text-indigo-400 hover:text-indigo-300">
                {t('newJob')}
              </button>
            </div>
          ) : (
            jobs.map(job => (
              <JobRow key={job.id} job={job} selected={selected?.id === job.id}
                onSelect={() => handleSelect(job)} onToggle={() => handleToggle(job)} d={d} />
            ))
          )}
        </div>
      </div>

      {/* Editor */}
      <div className={`${mobileTab === 'editor' ? 'flex flex-col flex-1' : 'hidden'} lg:flex lg:flex-col lg:flex-1 overflow-hidden`}>
        {showEditor ? (
          <JobEditor
            key={selected?.id ?? 'new'}
            job={selected}
            userId={userId}
            isDarkMode={d}
            domainSlug={domainSlug}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
            onClose={handleClose}
          />
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center gap-3 ${d ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <AlleracIcon size={52} />
            <p className={`text-sm ${d ? 'text-gray-500' : 'text-gray-400'}`}>{t('editorHint')}</p>
            <button onClick={handleNew} className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
              {t('newJob')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
