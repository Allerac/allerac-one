'use client';

import { useEffect, useMemo, useState } from 'react';

interface ModelAvailability {
  id: string;
  installed: boolean;
}

interface BenchmarkResult {
  model: string;
  dimensions?: number;
  firstRequestMs?: number;
  warmMs?: number;
  retrievalCorrect?: number;
  retrievalTotal?: number;
  batchMs?: number;
  batchPerItemMs?: number;
  error?: string;
}

interface BenchmarkRun {
  id: string;
  createdAt: string;
  results: BenchmarkResult[];
}

const HISTORY_KEY = 'allerac_embedding_benchmark_history_v1';

function formatMs(value: number | undefined): string {
  if (value == null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`;
}

function scoreClass(result: BenchmarkResult): string {
  if (!result.retrievalTotal) return 'text-slate-400';
  const ratio = (result.retrievalCorrect || 0) / result.retrievalTotal;
  if (ratio === 1) return 'text-emerald-400';
  if (ratio >= 0.8) return 'text-amber-400';
  return 'text-red-400';
}

export function EmbeddingBenchmark() {
  const [models, setModels] = useState<ModelAvailability[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<BenchmarkRun[]>([]);
  const [loadingModels, setLoadingModels] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') as BenchmarkRun[];
      if (Array.isArray(saved)) setHistory(saved.slice(0, 10));
    } catch {
      localStorage.removeItem(HISTORY_KEY);
    }

    fetch('/api/benchmark/embeddings')
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error?.message || 'Failed to load embedding models');
        const available = body.data.models as ModelAvailability[];
        setModels(available);
        setSelected(available.filter((model) => model.installed).map((model) => model.id));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setLoadingModels(false));
  }, []);

  const canRun = useMemo(
    () => selected.length > 0 && selected.length <= 3 && !running,
    [selected, running],
  );

  const toggleModel = (model: string) => {
    setSelected((current) => (
      current.includes(model)
        ? current.filter((item) => item !== model)
        : [...current, model].slice(0, 3)
    ));
  };

  const run = async () => {
    if (!canRun) return;
    setRunning(true);
    setError('');
    try {
      const response = await fetch('/api/benchmark/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models: selected }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.error?.message || body?.error || `Benchmark failed (${response.status})`);
      }
      const benchmarkRun = body.data.run as BenchmarkRun;
      setHistory((current) => {
        const next = [benchmarkRun, ...current].slice(0, 10);
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setRunning(false);
    }
  };

  const clearHistory = () => {
    setHistory([]);
    localStorage.removeItem(HISTORY_KEY);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-white">Models</h2>
            <p className="mt-1 text-sm text-slate-400">
              Select up to three installed local embedding models.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              {loadingModels ? (
                <span className="text-sm text-slate-400">Loading Ollama models…</span>
              ) : models.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    model.installed
                      ? 'cursor-pointer border-slate-600 bg-slate-950 text-slate-200'
                      : 'cursor-not-allowed border-slate-800 bg-slate-950/40 text-slate-600'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(model.id)}
                    disabled={!model.installed || running}
                    onChange={() => toggleModel(model.id)}
                    className="accent-brand-500"
                  />
                  <span className="font-mono">{model.id}</span>
                  {!model.installed && <span className="text-xs">(not installed)</span>}
                </label>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={run}
            disabled={!canRun}
            className={`rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors ${
              canRun
                ? 'bg-brand-900 text-white hover:bg-brand-800'
                : 'cursor-not-allowed bg-slate-800 text-slate-500'
            }`}
          >
            {running ? 'Running benchmark…' : 'Run embedding benchmark'}
          </button>
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Measures first request, warm request, multilingual retrieval, dimension,
          and a batch of 100 inputs. A full comparison can take around 30 seconds.
        </p>
        {error && (
          <div className="mt-4 rounded-lg border border-red-900/70 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Recent runs</h2>
          {history.length > 0 && (
            <button type="button" onClick={clearHistory} className="text-xs text-slate-400 hover:text-red-400">
              Clear local history
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">
            Run the first embedding benchmark to see a comparison.
          </div>
        ) : (
          <div className="space-y-5">
            {history.map((benchmarkRun) => (
              <article key={benchmarkRun.id} className="overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
                <header className="border-b border-slate-700 bg-slate-800/70 px-4 py-3 text-xs text-slate-400">
                  {new Date(benchmarkRun.createdAt).toLocaleString()}
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Model</th>
                        <th className="px-4 py-3 text-right">Dimensions</th>
                        <th className="px-4 py-3 text-right">First</th>
                        <th className="px-4 py-3 text-right">Warm</th>
                        <th className="px-4 py-3 text-right">Retrieval</th>
                        <th className="px-4 py-3 text-right">100 inputs</th>
                        <th className="px-4 py-3 text-right">Per input</th>
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkRun.results.map((result) => (
                        <tr key={result.model} className="border-t border-slate-800 text-slate-200">
                          <td className="px-4 py-3 font-mono">{result.model}</td>
                          {result.error ? (
                            <td colSpan={6} className="px-4 py-3 text-red-400">{result.error}</td>
                          ) : (
                            <>
                              <td className="px-4 py-3 text-right font-mono">{result.dimensions}</td>
                              <td className="px-4 py-3 text-right font-mono">{formatMs(result.firstRequestMs)}</td>
                              <td className="px-4 py-3 text-right font-mono text-cyan-300">{formatMs(result.warmMs)}</td>
                              <td className={`px-4 py-3 text-right font-mono ${scoreClass(result)}`}>
                                {result.retrievalCorrect}/{result.retrievalTotal}
                              </td>
                              <td className="px-4 py-3 text-right font-mono">{formatMs(result.batchMs)}</td>
                              <td className="px-4 py-3 text-right font-mono">{formatMs(result.batchPerItemMs)}</td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
