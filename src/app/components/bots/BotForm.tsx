'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import { MODELS } from '@/app/services/llm/models';
import { BOT_TEMPLATES, BLANK_TEMPLATE_ID, slugFromName, type BotTemplate } from '@/app/services/agent/bot-templates';
import { MAX_AGENT_INSTRUCTIONS_CHARS, type MemoryMode, type UnitAgent } from '@/app/services/agent/unit-agents';
import { BotsApiError, botHref, botsApi, type BotCapability } from './bots-api';

interface Props {
  /** The bot being edited; absent on the creation form. */
  initial?: UnitAgent;
}

interface FormState {
  slug: string;
  displayName: string;
  emoji: string;
  role: string;
  description: string;
  instructions: string;
  capabilities: Set<string>;
  memoryMode: MemoryMode;
  shareMemoriesByDefault: boolean;
  modelId: string;
  cloudAllowed: boolean;
}

const MEMORY_LABELS: Record<MemoryMode, string> = {
  isolated: 'Isolated: its own memories plus what the Unit shares',
  all: 'All: reads every memory, other bots’ private ones included',
  none: 'None: no memories',
};

function fromTemplate(template: BotTemplate): FormState {
  return {
    slug: template.slug,
    displayName: template.displayName,
    emoji: template.emoji,
    role: template.role,
    description: '',
    instructions: template.instructions,
    capabilities: new Set(template.capabilities),
    memoryMode: template.memoryMode,
    shareMemoriesByDefault: template.shareMemoriesByDefault,
    modelId: template.localOnly ? (MODELS.find((model) => model.provider === 'ollama')?.id ?? '') : '',
    cloudAllowed: !template.localOnly,
  };
}

function fromBot(bot: UnitAgent): FormState {
  return {
    slug: bot.slug,
    displayName: bot.displayName,
    emoji: bot.emoji ?? '',
    role: bot.role ?? '',
    description: bot.description ?? '',
    instructions: bot.instructions ?? '',
    capabilities: new Set(Object.entries(bot.toolSettings.modules).filter(([, on]) => on).map(([id]) => id)),
    memoryMode: bot.memoryMode,
    shareMemoriesByDefault: bot.shareMemoriesByDefault,
    modelId: bot.modelId ?? '',
    cloudAllowed: bot.cloudAllowed,
  };
}

const SLUG_MESSAGES: Record<string, string> = {
  slug_taken: 'Another bot already uses this slug.',
  slug_reserved: 'This slug is reserved (default agent, a domain or an app route). Pick another one.',
  invalid_slug: 'Use lowercase letters, numbers and dashes.',
};

