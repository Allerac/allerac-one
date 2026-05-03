import { useEffect, useState, useCallback, useRef } from 'react';

export interface Worker {
  id: string;
  name: string;
  task: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  output: string;
  tool?: string;
  error?: string;
}

export interface AgentRunState {
  runId: string;
  orchestratorStatus: 'planning' | 'running' | 'aggregating' | 'completed' | 'failed';
  workers: Map<string, Worker>;
  aggregatorOutput: string;
  finalResult: string;
  error?: string;
}

interface UseAgentRunOptions {
  onWorkerUpdate?: (worker: Worker) => void;
  onCompleted?: (result: string) => void;
  onError?: (error: string) => void;
}

export function useAgentRun(options?: UseAgentRunOptions) {
  const [state, setState] = useState<AgentRunState>({
    runId: '',
    orchestratorStatus: 'planning',
    workers: new Map(),
    aggregatorOutput: '',
    finalResult: '',
  });

  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  const updateWorker = useCallback((worker: Worker) => {
    setState((prev) => {
      const newWorkers = new Map(prev.workers);
      newWorkers.set(worker.id, worker);
      return { ...prev, workers: newWorkers };
    });
    options?.onWorkerUpdate?.(worker);
  }, [options]);

  const handleEvent = useCallback((event: any) => {
    switch (event.type) {
      case 'agent_run_started':
        console.log('[useAgentRun] Run started:', event.runId);
        setState((prev) => ({ ...prev, runId: event.runId }));
        break;

      case 'orchestrator_planning':
        setState((prev) => ({ ...prev, orchestratorStatus: 'planning' }));
        break;

      case 'orchestrator_planned':
        const initialWorkers = new Map<string, Worker>();
        event.workers.forEach((spec: any) => {
          initialWorkers.set(spec.id, {
            id: spec.id,
            name: spec.name,
            task: spec.task,
            status: 'waiting',
            output: '',
          });
        });
        setState((prev) => ({ ...prev, workers: initialWorkers, orchestratorStatus: 'running' }));
        break;

      case 'worker_started':
        updateWorker({
          id: event.workerId,
          name: event.name,
          task: event.task,
          status: 'running',
          output: '',
        });
        break;

      case 'worker_token':
        setState((prev) => {
          const workers = new Map(prev.workers);
          const worker = workers.get(event.workerId);
          if (worker) {
            worker.output += event.content;
            workers.set(event.workerId, { ...worker });
          }
          return { ...prev, workers };
        });
        break;

      case 'worker_tool_call':
        setState((prev) => {
          const workers = new Map(prev.workers);
          const worker = workers.get(event.workerId);
          if (worker) {
            worker.tool = event.tool;
            workers.set(event.workerId, { ...worker });
          }
          return { ...prev, workers };
        });
        break;

      case 'worker_completed':
        setState((prev) => {
          const workers = new Map(prev.workers);
          const currentWorker = workers.get(event.workerId);
          if (currentWorker) {
            workers.set(event.workerId, {
              ...currentWorker,
              status: 'completed',
              output: event.result,
            });
          }
          return { ...prev, workers };
        });
        break;

      case 'worker_failed':
        setState((prev) => {
          const workers = new Map(prev.workers);
          const currentWorker = workers.get(event.workerId);
          if (currentWorker) {
            workers.set(event.workerId, {
              ...currentWorker,
              status: 'failed',
              error: event.error,
              output: '',
            });
          }
          return { ...prev, workers };
        });
        break;

      case 'orchestrator_aggregating':
        setState((prev) => ({ ...prev, orchestratorStatus: 'aggregating' }));
        break;

      case 'aggregator_token':
        setState((prev) => ({
          ...prev,
          aggregatorOutput: prev.aggregatorOutput + event.content,
        }));
        break;

      case 'run_completed':
        setState((prev) => ({
          ...prev,
          finalResult: event.result,
          orchestratorStatus: 'completed',
        }));
        options?.onCompleted?.(event.result);
        break;

      case 'error':
        setState((prev) => ({
          ...prev,
          error: event.message,
          orchestratorStatus: 'failed',
        }));
        options?.onError?.(event.message);
        break;
    }
  }, [options]);

  const startRun = useCallback(async (
    message: string,
    conversationId: string | null,
    model: string,
    provider: string
  ) => {
    setState({
      runId: '',
      orchestratorStatus: 'planning',
      workers: new Map(),
      aggregatorOutput: '',
      finalResult: '',
    });

    try {
      const response = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversationId,
          model,
          provider,
        }),
      });

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(text || `HTTP error ${response.status}`);
      }

      const reader = response.body.getReader();
      readerRef.current = reader;
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
          try {
            const event = JSON.parse(line.slice(6));
            handleEvent(event);
          } catch (err) {
            console.error('[useAgentRun] Parse error:', err);
          }
        }
      }
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error('[useAgentRun] Error:', errorMsg);
      setState((prev) => ({
        ...prev,
        error: errorMsg,
        orchestratorStatus: 'failed',
      }));
      options?.onError?.(errorMsg);
    }
  }, [handleEvent, options]);

  const reset = useCallback(() => {
    if (readerRef.current) {
      readerRef.current.cancel();
      readerRef.current = null;
    }
    setState({
      runId: '',
      orchestratorStatus: 'planning',
      workers: new Map(),
      aggregatorOutput: '',
      finalResult: '',
    });
  }, []);

  useEffect(() => {
    return () => {
      if (readerRef.current) {
        readerRef.current.cancel();
      }
    };
  }, []);

  return { state, startRun, reset };
}
