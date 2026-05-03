import { useEffect, useState, useCallback } from 'react';

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

export function useAgentRun(
  runId: string,
  options?: { onWorkerUpdate?: (worker: Worker) => void; onCompleted?: (result: string) => void }
) {
  const [state, setState] = useState<AgentRunState>({
    runId,
    orchestratorStatus: 'planning',
    workers: new Map(),
    aggregatorOutput: '',
    finalResult: '',
  });

  const updateWorker = useCallback((worker: Worker) => {
    setState((prev) => {
      const newWorkers = new Map(prev.workers);
      newWorkers.set(worker.id, worker);
      return { ...prev, workers: newWorkers };
    });
    options?.onWorkerUpdate?.(worker);
  }, [options]);

  useEffect(() => {
    const eventSource = new EventSource(`/api/agents?runId=${runId}`);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'agent_run_started':
            console.log('[useAgentRun] Run started:', data.runId);
            break;

          case 'orchestrator_planning':
            setState((prev) => ({ ...prev, orchestratorStatus: 'planning' }));
            break;

          case 'orchestrator_planned':
            // Initialize worker states
            const initialWorkers = new Map<string, Worker>();
            data.workers.forEach((spec: any) => {
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
              id: data.workerId,
              name: data.name,
              task: data.task,
              status: 'running',
              output: '',
            });
            break;

          case 'worker_token':
            setState((prev) => {
              const workers = new Map(prev.workers);
              const worker = workers.get(data.workerId);
              if (worker) {
                worker.output += data.content;
                workers.set(data.workerId, { ...worker });
              }
              return { ...prev, workers };
            });
            break;

          case 'worker_tool_call':
            setState((prev) => {
              const workers = new Map(prev.workers);
              const worker = workers.get(data.workerId);
              if (worker) {
                worker.tool = data.tool;
                workers.set(data.workerId, { ...worker });
              }
              return { ...prev, workers };
            });
            break;

          case 'worker_completed':
            updateWorker({
              ...state.workers.get(data.workerId)!,
              status: 'completed',
              output: data.result,
            });
            break;

          case 'worker_failed':
            updateWorker({
              ...state.workers.get(data.workerId)!,
              status: 'failed',
              error: data.error,
              output: '',
            });
            break;

          case 'orchestrator_aggregating':
            setState((prev) => ({ ...prev, orchestratorStatus: 'aggregating' }));
            break;

          case 'aggregator_token':
            setState((prev) => ({
              ...prev,
              aggregatorOutput: prev.aggregatorOutput + data.content,
            }));
            break;

          case 'run_completed':
            setState((prev) => ({
              ...prev,
              finalResult: data.result,
              orchestratorStatus: 'completed',
            }));
            options?.onCompleted?.(data.result);
            break;

          case 'error':
            setState((prev) => ({
              ...prev,
              error: data.message,
              orchestratorStatus: 'failed',
            }));
            break;
        }
      } catch (err) {
        console.error('[useAgentRun] Parse error:', err);
      }
    };

    eventSource.addEventListener('message', handleMessage);
    eventSource.onerror = () => {
      setState((prev) => ({
        ...prev,
        error: 'Connection lost',
        orchestratorStatus: 'failed',
      }));
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [runId, updateWorker, options]);

  return state;
}
