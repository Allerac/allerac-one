'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import DomainLayout from '@/app/components/layout/DomainLayout';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

type Capability = {
  configured: boolean;
  available: boolean;
  connected?: boolean;
};

type Capabilities = {
  llm?: {
    anthropic?: Capability;
    github?: Capability;
    gemini?: Capability;
    ollama?: Capability;
  };
  search?: {
    tavily?: Capability;
  };
  speech?: {
    openai?: Capability;
  };
};

type RobotSpeechSettings = {
  voice: string;
  speed: number;
  style: string;
  voices: string[];
  tools?: RobotTool[];
  defaultSkill?: {
    id: string;
    name: string;
    displayName: string;
  } | null;
};

type RobotTool = {
  name: string;
  label: string;
  description: string;
  group: string;
  runtimeAvailable: boolean;
};

const VOICE_OPTIONS: Array<{ id: string; label: string; tone: string }> = [
  { id: 'onyx', label: 'Onyx', tone: 'Deep / masculine' },
  { id: 'echo', label: 'Echo', tone: 'Warm / masculine' },
  { id: 'ash', label: 'Ash', tone: 'Calm / low' },
  { id: 'cedar', label: 'Cedar', tone: 'Grounded / natural' },
  { id: 'marin', label: 'Marin', tone: 'Clear / natural' },
  { id: 'alloy', label: 'Alloy', tone: 'Neutral' },
  { id: 'sage', label: 'Sage', tone: 'Thoughtful' },
  { id: 'fable', label: 'Fable', tone: 'Expressive' },
  { id: 'verse', label: 'Verse', tone: 'Rhythmic' },
  { id: 'coral', label: 'Coral', tone: 'Bright / feminine' },
  { id: 'nova', label: 'Nova', tone: 'Friendly / feminine' },
  { id: 'shimmer', label: 'Shimmer', tone: 'Gentle / feminine' },
  { id: 'ballad', label: 'Ballad', tone: 'Melodic' },
];

export default function RobotClient({ userId, userName, userEmail, isAdmin, defaultSkillName }: Props) {
  return (
    <DomainLayout
      userId={userId}
      userName={userName}
      userEmail={userEmail}
      isAdmin={isAdmin}
      domainId="robot-assistant"
      defaultSkillName={defaultSkillName}
    >
      <RobotPanel defaultSkillName={defaultSkillName} isAdmin={isAdmin} />
    </DomainLayout>
  );
}

