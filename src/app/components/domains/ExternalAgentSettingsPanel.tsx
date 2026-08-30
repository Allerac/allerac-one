'use client';

// Shared settings widgets for a public-facing external agent's self-service screen
// (e.g. /sales, /openworld — see docs/domains/expose-agent-to-website.md). Each such
// domain's page is UI-less by design otherwise: the bot account it belongs to has no
// access to any other domain, so this is the only place it can configure itself.
//
// Previously each domain copy-pasted its own ModelPicker; RateLimitPanel would have
// become a second copy per domain. Both live here once, parameterized by domainSlug,
// so a third external-agent domain doesn't mean a third copy.

import { useEffect, useState } from 'react';
import * as domainActions from '@/app/actions/domains';
import { MODELS } from '@/app/services/llm/models';
import type { DomainModelSettings } from '@/app/services/domains/domain-model-settings.service';
import type {
  DomainRateLimitSettingsView,
  DomainRateLimitUsage,
  SaveDomainRateLimitInput,
} from '@/app/services/domains/domain-rate-limit-settings.service';

export function ModelPicker({ domainSlug, description, isDark }: { domainSlug: string; description: string; isDark: boolean }) {
  const [settings, setSettings] = useState<DomainModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void domainActions.getDomainModelSettings(domainSlug).then(setSettings);
  }, [domainSlug]);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const text = isDark ? 'text-gray-200' : 'text-gray-800';
  const select = `w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
    isDark ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;

  const changeModel = async (modelId: string) => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    const next: DomainModelSettings = { ...settings, inheritGlobal: false, modelId };
    try {
      await domainActions.saveDomainModelSettings(next);
      setSettings(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save model.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">🤖</span>
        <div>
          <h3 className={`text-sm font-semibold ${text}`}>Model</h3>
          <p className={`text-xs ${muted}`}>{description}</p>
        </div>
      </div>

      {error && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}

      {!settings ? (
        <p className={`text-sm ${muted}`}>Loading…</p>
      ) : (
        <select
          value={settings.modelId ?? ''}
          disabled={saving}
          onChange={e => void changeModel(e.target.value)}
          className={select}
        >
          {!settings.modelId && <option value="">— Select a model —</option>}
          {MODELS.map(model => (
            <option key={model.id} value={model.id}>{model.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h${minutes > 0 ? ` ${minutes}m` : ''}`;
  return `${minutes}m`;
}

