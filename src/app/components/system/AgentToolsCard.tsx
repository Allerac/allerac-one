'use client';

import { useEffect, useState } from 'react';

// Admin-only tool settings of this Unit's agent (phase 3a): which modules,
// tools and skills the chat agent may use. Capped by ALLERAC_MODULES; local
// only, never shared with paired Units.

interface Capability {
  id: string;
  label: string;
  kind: 'module' | 'core';
  tools: string[];
  skills: string[];
  defaultEnabled: boolean;
  enabled: boolean;
}

interface Settings {
  modules: Record<string, boolean>;
  tools: Record<string, boolean>;
  skills: Record<string, boolean>;
}

interface ToolsResponse {
  settings: Settings;
  capabilities: Capability[];
}

interface Props {
  isDarkMode: boolean;
}

export default function AgentToolsCard({ isDarkMode }: Props) {
  const [data, setData] = useState<ToolsResponse | null>(null);
  const [settings, setSettings] = useState<Settings>({ modules: {}, tools: {}, skills: {} });
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const apply = (next: ToolsResponse) => {
    setData(next);
    setSettings(next.settings);
  };

  useEffect(() => {
    fetch('/api/v1/unit/agent-tools', { cache: 'no-store' })
      .then(async response => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !Array.isArray(body?.data?.capabilities)) {
          throw new Error(body?.error?.message || 'Failed to load the agent tools.');
        }
        apply(body.data);
      })
      .catch(error => setStatus(error instanceof Error ? error.message : 'Failed to load the agent tools.'));
  }, []);

  const save = async () => {
    setBusy(true);
    setStatus(null);
    try {
      const response = await fetch('/api/v1/unit/agent-tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
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

  if (!data) {
    return (
      <div className={`rounded-lg border p-4 ${panel}`} data-testid="agent-tools-card">
        <h3>Agent tools</h3>
        <p className={`text-sm ${muted}`}>{status ?? 'Loading…'}</p>
      </div>
    );
  }

  const capabilityOn = (capability: Capability) => settings.modules[capability.id] ?? capability.defaultEnabled;
  const toggle = (key: keyof Settings, name: string, value: boolean) =>
    setSettings({ ...settings, [key]: { ...settings[key], [name]: value } });

  return (
    <div className={`rounded-lg border p-4 space-y-3 ${panel}`} data-testid="agent-tools-card">
      <div>
        <h3>Agent tools</h3>
        <p className={`text-xs ${muted}`}>
          What the agent can use in chat. Modules turned off by ALLERAC_MODULES are not listed. Keep heavy
          modules off unless you need them: every tool makes the prompt larger. These settings stay on this Unit.
        </p>
      </div>
      {data.capabilities.map(capability => {
        const on = capabilityOn(capability);
        return (
          <div key={capability.id} className="space-y-1">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" aria-label={`Enable ${capability.label}`} checked={on}
                onChange={event => toggle('modules', capability.id, event.target.checked)} />
              {capability.label}
              <span className={`text-xs font-normal ${muted}`}>{capability.kind === 'module' ? 'module' : 'core'}</span>
            </label>
            {on && (
              <div className="ml-6 flex flex-wrap gap-x-4 gap-y-1">
                {capability.tools.map(tool => (
                  <label key={tool} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" aria-label={`Tool ${tool}`} checked={settings.tools[tool] !== false}
                      onChange={event => toggle('tools', tool, event.target.checked)} />
                    <code>{tool}</code>
                  </label>
                ))}
                {capability.skills.map(skill => (
                  <label key={`skill-${skill}`} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" aria-label={`Skill ${skill}`} checked={settings.skills[skill] !== false}
                      onChange={event => toggle('skills', skill, event.target.checked)} />
                    skill <code>{skill}</code>
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex items-center gap-3">
        <button type="button" className="rounded-md bg-brand-900 px-3 py-2 text-sm text-white disabled:opacity-50"
          disabled={busy} onClick={() => void save()}>
          Save tools
        </button>
        {status && <span className={`text-xs ${muted}`} role="status">{status}</span>}
      </div>
    </div>
  );
}