function RobotPanel({ defaultSkillName, isAdmin }: { defaultSkillName?: string; isAdmin: boolean }) {
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [speechSettings, setSpeechSettings] = useState<RobotSpeechSettings>({
    voice: 'onyx',
    speed: 1.15,
    style: 'Speak naturally as a warm male robot assistant. Keep the delivery conversational, clear, and calm.',
    voices: VOICE_OPTIONS.map(option => option.id),
  });
  const [loading, setLoading] = useState(true);
  const [voiceStatus, setVoiceStatus] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [savingVoice, setSavingVoice] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch('/api/v1/capabilities').then(r => r.ok ? r.json() : null),
      fetch('/api/v1/robot/settings').then(r => r.ok ? r.json() : null),
    ])
      .then(([capabilityData, settingsData]) => {
        setCapabilities(capabilityData?.data?.capabilities ?? null);
        if (settingsData?.data) setSpeechSettings(settingsData.data);
      })
      .catch(() => setCapabilities(null))
      .finally(() => setLoading(false));
  }, []);

  const saveVoice = async () => {
    setSavingVoice(true);
    setVoiceMessage('');
    try {
      const response = await fetch('/api/v1/robot/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: speechSettings.voice,
          speed: speechSettings.speed,
          style: speechSettings.style,
        }),
      });
      if (!response.ok) throw new Error(`Settings API returned ${response.status}`);
      setVoiceStatus('ok');
      setVoiceMessage('Voice settings saved.');
    } catch (error: any) {
      setVoiceStatus('error');
      setVoiceMessage(error?.message || 'Could not save voice settings.');
    } finally {
      setSavingVoice(false);
    }
  };

  const testVoice = async () => {
    setVoiceStatus('testing');
    setVoiceMessage('Generating cloud voice...');
    try {
      const response = await fetch('/api/v1/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'Allerac Robot voice test. Estou falando pela voz cloud.',
          voice: speechSettings.voice,
          speed: speechSettings.speed,
          instructions: speechSettings.style,
        }),
      });
      if (!response.ok) throw new Error(`Speech API returned ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setVoiceStatus('ok');
      setVoiceMessage('Cloud voice is working.');
    } catch (error: any) {
      setVoiceStatus('error');
      setVoiceMessage(error?.message || 'Cloud voice failed.');
    }
  };

  const speech = capabilities?.speech?.openai;
  const anthropic = capabilities?.llm?.anthropic;
  const tavily = capabilities?.search?.tavily;

  return (
    <main className="h-full overflow-auto bg-gray-950 text-gray-100">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-col gap-3 border-b border-gray-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-cyan-300">Robot Assistant</p>
            <h1 className="mt-1 text-2xl font-semibold text-white">Robot Control</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-400">
              Configure the robot client, voice pipeline, allowed tools, and runtime defaults for the physical assistant.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin" className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-900">
              Admin keys
            </Link>
            <Link href="/hub" className="rounded-md border border-gray-700 px-3 py-2 text-sm text-gray-200 hover:bg-gray-900">
              Hub
            </Link>
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <StatusCard title="Control API" status="Ready" detail="Android client uses /api/v1 conversations and speech." tone="ok" />
          <StatusCard
            title="Cloud Voice"
            status={loading ? 'Checking' : speech?.available ? 'Ready' : 'Fallback'}
            detail={speech?.available ? 'OpenAI TTS configured.' : 'Android TTS fallback will be used.'}
            tone={speech?.available ? 'ok' : 'warn'}
          />
          <StatusCard
            title="Web Search"
            status={loading ? 'Checking' : tavily?.available ? 'Ready' : 'Missing'}
            detail={tavily?.available ? 'search_web is available to the robot skill.' : 'Configure Tavily for internet search.'}
            tone={tavily?.available ? 'ok' : 'warn'}
          />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <Panel title="Runtime">
            <SettingRow label="Domain" value="robot-assistant" />
            <SettingRow label="Default skill" value={defaultSkillName || 'robot-assistant'} />
            <SettingRow label="Provider" value="anthropic" />
            <SettingRow label="Model" value="claude-haiku-4-5" />
            <SettingRow label="LLM status" value={anthropic?.available ? 'Anthropic configured' : 'Anthropic missing'} />
            <SettingRow label="Local base URL" value="http://127.0.0.1:8080 through adb reverse" />
          </Panel>

          <Panel title="Voice">
            <SettingRow label="Provider" value="OpenAI Speech" />
            <SettingRow label="Model" value="gpt-4o-mini-tts" />
            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Voice</span>
              <select
                value={speechSettings.voice}
                onChange={event => setSpeechSettings(prev => ({ ...prev, voice: event.target.value }))}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              >
                {VOICE_OPTIONS.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.label} - {option.tone}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block">
              <span className="flex items-center justify-between text-xs font-medium uppercase tracking-wider text-gray-500">
                <span>Speed</span>
                <span>{speechSettings.speed.toFixed(2)}</span>
              </span>
              <input
                type="range"
                min="0.75"
                max="1.5"
                step="0.05"
                value={speechSettings.speed}
                onChange={event => setSpeechSettings(prev => ({ ...prev, speed: Number(event.target.value) }))}
                className="mt-2 w-full"
              />
            </label>
            <label className="mt-3 block">
              <span className="text-xs font-medium uppercase tracking-wider text-gray-500">Style</span>
              <textarea
                value={speechSettings.style}
                onChange={event => setSpeechSettings(prev => ({ ...prev, style: event.target.value }))}
                rows={4}
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100"
              />
            </label>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={saveVoice}
                disabled={savingVoice}
                className="rounded-md border border-gray-700 px-3 py-2 text-sm font-semibold text-gray-100 hover:bg-gray-800 disabled:opacity-60"
              >
                {savingVoice ? 'Saving...' : 'Save voice'}
              </button>
              <button
                type="button"
                onClick={testVoice}
                disabled={voiceStatus === 'testing'}
                className="rounded-md bg-cyan-300 px-3 py-2 text-sm font-semibold text-gray-950 hover:bg-cyan-200 disabled:opacity-60"
              >
                {voiceStatus === 'testing' ? 'Testing...' : 'Test voice'}
              </button>
            </div>
            {voiceMessage && (
              <p className={`mt-2 text-xs ${voiceStatus === 'error' ? 'text-red-300' : 'text-gray-400'}`}>
                {voiceMessage}
              </p>
            )}
          </Panel>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Allowed Tools">
            <ToolList tools={speechSettings.tools || []} loading={loading} />
          </Panel>

          <Panel title="Device Flow">
            <ol className="space-y-3 text-sm text-gray-300">
              <li><Step n="1" text="Tap the robot face to start or stop listening." /></li>
              <li><Step n="2" text="The app sends speech text to the Control API." /></li>
              <li><Step n="3" text="Allerac answers in the robot-assistant domain with restricted tools." /></li>
              <li><Step n="4" text="The app requests cloud speech and falls back to Android TTS if needed." /></li>
            </ol>
          </Panel>
        </section>

        {isAdmin && (
          <p className="text-xs text-gray-500">
            System API keys stay in Admin. Robot behavior and device-facing defaults live here.
          </p>
        )}
      </div>
    </main>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-gray-300">{title}</h2>
      {children}
    </section>
  );
}

function StatusCard({ title, status, detail, tone }: { title: string; status: string; detail: string; tone: 'ok' | 'warn' }) {
  const color = tone === 'ok' ? 'bg-emerald-400' : 'bg-amber-300';
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-gray-300">{title}</p>
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      </div>
      <p className="mt-3 text-xl font-semibold text-white">{status}</p>
      <p className="mt-1 text-xs text-gray-400">{detail}</p>
    </div>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-gray-800 py-2 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-right text-sm font-medium text-gray-100">{value}</span>
    </div>
  );
}

function ToolList({ tools, loading }: { tools: RobotTool[]; loading: boolean }) {
  if (loading) {
    return <p className="text-sm text-gray-400">Loading tools...</p>;
  }

  if (tools.length === 0) {
    return <p className="text-sm text-gray-400">No tools are enabled for the robot skill.</p>;
  }

  const groupedTools = tools.reduce<Record<string, RobotTool[]>>((groups, tool) => {
    const group = tool.group || 'Other';
    groups[group] = groups[group] || [];
    groups[group].push(tool);
    return groups;
  }, {});

  return (
    <div className="max-h-72 space-y-4 overflow-y-auto pr-1">
      {Object.entries(groupedTools).map(([group, groupTools]) => (
        <div key={group}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">{group}</p>
          <div className="flex flex-wrap gap-2">
            {groupTools.map(tool => (
              <div
                key={tool.name}
                title={tool.runtimeAvailable ? tool.description : `${tool.description} - runtime config needed`}
                className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                  tool.runtimeAvailable
                    ? 'border-gray-800 bg-gray-950 text-cyan-200'
                    : 'border-amber-300/20 bg-amber-300/10 text-amber-200'
                }`}
              >
                <span className="font-mono text-xs">{tool.name}</span>
                {!tool.runtimeAvailable && (
                  <span className="text-[10px] font-semibold uppercase tracking-wider">
                    Config
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <span className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-semibold text-cyan-200">{n}</span>
      <span>{text}</span>
    </span>
  );
}
