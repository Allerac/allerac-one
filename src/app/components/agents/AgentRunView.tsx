'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Worker } from './useAgentRun';

// ── Internal polling ──────────────────────────────────────────────────────────

interface RunData {
  status: 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed' | 'cancelled';
  prompt: string;
  result: string | null;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  workers: Array<{
    id: string;
    name: string;
    task: string;
    status: 'waiting' | 'running' | 'completed' | 'failed';
    result: string | null;
    progressLog: string | null;
    tokensUsed: number | null;
    startedAt: string | null;
    completedAt: string | null;
  }>;
}

function useRunPoll(runId: string) {
  const [data, setData] = useState<RunData | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const mountedRef = useRef(true);

  const fetchRun = useCallback(async () => {
    try {
      const response = await fetch(`/api/agents?runId=${encodeURIComponent(runId)}`);
      if (!response.ok) return;
      const json = await response.json();
      if (mountedRef.current) {
        setData(json);
        setIsPolling(true);
        if (json.status === 'completed' || json.status === 'failed' || json.status === 'cancelled') {
          setIsPolling(false);
        }
      }
    } catch {
      // silent
    }
  }, [runId]);

  useEffect(() => {
    mountedRef.current = true;
    fetchRun();

    const interval = setInterval(() => {
      if (data && ['completed', 'failed', 'cancelled'].includes(data.status)) return;
      fetchRun();
    }, 2000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchRun, data?.status]);

  return { data, isPolling };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWorkerStatusLine(worker: Worker): string {
  if (worker.status === 'waiting') return 'Queued...';
  if (worker.status === 'failed') return worker.error ? `Failed: ${worker.error}` : 'Failed.';
  if (worker.status === 'completed') return 'Done.';

  if (worker.progressLog) {
    const lines = worker.progressLog.split('\n\n').filter(Boolean);
    const hasOutput = lines.some(l => l.startsWith('output:'));
    const nonOutputLines = lines.filter(l => !l.startsWith('output:') && l !== 'heartbeat' && l !== 'Starting...');
    const lastAction = nonOutputLines[nonOutputLines.length - 1];

    if (lastAction && lastAction.startsWith('tool:')) {
      const parts = lastAction.split(':');
      const tool = parts[1];
      const detail = parts.slice(2).join(':').trim();
      return `Calling ${tool}${detail ? `: ${detail.substring(0, 80)}` : ''}`;
    }

    if (hasOutput) return 'Generating response...';
    if (lastAction === 'Starting...') return 'Starting...';
    if (lastAction) return lastAction;
  }

  return 'Running...';
}

function statusIcon(status: string): string {
  switch (status) {
    case 'waiting': return '○';
    case 'running': return '●';
    case 'completed': return '✓';
    case 'failed': return '✗';
    default: return '○';
  }
}

function statusColor(status: string, isDarkMode: boolean): string {
  if (status === 'running') return 'text-blue-500';
  if (status === 'completed') return isDarkMode ? 'text-green-400' : 'text-green-600';
  if (status === 'failed') return isDarkMode ? 'text-red-400' : 'text-red-600';
  return isDarkMode ? 'text-gray-500' : 'text-gray-400';
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function ElleracLogo({ isDarkMode, isWorking }: { isDarkMode: boolean; isWorking: boolean }) {
  return (
    <div className="relative w-6 h-6 flex items-center justify-center">
      <div
        className={`w-4 h-4 rounded-sm ${isDarkMode ? 'bg-blue-500' : 'bg-blue-600'} ${isWorking ? 'animate-spin' : ''}`}
        style={isWorking ? { animationDuration: '3s' } : {}}
      />
      {isWorking && (
        <div className={`absolute w-4 h-4 rounded-sm border-2 border-transparent border-t-blue-400 animate-spin`} />
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface AgentRunViewProps {
  runId: string;
  isDarkMode?: boolean;
  onCompleted?: (result: string) => void;
}

export function AgentRunView({ runId, isDarkMode = false, onCompleted }: AgentRunViewProps) {
  const { data, isPolling } = useRunPoll(runId);
  const [expandedWorkers, setExpandedWorkers] = useState<Set<string>>(new Set());
  const [elapsed, setElapsed] = useState<number>(0);
  const [startTime, setStartTime] = useState<number | null>(null);

  const prevStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (data && data.status === 'completed' && prevStatusRef.current !== 'completed') {
      onCompleted?.(data.result || '');
    }
    prevStatusRef.current = data?.status || null;
  }, [data?.status, data?.result, onCompleted]);

  useEffect(() => {
    if (!startTime && data?.startedAt) {
      setStartTime(new Date(data.startedAt).getTime());
    }
  }, [data?.startedAt, startTime]);

  useEffect(() => {
    if (data?.status === 'completed' || data?.status === 'failed') {
      setElapsed(data.startedAt && data.completedAt
        ? new Date(data.completedAt).getTime() - new Date(data.startedAt).getTime()
        : 0);
    } else if (startTime) {
      const interval = setInterval(() => {
        setElapsed(Date.now() - startTime);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [data?.status, data?.completedAt, startTime]);

  if (!data) {
    const containerBg = isDarkMode ? 'bg-gray-950' : 'bg-gray-50';
    const textColor = isDarkMode ? 'text-gray-200' : 'text-gray-800';
    const subtext = isDarkMode ? 'text-gray-400' : 'text-gray-500';
    const border = isDarkMode ? 'border-gray-800' : 'border-gray-200';

    return (
      <div className={`${containerBg} ${textColor} rounded-xl p-5 my-4 text-sm border ${border}`}>
        <div className="mb-4 pb-3 border-b border-gray-700/30">
          <div className="flex items-center gap-2">
            <ElleracLogo isDarkMode={isDarkMode} isWorking />
            <span className="font-semibold">Agent Run</span>
            <span className="ml-auto px-2 py-0.5 rounded-full text-xs bg-blue-500/20 text-blue-400">
              loading...
            </span>
          </div>
        </div>
        <div className={`${subtext} text-center py-4 animate-pulse`}>
          Loading agent run state...
        </div>
      </div>
    );
  }

  const orchestratorStatus = data.status === 'cancelled' ? 'failed' : data.status;
  const isWorking = ['pending', 'planning', 'running', 'aggregating'].includes(orchestratorStatus);

  const workers: Worker[] = data.workers.map(w => ({
    id: w.id,
    name: w.name,
    task: w.task,
    status: w.status,
    output: w.result || '',
    progressLog: w.progressLog,
    startedAt: w.startedAt,
    completedAt: w.completedAt,
    tokensUsed: w.tokensUsed,
  }));

  const containerBg = isDarkMode ? 'bg-gray-950' : 'bg-gray-50';
  const textColor = isDarkMode ? 'text-gray-200' : 'text-gray-800';
  const subtext = isDarkMode ? 'text-gray-400' : 'text-gray-500';
  const border = isDarkMode ? 'border-gray-800' : 'border-gray-200';

  const toggleWorker = (id: string) => {
    setExpandedWorkers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className={`${containerBg} ${textColor} rounded-xl p-5 my-4 text-sm border ${border}`}>
      <div className="mb-4 pb-3 border-b border-gray-700/30">
        <div className="flex items-center gap-2">
          <ElleracLogo isDarkMode={isDarkMode} isWorking={isWorking} />
          <span className="font-semibold">Agent Run</span>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-xs ${
            orchestratorStatus === 'completed' ? 'bg-green-500/20 text-green-400'
            : orchestratorStatus === 'failed' ? 'bg-red-500/20 text-red-400'
            : 'bg-blue-500/20 text-blue-400'
          }`}>
            {orchestratorStatus}
          </span>
        </div>
        {elapsed > 0 && (
          <div className={`${subtext} text-xs mt-1`}>
            {formatDuration(elapsed)}
          </div>
        )}
      </div>

      <div className="space-y-3 mb-4">
        {workers.map((worker) => (
          <div key={worker.id} className="space-y-1">
            <button
              onClick={() => worker.progressLog && toggleWorker(worker.id)}
              className={`flex items-start gap-2 w-full text-left ${worker.progressLog ? 'cursor-pointer' : ''}`}
            >
              <span className={`mt-0.5 font-mono ${statusColor(worker.status, isDarkMode)}`}>{statusIcon(worker.status)}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium">{worker.name}</div>
                <div className={`${subtext} truncate`}>{getWorkerStatusLine(worker)}</div>
              </div>
            </button>

            {expandedWorkers.has(worker.id) && worker.progressLog && (
              <div className={`ml-6 mt-1 p-2 rounded text-xs font-mono ${isDarkMode ? 'bg-gray-900' : 'bg-white'} ${isDarkMode ? 'text-gray-400' : 'text-gray-600'} border ${isDarkMode ? 'border-gray-800' : 'border-gray-200'} max-h-40 overflow-auto`}>
                {worker.progressLog.split('\n\n').filter(line => line !== 'heartbeat' && line !== 'Starting...').map((line, i) => {
                  if (line.startsWith('output:')) {
                    const allLines = worker.progressLog!.split('\n\n').filter(l => l.startsWith('output:'));
                    if (line !== allLines[allLines.length - 1]) return null;
                    const aggregatedText = allLines.map(l => l.substring(7)).join('');
                    return <div key={i} className="mb-0.5 whitespace-pre-wrap">Generated text: {aggregatedText}</div>;
                  }
                  return <div key={i} className="mb-0.5">{line}</div>;
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {orchestratorStatus === 'completed' && data.result && (
        <div className="mt-4 pt-4 border-t border-gray-700/30">
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code: ({ className, children, ref, ...props }) => {
                  const match = /language-(\w+)/.exec(className || '');
                  const codeStr = String(children).replace(/\n$/, '');
                  return match ? (
                    <SyntaxHighlighter
                      style={(isDarkMode ? oneDark : oneLight) as any}
                      language={match[1]}
                      customStyle={{ borderRadius: '0.5rem', margin: '0.5rem 0', fontSize: '0.8rem' }}
                      PreTag="div"
                      {...props}
                    >
                      {codeStr}
                    </SyntaxHighlighter>
                  ) : (
                    <code className={isDarkMode ? 'bg-gray-800 px-1 rounded' : 'bg-gray-100 px-1 rounded'} {...props}>
                      {children}
                    </code>
                  );
                },
              }}
            >
              {data.result}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {orchestratorStatus === 'failed' && data.error && (
        <div className="mt-4 pt-4 border-t border-gray-700/30">
          <div className={`text-sm ${isDarkMode ? 'text-red-400' : 'text-red-600'}`}>
            {data.error}
          </div>
        </div>
      )}
    </div>
  );
}
