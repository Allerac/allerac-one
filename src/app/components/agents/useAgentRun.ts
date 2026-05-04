export interface Worker {
  id: string;
  name: string;
  task: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  output: string;
  tool?: string;
  error?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  tokensUsed?: number | null;
  progressLog?: string | null;
}

export interface AgentRunState {
  runId: string;
  orchestratorStatus: 'pending' | 'planning' | 'running' | 'aggregating' | 'completed' | 'failed';
  workers: Map<string, Worker>;
  aggregatorOutput: string;
  finalResult: string;
  error?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}
