-- Allerac Skills System - Phase 1 MVP
-- Migration: 003_skills_system.sql

-- Skills table (follows Anthropic standard + Allerac extensions)
CREATE TABLE IF NOT EXISTS skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,  -- NULL = public/shared
  name VARCHAR(100) NOT NULL,  -- kebab-case identifier
  display_name VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,  -- Full SKILL.md content
  category VARCHAR(50) DEFAULT 'workflow',  -- document_creation, workflow, enhancement
  
  -- Allerac extensions for adaptive skills
  learning_enabled BOOLEAN DEFAULT false,
  memory_scope VARCHAR(20) DEFAULT 'user',  -- user, bot, global
  rag_integration BOOLEAN DEFAULT false,
  auto_switch_rules JSONB,  -- Conditions for auto-activation
  
  -- Standard metadata
  version VARCHAR(20) DEFAULT '1.0.0',
  license VARCHAR(50) DEFAULT 'MIT',
  verified BOOLEAN DEFAULT false,  -- Official/verified skills
  shared BOOLEAN DEFAULT false,  -- Available in public marketplace
  
  -- Analytics
  install_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  total_ratings INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_user_skill_name UNIQUE(user_id, name)
);

-- Assignment: Skills to Telegram bots (many-to-many)
CREATE TABLE IF NOT EXISTS telegram_bot_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_id UUID REFERENCES telegram_bot_configs(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,  -- Skill active on bot start
  enabled BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,  -- Display order in UI
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_bot_skill UNIQUE(bot_id, skill_id)
);

-- Assignment: Skills to web users (many-to-many)
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE CASCADE,
  is_default BOOLEAN DEFAULT false,  -- Skill active on chat start
  enabled BOOLEAN DEFAULT true,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT unique_user_skill UNIQUE(user_id, skill_id)
);

-- Track active skill per conversation
CREATE TABLE IF NOT EXISTS conversation_active_skills (
  conversation_id UUID PRIMARY KEY REFERENCES chat_conversations(id) ON DELETE CASCADE,
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  activated_at TIMESTAMP DEFAULT NOW(),
  previous_skill_id UUID REFERENCES skills(id)
);

-- Usage tracking and analytics
CREATE TABLE IF NOT EXISTS skill_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_id UUID REFERENCES skills(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  bot_id UUID REFERENCES telegram_bot_configs(id) ON DELETE SET NULL,  -- NULL for web chat
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,
  
  -- Trigger context
  trigger_type VARCHAR(20) DEFAULT 'manual',  -- manual, auto, command
  trigger_message TEXT,
  previous_skill_id UUID REFERENCES skills(id),
  
  -- Performance metrics
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  tokens_used INTEGER,
  tool_calls_count INTEGER DEFAULT 0,
  success BOOLEAN,
  error_message TEXT,
  
  -- User feedback
  user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
  user_feedback TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_skills_user ON skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skills_shared ON skills(shared) WHERE shared = true;
CREATE INDEX IF NOT EXISTS idx_skills_category ON skills(category);
CREATE INDEX IF NOT EXISTS idx_skills_verified ON skills(verified) WHERE verified = true;

CREATE INDEX IF NOT EXISTS idx_telegram_bot_skills_bot ON telegram_bot_skills(bot_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_skills_skill ON telegram_bot_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_skills_enabled ON telegram_bot_skills(enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_user_skills_enabled ON user_skills(enabled) WHERE enabled = true;

CREATE INDEX IF NOT EXISTS idx_conversation_active_skills_skill ON conversation_active_skills(skill_id);

CREATE INDEX IF NOT EXISTS idx_skill_usage_skill ON skill_usage(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_user ON skill_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_bot ON skill_usage(bot_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_conversation ON skill_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_dates ON skill_usage(started_at, completed_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_skills_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for skills table
DROP TRIGGER IF EXISTS trigger_skills_updated_at ON skills;
CREATE TRIGGER trigger_skills_updated_at
  BEFORE UPDATE ON skills
  FOR EACH ROW
  EXECUTE FUNCTION update_skills_updated_at();

-- Comments for documentation
COMMENT ON TABLE skills IS 'Allerac Skills System - Anthropic compatible skill definitions with learning extensions';
COMMENT ON TABLE telegram_bot_skills IS 'Many-to-many assignment of skills to Telegram bots';
COMMENT ON TABLE user_skills IS 'Many-to-many assignment of skills to web chat users';
COMMENT ON TABLE conversation_active_skills IS 'Track currently active skill per conversation';
COMMENT ON TABLE skill_usage IS 'Analytics and performance tracking for skill usage';

COMMENT ON COLUMN skills.learning_enabled IS 'When true, skill can access conversation_summaries for adaptive behavior';
COMMENT ON COLUMN skills.memory_scope IS 'Scope of learned preferences: user (personal), bot (per-bot), global (all)';
COMMENT ON COLUMN skills.rag_integration IS 'When true, skill automatically searches RAG documents for context';
COMMENT ON COLUMN skills.auto_switch_rules IS 'JSON rules for automatic skill activation (keywords, file_types, patterns)';
