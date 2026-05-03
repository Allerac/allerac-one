'use client';

import { useAgentRun } from './useAgentRun';
import { OrchestratorStatus } from './OrchestratorStatus';
import { WorkerCard } from './WorkerCard';

interface AgentRunViewProps {
  runId: string;
  isDarkMode?: boolean;
  onCompleted?: (result: string) => void;
}

export function AgentRunView({ runId, isDarkMode = false, onCompleted }: AgentRunViewProps) {
  const state = useAgentRun(runId, { onCompleted });

  const containerBgColor = isDarkMode ? 'bg-gray-950' : 'bg-gray-50';
  const containerTextColor = isDarkMode ? 'text-gray-100' : 'text-gray-900';

  if (state.error) {
    return (
      <div className="bg-red-100 dark:bg-red-900 border border-red-300 dark:border-red-700 rounded-lg p-4 my-4">
        <div className="text-red-800 dark:text-red-200 font-semibold">Error</div>
        <div className="text-red-700 dark:text-red-300 text-sm mt-1">{state.error}</div>
      </div>
    );
  }

  return (
    <div className={`${containerBgColor} ${containerTextColor} rounded-lg p-6 my-4 border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-4">Agent Pipeline</h3>
        <OrchestratorStatus status={state.orchestratorStatus} isDarkMode={isDarkMode} />
      </div>

      {state.workers.size > 0 && (
        <div className="mb-6">
          <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-3`}>
            Workers ({Array.from(state.workers.values()).filter((w) => w.status === 'completed').length}/{state.workers.size} completed)
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from(state.workers.values()).map((worker) => (
              <WorkerCard key={worker.id} worker={worker} isDarkMode={isDarkMode} isCompact={true} />
            ))}
          </div>
        </div>
      )}

      {state.aggregatorOutput && (
        <div className="mb-6">
          <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Synthesizing Results...</h4>
          <div
            className={`${isDarkMode ? 'bg-gray-800' : 'bg-white'} border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4 text-sm`}
          >
            {state.aggregatorOutput}
          </div>
        </div>
      )}

      {state.orchestratorStatus === 'completed' && state.finalResult && (
        <div className="mb-4">
          <h4 className={`text-sm font-semibold ${isDarkMode ? 'text-gray-300' : 'text-gray-700'} mb-2`}>Final Result</h4>
          <div
            className={`${isDarkMode ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'} border ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} rounded-lg p-4 text-sm`}
          >
            {state.finalResult}
          </div>
        </div>
      )}
    </div>
  );
}
