/**
 * Shared logger types and constants — safe to import in both server and client code.
 * Keep this file free of Node.js-only imports (EventEmitter, etc.).
 */

export type LogLevel = 'log' | 'warn' | 'error' | 'info';

export interface LogEntry {
  id: number;
  ts: string;       // HH:MM:SS.mmm
  level: LogLevel;
  context: string;  // extracted from [Tag] prefix, e.g. "ChatRoute", "Skills"
  message: string;
}

export const CONTEXT_COLORS: Record<string, string> = {
  ChatRoute:    '#00ff41',  // matrix green
  Skills:       '#00ffff',  // cyan
  SystemSkills: '#00ffff',  // cyan (same family)
  Memory:       '#f1fa8c',  // pale yellow
  RAG:          '#c792ea',  // soft purple
  Search:       '#ff9580',  // salmon — web search tool
  LLM:          '#8be9fd',  // light blue
  Ollama:       '#8be9fd',  // light blue (same as LLM)
  SkillRouter:  '#00ffff',  // cyan (same family as Skills)
  Workspace:    '#ffb86c',  // orange
  Health:       '#50fa7b',  // lime green
  Auth:         '#f8f8f2',  // white
  DB:           '#bd93f9',  // lavender
  Benchmark:    '#f8f8f2',  // white
  Telegram:     '#6272a4',  // muted blue
  Notifications:'#ff5ea3',  // hot pink (reserved for future)
  System:       '#6272a4',
  system:       '#6272a4',
};
