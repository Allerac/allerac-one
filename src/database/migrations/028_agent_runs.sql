-- Agent runs for parallel agent execution
CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'planning' CHECK (status IN ('planning', 'running', 'aggregating', 'completed', 'failed')),
  prompt TEXT NOT NULL,
  plan JSONB,
  result TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_runs_conversation ON agent_runs(conversation_id);
CREATE INDEX idx_agent_runs_user ON agent_runs(user_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);

-- Individual agents/workers within a run
CREATE TABLE agent_workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  task TEXT NOT NULL,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'running', 'completed', 'failed')),
  result TEXT,
  tokens_used INT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_workers_run ON agent_workers(run_id);
CREATE INDEX idx_agent_workers_status ON agent_workers(status);

-- Link messages to agent runs
ALTER TABLE chat_messages ADD COLUMN agent_run_id UUID REFERENCES agent_runs(id) ON DELETE SET NULL;
CREATE INDEX idx_chat_messages_agent_run ON chat_messages(agent_run_id);
