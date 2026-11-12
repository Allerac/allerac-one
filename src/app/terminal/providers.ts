export const TERMINAL_PROVIDERS = ['claude', 'codex'] as const;
export type TerminalProvider = typeof TERMINAL_PROVIDERS[number];

export const TERMINAL_LABELS: Record<TerminalProvider, string> = {
  claude: 'Anthropic · Claude Code',
  codex: 'OpenAI · Codex',
};

export function isTerminalProvider(value: unknown): value is TerminalProvider {
  return value === 'claude' || value === 'codex';
}
