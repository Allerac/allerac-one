'use client';

import { useEffect, useState } from 'react';

// Admin-only "This Unit" card (federation P3.5): the Unit name is its fixed
// identity; the role below is what it takes care of, shared with paired Units.

interface EffectiveProfile {
  name: string;
  displayName: string;
  emoji: string | null;
  role: string | null;
  description: string | null;
  tags: string[];
  agentDescriptions: Record<string, string>;
  identityInPublicDomains: boolean;
}

interface ProfileResponse {
  stored: {
    displayName: string | null;
    emoji: string | null;
    role: string | null;
    description: string | null;
    tags: string[];
    agentDescriptions: Record<string, string>;
    identityInPublicDomains: boolean | null;
  } | null;
  effective: EffectiveProfile;
  exposedAgents: string[];
}

interface Props {
  isDarkMode: boolean;
}

export default function UnitProfileCard({ isDarkMode }: Props) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [form, setForm] = useState({
    displayName: '', emoji: '', role: '', description: '', tags: '',
    agentDescriptions: {} as Record<string, string>, identityInPublicDomains: false,
  });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (next: ProfileResponse) => {
    setData(next);
    setForm({
      displayName: next.stored?.displayName ?? '',
      emoji: next.stored?.emoji ?? '',
      role: next.stored?.role ?? '',
      description: next.stored?.description ?? '',
      tags: (next.stored?.tags ?? []).join(', '),
      agentDescriptions: next.stored?.agentDescriptions ?? {},
      identityInPublicDomains: next.effective.identityInPublicDomains,
    });
  };

  useEffect(() => {
    fetch('/api/v1/unit/profile', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error?.message || 'Failed to load this Unit.');
        if (!body?.data?.effective) throw new Error('Failed to load this Unit.');
        apply(body.data);
      })
      .catch(error => setStatus(error instanceof Error ? error.message : 'Failed to load this Unit.'));
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch('/api/v1/unit/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.displayName || null,
          emoji: form.emoji || null,
          role: form.role || null,
          description: form.description || null,
          tags: form.tags.split(',').map(tag => tag.trim()).filter(Boolean).slice(0, 10),
          agentDescriptions: form.agentDescriptions,
          identityInPublicDomains: form.identityInPublicDomains,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message || 'Save failed.');
      apply(body.data);
      setStatus('Saved.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const panel = isDarkMode ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50';
  const muted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const field = `w-full rounded-md border px-3 py-2 text-sm ${isDarkMode
    ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-400'
    : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'}`;

  if (!data) {
    return (
      <div className={`rounded-lg border p-4 ${panel}`} data-testid="unit-profile-card">
        <h3>This Unit</h3>
        <p className={`text-sm ${muted}`}>{status ?? 'Loading…'}</p>
      </div>
    );
  }

  const name = form.displayName || data.effective.displayName;
  const preview = form.role ? `I'm ${name}, I take care of ${form.role}.` : `I'm ${name}.`;

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${panel}`} data-testid="unit-profile-card">
      <div>
        <h3>This Unit</h3>
        <p className={`text-xs ${muted}`}>
          Unit id <code>{data.effective.name}</code> is fixed. The role is shared with every paired Unit and tells this
          Unit&apos;s agents who they are.
        </p>
      </div>
      <div className="grid grid-cols-[5rem_1fr] gap-2">
        <input aria-label="Emoji" className={field} value={form.emoji} placeholder="🏙️" maxLength={16}
          onChange={event => setForm({ ...form, emoji: event.target.value })} />
        <input aria-label="Display name" className={field} value={form.displayName} maxLength={100}
          placeholder={data.effective.displayName}
          onChange={event => setForm({ ...form, displayName: event.target.value })} />
      </div>
      <input aria-label="Role" className={field} value={form.role} maxLength={200}
        placeholder="What this Unit takes care of, e.g. my medical matters"
        onChange={event => setForm({ ...form, role: event.target.value })} />
      <textarea aria-label="Description" className={field} value={form.description} maxLength={1000} rows={3}
        placeholder="Short description"
        onChange={event => setForm({ ...form, description: event.target.value })} />
      <input aria-label="Tags" className={field} value={form.tags} placeholder="Tags, comma separated"
        onChange={event => setForm({ ...form, tags: event.target.value })} />

      {data.exposedAgents.length > 0 && (
        <div className="space-y-2">
          <p className={`text-xs font-semibold ${muted}`}>Agents shared with paired Units</p>
          {data.exposedAgents.map(slug => (
            <label key={slug} className="flex items-center gap-2 text-sm">
              <code className="w-24 shrink-0">{slug}</code>
              <input aria-label={`Description for ${slug}`} className={field} maxLength={300}
                value={form.agentDescriptions[slug] ?? ''} placeholder="What this agent does"
                onChange={event => setForm({
                  ...form, agentDescriptions: { ...form.agentDescriptions, [slug]: event.target.value },
                })} />
            </label>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.identityInPublicDomains}
          onChange={event => setForm({ ...form, identityInPublicDomains: event.target.checked })} />
        Also use this identity in public domains (sales, openworld)
      </label>

      <p className={`text-xs ${muted}`}>Preview: “{form.emoji ? `${form.emoji} ` : ''}{preview}”</p>
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-md bg-brand-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy} onClick={() => void save()}>
          Save
        </button>
        {status && <span className={`text-xs ${muted}`} role="status">{status}</span>}
      </div>
    </div>
  );
}

interface PeerProfile {
  unit: { displayName: string; emoji: string | null; role: string | null; description: string | null } | null;
  agents: { id: string; name: string; description?: string | null }[];
}

/** Role and agents of an active paired Unit, fetched live. */
export function PeerRole({ peerId, muted }: { peerId: string; muted: string }) {
  const [profile, setProfile] = useState<PeerProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/peers/${peerId}/profile`, { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error();
        setProfile(body.data);
      })
      .catch(() => setFailed(true));
  }, [peerId]);

  if (failed) return <p className={`text-xs ${muted}`}>Role unavailable (Unit offline or older version).</p>;
  if (!profile) return null;
  return (
    <div className="space-y-0.5 text-xs" data-testid={`peer-role-${peerId}`}>
      {profile.unit?.role && <p>{profile.unit.emoji ? `${profile.unit.emoji} ` : ''}Takes care of: {profile.unit.role}</p>}
      {profile.unit?.description && <p className={muted}>{profile.unit.description}</p>}
      {profile.agents.length > 0 && (
        <p className={muted}>
          Agents: {profile.agents.map(agent => (agent.description ? `${agent.name} (${agent.description})` : agent.name)).join(', ')}
        </p>
      )}
    </div>
  );
}