export function RateLimitPanel({ domainSlug, isDark }: { domainSlug: string; isDark: boolean }) {
  const [settings, setSettings] = useState<DomainRateLimitSettingsView | null>(null);
  const [usage, setUsage] = useState<DomainRateLimitUsage | null>(null);
  const [dailyRequestsInput, setDailyRequestsInput] = useState('');
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [thresholdsInput, setThresholdsInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadSettings = async () => {
    const [nextSettings, nextUsage] = await Promise.all([
      domainActions.getDomainRateLimitSettings(domainSlug),
      domainActions.getDomainRateLimitUsage(domainSlug),
    ]);
    setSettings(nextSettings);
    setUsage(nextUsage);
    setDailyRequestsInput(nextSettings.dailyRequests != null ? String(nextSettings.dailyRequests) : '');
    // Bot token is never sent back from the server (see domain-rate-limit-settings.service.ts) —
    // the field always starts blank; leaving it blank on save keeps whatever is already stored.
    setBotToken('');
    setChatId(nextSettings.telegramChatId ?? '');
    setThresholdsInput(nextSettings.alertThresholdsPercent.join(', '));
  };

  useEffect(() => {
    void loadSettings();
    const interval = setInterval(() => {
      void domainActions.getDomainRateLimitUsage(domainSlug).then(setUsage);
    }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainSlug]);

  const muted = isDark ? 'text-gray-400' : 'text-gray-500';
  const text = isDark ? 'text-gray-200' : 'text-gray-800';
  const input = `w-full px-3 py-2 border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 ${
    isDark ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;
  const barTrack = isDark ? 'bg-gray-700' : 'bg-gray-200';

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      const dailyRequests = dailyRequestsInput.trim() ? Number.parseInt(dailyRequestsInput, 10) : null;
      if (dailyRequestsInput.trim() && (!Number.isFinite(dailyRequests) || (dailyRequests ?? 0) <= 0)) {
        throw new Error('O limite diário deve ser um número positivo.');
      }
      const alertThresholdsPercent = thresholdsInput
        .split(',')
        .map(part => Number.parseInt(part.trim(), 10))
        .filter(value => Number.isInteger(value) && value > 0 && value <= 100);

      const next: SaveDomainRateLimitInput = {
        domainSlug,
        dailyRequests,
        dailyWindowSeconds: settings?.dailyWindowSeconds ?? null,
        // Omit entirely when blank so the server keeps whatever token is already stored.
        ...(botToken.trim() ? { telegramBotToken: botToken.trim() } : {}),
        telegramChatId: chatId.trim() || null,
        alertThresholdsPercent: alertThresholdsPercent.length > 0 ? alertThresholdsPercent : [50, 90],
      };
      await domainActions.saveDomainRateLimitSettings(next);
      setStatus('Configurações salvas.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rate limit settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleClearTelegram = async () => {
    setClearing(true);
    setError(null);
    setStatus(null);
    try {
      await domainActions.clearDomainRateLimitTelegramConfig(domainSlug);
      setStatus('Configuração do Telegram removida.');
      await loadSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear Telegram config.');
    } finally {
      setClearing(false);
    }
  };

  const handleTestAlert = async () => {
    setTesting(true);
    setError(null);
    setStatus(null);
    try {
      // Test whatever is currently typed, even if not saved yet — falls back
      // to the saved values (in the action) for any field left blank here.
      await domainActions.sendTestRateLimitAlert(domainSlug, {
        telegramBotToken: botToken.trim() || undefined,
        telegramChatId: chatId.trim() || undefined,
      });
      setStatus('Alerta de teste enviado — confira o Telegram.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send test alert.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">📊</span>
        <div>
          <h3 className={`text-sm font-semibold ${text}`}>Rate Limit</h3>
          <p className={`text-xs ${muted}`}>Limite diário de requisições e alertas de uso.</p>
        </div>
      </div>

      {error && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${isDark ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-700'}`}>
          {error}
        </div>
      )}
      {status && (
        <div className={`mb-3 p-2.5 rounded-md text-sm ${isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-50 text-green-700'}`}>
          {status}
        </div>
      )}

      {usage && (
        <div className="mb-4">
          <div className={`flex justify-between text-xs mb-1 ${muted}`}>
            <span>{usage.used} / {usage.limit} requisições hoje ({usage.usedPercent}%)</span>
            <span>reseta em {formatDuration(usage.resetSeconds)}</span>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${barTrack}`}>
            <div
              className={`h-full rounded-full ${usage.usedPercent >= 90 ? 'bg-red-500' : usage.usedPercent >= 50 ? 'bg-amber-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(100, usage.usedPercent)}%` }}
            />
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className={`block text-xs mb-1 ${muted}`}>Limite diário (vazio = usar padrão global)</label>
          <input
            type="number"
            min={1}
            className={input}
            placeholder="300"
            value={dailyRequestsInput}
            onChange={e => setDailyRequestsInput(e.target.value)}
          />
        </div>

        <div className={`pt-2 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between mb-2">
            <p className={`text-xs font-medium ${text}`}>Alerta via Telegram</p>
            {settings?.telegramBotTokenConfigured && (
              <button
                onClick={() => void handleClearTelegram()}
                disabled={clearing}
                className={`text-xs underline ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800'} disabled:opacity-50`}
              >
                {clearing ? 'Removendo…' : 'Remover'}
              </button>
            )}
          </div>

          <details className={`mb-3 text-xs rounded-md ${isDark ? 'bg-gray-900/40' : 'bg-white'} border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <summary className={`cursor-pointer select-none px-2.5 py-1.5 font-medium ${text}`}>
              Como conseguir o bot token e o Chat ID?
            </summary>
            <ol className={`px-2.5 pb-2.5 pt-1 space-y-1.5 list-decimal list-inside ${muted}`}>
              <li>
                Abra o{' '}
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">
                  @BotFather
                </a>{' '}
                no Telegram, envie <code>/newbot</code> e siga as instruções. Ao final ele te dá o{' '}
                <strong>bot token</strong> — cole no campo acima.
              </li>
              <li>
                Abra uma conversa com o bot que você acabou de criar e mande qualquer mensagem pra
                ele (ex: &quot;oi&quot;). Se quiser que o alerta caia num grupo, adicione o bot ao
                grupo e mande a mensagem lá.
              </li>
              <li>
                No navegador, acesse{' '}
                <code className="break-all">https://api.telegram.org/bot&lt;SEU_TOKEN&gt;/getUpdates</code>{' '}
                (troque <code>&lt;SEU_TOKEN&gt;</code> pelo token do passo 1).
              </li>
              <li>
                Procure por <code>&quot;chat&quot;:&#123;&quot;id&quot;: ...&#125;</code> na resposta —
                esse número é o <strong>Chat ID</strong>. Numa conversa privada é o mesmo número do
                seu usuário do Telegram; num grupo é um número diferente (geralmente negativo).
              </li>
              <li>
                Cole esse número no campo Chat ID abaixo e use &quot;Enviar alerta de teste&quot;
                para confirmar — não precisa clicar em Salvar antes, o teste usa o que estiver
                digitado nos campos. Depois de confirmar, clique em Salvar para manter a configuração.
              </li>
            </ol>
          </details>

          <div className="space-y-2">
            <input
              type="password"
              className={input}
              placeholder={settings?.telegramBotTokenConfigured ? 'Bot token configurado — deixe em branco para manter' : 'Bot token'}
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
            />
            <input
              type="text"
              className={input}
              placeholder="Chat ID"
              value={chatId}
              onChange={e => setChatId(e.target.value)}
            />
            <div>
              <label className={`block text-xs mb-1 ${muted}`}>Avisar quando atingir (%), separado por vírgula</label>
              <input
                type="text"
                className={input}
                placeholder="50, 90"
                value={thresholdsInput}
                onChange={e => setThresholdsInput(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className={`text-sm px-3 py-1.5 rounded-md ${isDark ? 'bg-brand-600 text-white hover:bg-brand-500' : 'bg-brand-600 text-white hover:bg-brand-700'} disabled:opacity-50`}
          >
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
          <button
            onClick={() => void handleTestAlert()}
            disabled={testing}
            className={`text-sm px-3 py-1.5 rounded-md ${isDark ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-200 text-gray-800 hover:bg-gray-300'} disabled:opacity-50`}
          >
            {testing ? 'Enviando…' : 'Enviar alerta de teste'}
          </button>
        </div>
      </div>
    </div>
  );
}
