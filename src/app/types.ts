// Types and interfaces for the chat admin

export interface MessageContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string; // data:image/jpeg;base64,... or http://...
  };
}

export interface MessageAction {
  type: 'instagram_draft';
  caption: string;
  tags: string;
  image_url?: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | MessageContentPart[];
  timestamp: Date;
  tool_call_id?: string;
  responseTime?: number; // ms — only set on completed assistant messages
  actions?: MessageAction[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  pinned: boolean;
}

export interface Model {
  id: string;
  name: string;
  icon: string;
  description?: string;
  provider: 'github' | 'ollama' | 'gemini' | 'anthropic';
  baseUrl?: string;
  requiresToken?: boolean;
  category: 'Fast' | 'Thinking' | 'Pro';
  shortName: string;
}

export interface MemorySaveResult {
  success: boolean;
  message: string;
  summary?: string;
  importance?: number;
  topics?: string[];
}

export interface SearchWebResult {
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
  }>;
  query: string;
  from_cache?: boolean;
  cached_at?: string;
  error?: string;
}

export interface ScheduledJob {
  id: string;
  userId: string;
  name: string;
  cronExpr: string;
  prompt: string;
  channels: string[];
  enabled: boolean;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JobExecution {
  id: string;
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  result: string | null;
  startedAt: string;
  completedAt: string | null;
}
