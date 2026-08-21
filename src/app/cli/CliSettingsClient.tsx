'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import { MODELS } from '@/app/services/llm/models';
import { saveCliPreferences } from '@/app/actions/user';

interface Props {
  domains: string[];
  cliDomainSlug: string | null;
  cliModelId: string | null;
}

function labelFor(slug: string): string {
  return slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function CliSettingsClient({ domains, cliDomainSlug, cliModelId }: Props) {
  const router = useRouter();
  const { isDark: d } = useTheme();
  const [domainSlug, setDomainSlug] = useState(cliDomainSlug ?? domains[0] ?? 'chat');
  const [modelId, setModelId] = useState(cliModelId ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const leave = () => {
    if (window.history.length > 1) { router.back(); return; }
    router.push('/');
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    await saveCliPreferences(domainSlug || null, modelId || null);
    setSaving(false);
    setSaved(true);
  };

  const inputCls = `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    d ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;
  const cardCls = `rounded-lg border p-4 sm:p-5 ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`;

  return (
    <div className={`min-h-screen ${d ? 'bg-gray-950' : 'bg-gray-100'}`}>
      <div className={`px-4 py-3 border-b flex items-center justify-between ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">⌨️</span>
          <h1 className={`text-base font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>CLI Settings</h1>
        </div>
        <button
          onClick={leave}
          className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="max-w-xl mx-auto p-4 sm:p-6 flex flex-col gap-5">
        <p className={`text-sm ${d ? 'text-gray-400' : 'text-gray-500'}`}>
          Defaults used by the terminal CLI (<code className={d ? 'text-gray-300' : 'text-gray-700'}>scripts/allerac-chat.mjs</code>)
          when you run it against this Allerac instance. Fetched automatically via your API key — no
          env vars needed for these two, though <code className={d ? 'text-gray-300' : 'text-gray-700'}>ALLERAC_DOMAIN</code>/
          <code className={d ? 'text-gray-300' : 'text-gray-700'}>ALLERAC_MODEL</code> env vars still override them per run.
        </p>

        <div className={`${cardCls} flex flex-col gap-4`}>
          <div className="flex flex-col gap-2">
            <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Default domain</label>
            <select value={domainSlug} onChange={e => setDomainSlug(e.target.value)} className={inputCls}>
              {domains.map(slug => <option key={slug} value={slug}>{labelFor(slug)}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Default model</label>
            <select value={modelId} onChange={e => setModelId(e.target.value)} className={inputCls}>
              <option value="">— Use the domain&apos;s configured model —</option>
              {MODELS.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
            </select>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
          >
            {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>

        <div className={`${cardCls} flex flex-col gap-3`}>
          <h2 className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Quick start</h2>
          <ol className={`text-sm list-decimal list-inside flex flex-col gap-1.5 ${d ? 'text-gray-300' : 'text-gray-700'}`}>
            <li>
              Generate an API key in your account settings (gear icon → <strong>API Access</strong>) with the
              <code className={`mx-1 ${d ? 'text-gray-300' : 'text-gray-700'}`}>chat:read</code> and
              <code className={`mx-1 ${d ? 'text-gray-300' : 'text-gray-700'}`}>chat:write</code> scopes.
            </li>
            <li>Save your defaults above.</li>
            <li>Run the CLI from the project root on your machine:</li>
          </ol>
          <pre className={`text-xs p-3 rounded-lg overflow-x-auto ${d ? 'bg-black text-gray-200 border border-gray-700' : 'bg-gray-50 text-gray-800 border border-gray-200'}`}>
{`$env:ALLERAC_API_KEY="allerac_xxx..."
node scripts/allerac-chat.mjs`}
          </pre>
        </div>
      </div>
    </div>
  );
}
