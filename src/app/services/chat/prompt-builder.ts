import { buildSoul } from '@/app/config/allerac-soul';
import type { User } from '@/app/services/auth/auth.service';
import type { Skill } from '@/app/services/skills/skills.service';

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pt: 'Portuguese',
  es: 'Spanish',
  ca: 'Catalan',
};

export interface PromptBuilderInput {
  user: User;
  locale: string;
  domain: string;
  userLocation: string | null;
  tavilyConfigured: boolean;
  userInstructions?: string;
  postContext?: string;
  activeSkill?: Skill | null;
  skillContent?: string;
  conversationMemories?: string;
  relevantContext?: string;
  now?: Date;
  timezone?: string;
}

export function buildChatSystemPrompt(input: PromptBuilderInput): string {
  const now = input.now ?? new Date();
  const language = LANGUAGE_NAMES[input.locale] || 'English';
  const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const date = now.toISOString().split('T')[0];
  const time = now.toTimeString().split(' ')[0];
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const contextLines: string[] = [];

  if (input.user.name) contextLines.push(`- Name: ${input.user.name}`);
  contextLines.push(`- Language: ${language} — always reply in this language`);
  contextLines.push(`- Current date & time: ${date} ${weekdays[now.getDay()]}, ${time} (${timezone})`);
  if (input.userLocation) contextLines.push(`- Location: ${input.userLocation}`);

  let prompt = `${buildSoul(input.domain)}\n\n## User context\n${contextLines.join('\n')}`;

  if (input.userInstructions) {
    prompt += `\n\n## User instructions\n${input.userInstructions}`;
  }

  if (input.userLocation) {
    prompt += '\n\nWhen the user asks about weather, temperature, or anything requiring real-time local information, use the search_web tool to find current data for their location.';
  } else if (input.tavilyConfigured) {
    prompt += '\n\nWhen the user asks about current weather, news, prices, or any real-time information, use the search_web tool.';
  }

  if (input.postContext) prompt += `\n\n${input.postContext}`;

  if (input.activeSkill && input.skillContent) {
    prompt = `# Active Skill: ${input.activeSkill.display_name}\n\n${input.skillContent}\n\n---\n\n${prompt}`;
  }

  if (input.conversationMemories) {
    prompt = `${input.conversationMemories}\n\n${prompt}`;
  }

  if (input.relevantContext && !input.relevantContext.includes('No relevant documents found')) {
    prompt += `\n\n${input.relevantContext}`;
  }

  if (input.activeSkill?.name === 'programmer') {
    const workspacePath = `/workspace/projects/${input.user.id}`;
    prompt = prompt
      .replace(/\/workspace\/projects\//g, `${workspacePath}/`)
      .replace(/\/workspace\/projects(?=\s|$|["'])/g, workspacePath);
  }

  return prompt;
}