/** Create or edit a bot of this Unit (multi-bot PR 4). Admin only (the API enforces it). */
export default function BotForm({ initial }: Props) {
  const { isDark: d } = useTheme();
  const router = useRouter();
  const editing = !!initial;
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(initial ? fromBot(initial) : null);
  const [slugTouched, setSlugTouched] = useState(editing);
  const [capabilities, setCapabilities] = useState<BotCapability[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    botsApi.capabilities().then(setCapabilities).catch(() => setCapabilities([]));
  }, []);

  const offered = useMemo(() => new Set((capabilities ?? []).map((capability) => capability.id)), [capabilities]);
  const selectedModel = MODELS.find((model) => model.id === form?.modelId);
  const cloudConflict = !!form && !form.cloudAllowed && !!selectedModel && selectedModel.provider !== 'ollama';

  const input = `w-full rounded-lg border px-3 py-2 text-sm ${d ? 'border-gray-700 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`;
  const muted = d ? 'text-gray-400' : 'text-gray-500';
  const card = `rounded-xl border p-3 text-left ${d ? 'border-gray-700 hover:bg-gray-800' : 'border-gray-200 hover:bg-gray-50'}`;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const pickTemplate = (template: BotTemplate) => {
    setTemplateId(template.id);
    setForm(fromTemplate(template));
    setSlugTouched(template.id !== BLANK_TEMPLATE_ID && !!template.slug);
    setError(null);
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    const modules = Object.fromEntries((capabilities ?? []).map((capability) => [capability.id, form.capabilities.has(capability.id)]));
    const body: Record<string, unknown> = {
      displayName: form.displayName.trim(),
      emoji: form.emoji.trim() || null,
      role: form.role.trim() || null,
      description: form.description.trim() || null,
      instructions: form.instructions.trim() || null,
      toolSettings: { modules },
      memoryMode: form.memoryMode,
      shareMemoriesByDefault: form.shareMemoriesByDefault,
      modelId: form.modelId || null,
      cloudAllowed: form.cloudAllowed,
    };
    try {
      const saved = editing
        ? await botsApi.update(form.slug, body)
        : await botsApi.create({ ...body, slug: form.slug, template: templateId && templateId !== BLANK_TEMPLATE_ID ? templateId : null });
      router.push(botHref(saved.slug));
      router.refresh();
    } catch (err) {
      if (err instanceof BotsApiError) setError(SLUG_MESSAGES[err.code] ?? err.message);
      else setError('Could not save the bot.');
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async () => {
    if (!initial) return;
    setSaving(true);
    try {
      await botsApi.update(initial.slug, { archived: !initial.archivedAt });
      router.push(initial.archivedAt ? botHref(initial.slug) : '/agents');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive the bot.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`min-h-0 flex-1 overflow-y-auto ${d ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'}`}>
      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-10">
        <div className="mb-6 flex items-center gap-3">
          <Link href={initial ? botHref(initial.slug) : '/agents'} className={`text-sm ${muted} hover:underline`}>← Back</Link>
          <h1 className="flex-1 text-xl font-semibold">{editing ? `Edit ${initial.displayName}` : 'New bot'}</h1>
        </div>

        {!editing && (
          <section className="mb-8" aria-label="Templates">
            <p className={`mb-3 text-sm ${muted}`}>Start from a template or from scratch. Everything stays editable.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BOT_TEMPLATES.map((template) => (
                <button key={template.id} type="button" data-testid={`template-${template.id}`} onClick={() => pickTemplate(template)}
                  className={`${card} ${templateId === template.id ? (d ? 'ring-2 ring-blue-500' : 'ring-2 ring-blue-600') : ''}`}>
                  <div className="text-2xl" aria-hidden="true">{template.emoji}</div>
                  <div className="mt-1 text-sm font-medium">{template.displayName || 'Blank'}</div>
                  <div className={`text-xs ${muted}`}>{template.role || 'Core tools only'}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        {form && (
          <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void save(); }}>
            <div className="grid grid-cols-[4rem_1fr] gap-3">
              <Field label="Emoji">
                <input className={`${input} text-center`} value={form.emoji} maxLength={16} onChange={(e) => set('emoji', e.target.value)} />
              </Field>
              <Field label="Name">
                <input className={input} required maxLength={100} value={form.displayName} data-testid="bot-name"
                  onChange={(e) => {
                    const name = e.target.value;
                    setForm((prev) => (prev ? { ...prev, displayName: name, slug: slugTouched ? prev.slug : slugFromName(name) } : prev));
                  }} />
              </Field>
            </div>

            <Field label="Slug" hint={editing ? 'The slug cannot change: it keys the bot’s conversations and memories.' : 'Used in the address /agents/self/<slug>. Cannot change later.'}>
              <input className={input} required pattern="[a-z0-9][a-z0-9-]{0,62}" value={form.slug} disabled={editing} data-testid="bot-slug"
                onChange={(e) => { setSlugTouched(true); set('slug', e.target.value.toLowerCase()); }} />
            </Field>

            <Field label="Role" hint="One line: what this bot takes care of.">
              <input className={input} maxLength={200} value={form.role} onChange={(e) => set('role', e.target.value)} />
            </Field>

            <Field label="Instructions" hint={`${form.instructions.length}/${MAX_AGENT_INSTRUCTIONS_CHARS}`}>
              <textarea className={`${input} min-h-[8rem]`} maxLength={MAX_AGENT_INSTRUCTIONS_CHARS} value={form.instructions}
                onChange={(e) => set('instructions', e.target.value)} />
            </Field>

            <fieldset>
              <legend className="mb-1 text-sm font-medium">Tools</legend>
              <p className={`mb-2 text-xs ${muted}`}>The bot only sees what is checked here. Web search, date and memory basics are always on.</p>
              {capabilities === null ? <p className={`text-xs ${muted}`}>Loading…</p> : (
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {capabilities.map((capability) => (
                    <label key={capability.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" data-testid={`cap-${capability.id}`} checked={form.capabilities.has(capability.id)}
                        onChange={(e) => {
                          const next = new Set(form.capabilities);
                          if (e.target.checked) next.add(capability.id); else next.delete(capability.id);
                          set('capabilities', next);
                        }} />
                      {capability.label}
                    </label>
                  ))}
                  {[...form.capabilities].filter((id) => !offered.has(id)).map((id) => (
                    <span key={id} className={`text-xs ${muted}`}>{id}: not enabled in this Unit</span>
                  ))}
                </div>
              )}
            </fieldset>

            <Field label="Memory">
              <select className={input} value={form.memoryMode} onChange={(e) => set('memoryMode', e.target.value as MemoryMode)}>
                {(Object.keys(MEMORY_LABELS) as MemoryMode[]).map((mode) => <option key={mode} value={mode}>{MEMORY_LABELS[mode]}</option>)}
              </select>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.shareMemoriesByDefault} onChange={(e) => set('shareMemoriesByDefault', e.target.checked)} />
                Share what this bot remembers with the other bots
              </label>
            </Field>

            <Field label="Model" hint="Empty uses the model picked in the chat.">
              <select className={input} value={form.modelId} onChange={(e) => set('modelId', e.target.value)}>
                <option value="">Chat default</option>
                {MODELS.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
              </select>
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!form.cloudAllowed} data-testid="local-only" onChange={(e) => set('cloudAllowed', !e.target.checked)} />
                Local models only (never send this bot&apos;s conversations to a cloud provider)
              </label>
              {cloudConflict && <p className="mt-1 text-xs text-amber-500">The selected model is a cloud model: this bot would refuse to answer.</p>}
            </Field>

            {error && <p className="text-sm text-red-500" role="alert">{error}</p>}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button type="submit" disabled={saving || !form.displayName.trim() || !form.slug} data-testid="save-bot"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? 'Saving…' : editing ? 'Save' : 'Create bot'}
              </button>
              {editing && (
                <button type="button" onClick={() => void toggleArchive()} disabled={saving} data-testid="archive-bot"
                  className={`rounded-lg border px-4 py-2 text-sm ${d ? 'border-gray-700' : 'border-gray-300'}`}>
                  {initial.archivedAt ? 'Restore' : 'Archive'}
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="block" role="group" aria-label={label}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs opacity-60">{hint}</span>}
    </div>
  );
}
