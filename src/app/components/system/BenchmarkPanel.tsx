'use client';

import { useState, useEffect } from 'react';
import { Model } from '@/app/types';
import { getBenchmarkHistory, clearBenchmarkHistory, BenchmarkRun } from '@/app/actions/benchmark';

interface TestState {
  status: 'pending' | 'running' | 'done' | 'error';
  ttft_ms?: number | null;
  total_ms?: number;
  chars?: number;
  tokens?: number | null;
  tps?: number | null;
  error?: string;
}

const TESTS = [
  { name: 'latency',   label: 'Latency',          icon: '⚡', description: 'Time to first token' },
  { name: 'short_gen', label: 'Short Generation',  icon: '📝', description: 'Brief structured output' },
  { name: 'reasoning', label: 'Reasoning',         icon: '🧠', description: 'Simple math problem' },
  { name: 'long_gen',  label: 'Long Generation',   icon: '📖', description: 'Sustained throughput' },
];

interface BenchmarkPanelProps {
  isDarkMode: boolean;
  userId?: string;
  MODELS: Model[];
  selectedModel: string;
}

function fmt(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}

function tpsColor(tps: number | null | undefined, isDark: boolean): string {
  if (tps == null) return isDark ? 'text-gray-500' : 'text-gray-400';
  if (tps >= 15) return 'text-green-500';
  if (tps >= 7)  return 'text-yellow-500';
  return 'text-red-500';
}

