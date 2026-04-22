'use client';

import { useState, useRef } from 'react';

interface TestResult {
  model: string;
  provider: string;
  label: string;
  success: boolean;
  ttft_ms: number | null;
  total_ms: number;
  description: string;
  error?: string;
  status: 'pending' | 'running' | 'done' | 'error';
}

export function VisionBenchmark() {
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setImageUrl(base64);
      setImagePreview(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleUrlChange = (url: string) => {
    setImageUrl(url);
    setImagePreview(url);
  };

  const runBenchmark = async () => {
    if (!imageUrl) {
      alert('Please provide an image first');
      return;
    }

    setIsRunning(true);
    setResults([]);

    try {
      const response = await fetch('/api/benchmark/vision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl }),
      });

      if (!response.ok) throw new Error(`API error ${response.status}`);

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;

          try {
            const event = JSON.parse(trimmed.slice(6));

            if (event.type === 'test_start') {
              setResults((prev) => [
                ...prev,
                {
                  model: event.model,
                  provider: event.provider,
                  label: event.label,
                  success: false,
                  ttft_ms: null,
                  total_ms: 0,
                  description: '',
                  status: 'running',
                },
              ]);
            } else if (event.type === 'test_done') {
              setResults((prev) =>
                prev.map((r) =>
                  r.model === event.model
                    ? {
                        ...r,
                        success: event.success,
                        ttft_ms: event.ttft_ms,
                        total_ms: event.total_ms,
                        description: event.description,
                        status: 'done',
                      }
                    : r,
                ),
              );
            } else if (event.type === 'test_error') {
              console.error(`[Benchmark] ${event.model} error:`, event.error);
              setResults((prev) =>
                prev.map((r) =>
                  r.model === event.model
                    ? {
                        ...r,
                        error: event.error,
                        status: 'error',
                      }
                    : r,
                ),
              );
            } else if (event.type === 'test_done') {
              if (!event.success) {
                console.warn(`[Benchmark] ${event.model} failed:`, event.error);
              } else {
                console.log(`[Benchmark] ${event.model} success (${event.total_ms}ms)`);
              }
            } else if (event.type === 'done') {
              setIsRunning(false);
            }
          } catch {}
        }
      }
    } catch (error: any) {
      alert(`Benchmark failed: ${error.message}`);
      setIsRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
        <h2 className="text-xl font-bold text-white mb-4">Vision Benchmark</h2>

        {/* Image Input */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Upload Image</label>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition"
            >
              Choose File
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Or Image URL</label>
            <input
              type="text"
              placeholder="https://example.com/image.jpg"
              value={imageUrl.startsWith('http') ? imageUrl : ''}
              onChange={(e) => handleUrlChange(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-white placeholder-slate-500"
            />
          </div>
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div className="mb-6">
            <img
              src={imagePreview}
              alt="Preview"
              className="max-w-xs max-h-48 rounded-md border border-slate-600"
            />
          </div>
        )}

        {/* Run Button */}
        <button
          onClick={runBenchmark}
          disabled={!imageUrl || isRunning}
          className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white rounded-md transition font-medium"
        >
          {isRunning ? 'Running Benchmark...' : 'Run Vision Benchmark'}
        </button>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-white">Results</h3>
          {results.map((result) => (
            <div
              key={`${result.model}-${result.provider}`}
              className={`rounded-lg p-4 border ${
                result.status === 'running'
                  ? 'bg-blue-900/20 border-blue-600'
                  : result.status === 'error'
                    ? 'bg-red-900/20 border-red-600'
                    : result.success
                      ? 'bg-green-900/20 border-green-600'
                      : 'bg-slate-800 border-slate-600'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-bold text-white">{result.label}</p>
                  <p className="text-xs text-slate-400">{result.provider}</p>
                </div>
                <div className="text-right">
                  {result.status === 'running' && <span className="text-blue-400">Processing...</span>}
                  {result.status === 'done' && result.success && (
                    <span className="text-green-400">✓ Success</span>
                  )}
                  {result.status === 'error' && <span className="text-red-400">✗ Failed</span>}
                </div>
              </div>

              {result.error && (
                <div className="text-xs text-red-400 mb-2 p-2 bg-red-950/30 rounded border border-red-700">
                  <p className="font-semibold mb-1">Error:</p>
                  <p className="break-words">{result.error}</p>
                </div>
              )}

              {result.description && (
                <div className="mb-2">
                  <p className="text-xs text-slate-400 mb-1">Description:</p>
                  <p className="text-sm text-slate-200 line-clamp-3">{result.description}</p>
                </div>
              )}

              {result.ttft_ms !== null && result.total_ms > 0 && (
                <div className="flex gap-4 text-xs text-slate-400">
                  <span>TTFT: {result.ttft_ms}ms</span>
                  <span>Total: {result.total_ms}ms</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
