interface OrchestratorStatusProps {
  status: 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed';
  isDarkMode?: boolean;
}

export function OrchestratorStatus({ status, isDarkMode = false }: OrchestratorStatusProps) {
  const statusLabels: Record<string, string> = {
    pending: 'Waiting to start...',
    planning: 'Planning...',
    running: 'Delegating workers...',
    aggregating: 'Synthesizing results...',
    completed: 'Complete',
    failed: 'Failed',
  };

  const bgColor = isDarkMode ? 'bg-gray-800' : 'bg-blue-50';
  const borderColor = isDarkMode ? 'border-gray-700' : 'border-blue-200';
  const textColor = isDarkMode ? 'text-gray-100' : 'text-gray-900';
  const labelColor = isDarkMode ? 'text-gray-400' : 'text-gray-600';

  return (
    <div className={`${bgColor} ${borderColor} border rounded-lg p-4 mb-4`}>
      <div className="flex items-center gap-3">
        <span className={`text-2xl ${status === 'failed' ? 'text-red-500' : status === 'completed' ? 'text-green-500' : 'text-blue-500'}`}>
          {status === 'pending' && '⏳'}
          {status === 'planning' && '⟳'}
          {status === 'running' && '⟳'}
          {status === 'aggregating' && '🔗'}
          {status === 'completed' && '✓'}
          {status === 'failed' && '✗'}
        </span>
        <div>
          <div className={`font-semibold ${textColor}`}>Orchestrator</div>
          <div className={`text-sm ${labelColor}`}>{statusLabels[status]}</div>
        </div>
      </div>
    </div>
  );
}