export default function BenchmarkPanel({ isDarkMode, userId, MODELS, selectedModel }: BenchmarkPanelProps) {
  const [benchModel, setBenchModel] = useState(selectedModel);
  const [isRunning, setIsRunning] = useState(false);
  const [isWarmingUp, setIsWarmingUp] = useState(false);
  const [tests, setTests] = useState<Record<string, TestState>>({});
  const [history, setHistory] = useState<BenchmarkRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [lastRunId, setLastRunId] = useState<string | null>(null);
  const [currentTestIdx, setCurrentTestIdx] = useState(0);
  const [copiedRunId, setCopiedRunId] = useState<string | null>(null);

  useEffect(() => {
    setBenchModel(selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    if (!userId) return;
    getBenchmarkHistory(userId).then(h => {
      setHistory(h);
      setHistoryLoading(false);
    });
  }, [userId]);

  const currentModelConfig = MODELS.find(m => m.id === benchModel);

  const runBenchmark = async () => {
    if (isRunning || !currentModelConfig) return;

    // Reset test states
    const initial: Record<string, TestState> = {};
    TESTS.forEach(t => { initial[t.name] = { status: 'pending' }; });
    setTests(initial);
    setIsRunning(true);
    setIsWarmingUp(false);
    setLastRunId(null);
    setCurrentTestIdx(0);

    try {
      const response = await fetch('/api/benchmark', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: benchModel, provider: currentModelConfig.provider }),
      });

      if (!response.ok || !response.body) throw new Error('Failed to start benchmark');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'warmup_start') {
            setIsWarmingUp(true);
          } else if (event.type === 'warmup_done') {
            setIsWarmingUp(false);
          } else if (event.type === 'test_start') {
            setIsWarmingUp(false);
            const idx = TESTS.findIndex(t => t.name === event.name);
            if (idx >= 0) setCurrentTestIdx(idx);
            setTests(prev => ({ ...prev, [event.name]: { status: 'running' } }));
          } else if (event.type === 'test_done') {
            setTests(prev => ({
              ...prev,
              [event.name]: {
                status: 'done',
                ttft_ms: event.ttft_ms,
                total_ms: event.total_ms,
                chars: event.chars,
                tokens: event.tokens,
                tps: event.tps,
              },
            }));
          } else if (event.type === 'test_error') {
            setTests(prev => ({ ...prev, [event.name]: { status: 'error', error: event.message } }));
          } else if (event.type === 'done') {
            setLastRunId(event.runId);
            // Refresh history
            if (userId) {
              const h = await getBenchmarkHistory(userId);
              setHistory(h);
            }
          } else if (event.type === 'error') {
            console.error('[Benchmark]', event.message);
          }
        }
      }
    } catch (err: any) {
      console.error('[Benchmark] Error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const copyRunResults = async (run: BenchmarkRun) => {
    const modelName = MODELS.find(m => m.id === run.model)?.name || run.model;
    const date = new Date(run.created_at);
    const lines = [
      `Benchmark: ${modelName} (${run.provider})`,
      `Date: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      '',
      ...run.tests.map(t => {
        const ttft = t.ttft_ms != null ? fmt(t.ttft_ms) : '—';
        const total = fmt(t.total_ms);
        const tps = t.tokens_per_second != null ? `${Number(t.tokens_per_second).toFixed(1)} tok/s` : '—';
        return `${t.prompt_label}: TTFT ${ttft}, Total ${total}, ${tps}`;
      }),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setCopiedRunId(run.run_id);
    setTimeout(() => setCopiedRunId(null), 2000);
  };

  const handleClearHistory = async () => {
    if (!userId) return;
    await clearBenchmarkHistory(userId);
    setHistory([]);
    setTests({});
    setLastRunId(null);
  };

  const border = isDarkMode ? 'border-gray-700' : 'border-gray-200';
  const cardBg = isDarkMode ? 'bg-gray-800' : 'bg-gray-50';
  const textMuted = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const textPrimary = isDarkMode ? 'text-gray-100' : 'text-gray-900';

  const hasResults = Object.keys(tests).length > 0;

  return (
    <div className="space-y-6 p-4 sm:p-6">

      {/* Header — model selector + run button */}
      <div className={`rounded-xl border p-4 ${cardBg} ${border}`}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex-1">
            <label className={`block text-xs font-medium mb-1 ${textMuted}`}>Model to benchmark</label>
            <select
              value={benchModel}
              onChange={e => setBenchModel(e.target.value)}
              disabled={isRunning}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDarkMode
                  ? 'bg-gray-900 border-gray-600 text-gray-100'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              {MODELS.map(m => (
                <option key={m.id} value={m.id}>
                  {m.icon} {m.name} ({m.provider})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={runBenchmark}
            disabled={isRunning}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              isRunning
                ? 'bg-blue-800 text-blue-300 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-blue-300 border-t-transparent rounded-full animate-spin" />
                {isWarmingUp ? 'Warming up…' : `Test ${currentTestIdx + 1}/${TESTS.length}…`}
              </span>
            ) : '▶ Run Benchmark'}
          </button>
        </div>

        <p className={`text-xs mt-3 ${textMuted}`}>
          4 standardized prompts · measures TTFT, total time, and tokens/s · results saved for comparison
        </p>
        {isRunning && (
          <div className={`mt-3 flex items-center gap-2 text-xs text-blue-400`}>
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse inline-block" />
            {isWarmingUp
              ? 'Warming up model (loading into memory)…'
              : `Running test ${currentTestIdx + 1} of ${TESTS.length} — ${TESTS[currentTestIdx]?.label}`}
          </div>
        )}
      </div>

      {/* Test cards */}
      {hasResults && (
        <div>
          <h3 className={`text-sm font-semibold mb-3 ${textPrimary}`}>
            Current Run — {currentModelConfig?.name}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {TESTS.map(test => {
              const state = tests[test.name];
              if (!state) return null;
              return (
                <div key={test.name} className={`rounded-xl border p-4 ${cardBg} ${border}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{test.icon}</span>
                      <div>
                        <div className={`text-sm font-medium ${textPrimary}`}>{test.label}</div>
                        <div className={`text-xs ${textMuted}`}>{test.description}</div>
                      </div>
                    </div>
                    <div>
                      {state.status === 'pending' && (
                        isRunning
                          ? <span className="w-2 h-2 rounded-full bg-gray-500 animate-pulse inline-block" />
                          : <span className={`text-xs ${textMuted}`}>—</span>
                      )}
                      {state.status === 'running' && (
                        <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                      )}
                      {state.status === 'done' && <span className="text-green-500 text-sm">✓</span>}
                      {state.status === 'error' && <span className="text-red-500 text-sm">✗</span>}
                    </div>
                  </div>

                  {state.status === 'done' && (
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className={`text-xs ${textMuted}`}>TTFT</div>
                        <div className={`text-sm font-mono font-medium ${textPrimary}`}>
                          {state.ttft_ms != null ? fmt(state.ttft_ms) : '—'}
                        </div>
                      </div>
                      <div>
                        <div className={`text-xs ${textMuted}`}>Total</div>
                        <div className={`text-sm font-mono font-medium ${textPrimary}`}>
                          {state.total_ms != null ? fmt(state.total_ms) : '—'}
                        </div>
                      </div>
                      <div>
                        <div className={`text-xs ${textMuted}`}>Tokens/s</div>
                        <div className={`text-sm font-mono font-medium ${tpsColor(state.tps, isDarkMode)}`}>
                          {state.tps != null ? state.tps.toFixed(1) : '—'}
                        </div>
                      </div>
                    </div>
                  )}

                  {state.status === 'error' && (
                    <p className="text-xs text-red-400 mt-1">{state.error}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-sm font-semibold ${textPrimary}`}>History</h3>
          {history.length > 0 && (
            <button
              onClick={handleClearHistory}
              className={`text-xs ${textMuted} hover:text-red-400 transition-colors`}
            >
              Clear
            </button>
          )}
        </div>

        {historyLoading ? (
          <div className={`text-xs ${textMuted}`}>Loading…</div>
        ) : history.length === 0 ? (
          <div className={`text-xs ${textMuted}`}>No benchmark runs yet. Run your first benchmark above.</div>
        ) : (
          <div className="space-y-4">
            {history.map((run, runIdx) => (
              <div key={run.run_id} className={`rounded-xl border ${border} overflow-hidden`}>
                <div className={`px-4 py-2 flex items-center justify-between text-xs ${
                  isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'
                } border-b`}>
                  <span className={`font-medium ${textPrimary}`}>
                    {MODELS.find(m => m.id === run.model)?.icon || '🤖'} {run.model}
                    {runIdx === 0 && lastRunId === run.run_id && (
                      <span className="ml-2 text-blue-400">· latest</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    <span className={textMuted}>
                      {new Date(run.created_at).toLocaleDateString()} {new Date(run.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <button
                      onClick={() => copyRunResults(run)}
                      className={`flex items-center gap-1 transition-colors ${copiedRunId === run.run_id ? 'text-green-400' : `${textMuted} hover:text-blue-400`}`}
                      title="Copy results"
                    >
                      {copiedRunId === run.run_id ? (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>
                  </div>
                </div>
                <div className={isDarkMode ? 'bg-gray-900' : 'bg-white'}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className={`border-b ${border}`}>
                        <th className={`px-4 py-2 text-left font-medium ${textMuted}`}>Test</th>
                        <th className={`px-4 py-2 text-right font-medium ${textMuted}`}>TTFT</th>
                        <th className={`px-4 py-2 text-right font-medium ${textMuted}`}>Total</th>
                        <th className={`px-4 py-2 text-right font-medium ${textMuted}`}>Tokens/s</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.tests.map(test => (
                        <tr key={test.prompt_name} className={`border-b last:border-0 ${border}`}>
                          <td className={`px-4 py-2 ${textPrimary}`}>
                            {TESTS.find(t => t.name === test.prompt_name)?.icon} {test.prompt_label}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${textMuted}`}>
                            {test.ttft_ms != null ? fmt(test.ttft_ms) : '—'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${textPrimary}`}>
                            {fmt(test.total_ms)}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${tpsColor(test.tokens_per_second, isDarkMode)}`}>
                            {test.tokens_per_second != null ? Number(test.tokens_per_second).toFixed(1) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
