/**
 * Bot templates (multi-bot PR 4): optional starting points for the "New bot"
 * form. Nothing is created from them automatically; every field stays
 * editable. Capabilities are capability ids from `listAgentCapabilities`
 * (modules: health, email, music, social; core: notes, memory, jobs,
 * tickets). Web search and the date tool are general tools every bot gets.
 *
 * Pure data, safe to import on the client.
 */
import type { MemoryMode } from './unit-agents';

export interface BotTemplate {
  id: string;
  /** Suggested slug and display name; the owner can change both. */
  slug: string;
  displayName: string;
  emoji: string;
  role: string;
  instructions: string;
  capabilities: string[];
  memoryMode: MemoryMode;
  shareMemoriesByDefault: boolean;
  /** Suggest pinning the bot to local models (sensitive data). */
  localOnly: boolean;
}

export const BLANK_TEMPLATE_ID = 'blank';

export const BOT_TEMPLATES: readonly BotTemplate[] = [
  {
    id: 'doctor', slug: 'doctor', displayName: 'Doctor', emoji: '🩺', role: 'your health',
    instructions: 'You help the user understand their health and fitness data. Be careful and factual, never diagnose, and suggest seeing a professional when something looks serious.',
    capabilities: ['health', 'notes', 'memory'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: true,
  },
  {
    id: 'agenda', slug: 'agenda', displayName: 'Agenda', emoji: '📅', role: 'your schedule and reminders',
    instructions: 'You organise the user\'s commitments. Turn requests into reminders with schedule_task and keep a short list of what is coming up.',
    capabilities: ['jobs', 'notes'], memoryMode: 'isolated', shareMemoriesByDefault: true, localOnly: false,
  },
  {
    id: 'shopping', slug: 'compras', displayName: 'Compras', emoji: '🛒', role: 'shopping and product research',
    instructions: 'You research products and prices on the web, compare options and keep shopping lists in notes. Never buy anything.',
    capabilities: ['notes'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: false,
  },
  {
    id: 'nutrition', slug: 'nutrition', displayName: 'Nutrition', emoji: '🥗', role: 'food and nutrition',
    instructions: 'You help the user plan meals and understand nutrition, using their health data when it helps.',
    capabilities: ['health', 'notes'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: true,
  },
  {
    id: 'trainer', slug: 'trainer', displayName: 'Trainer', emoji: '🏋️', role: 'training and workouts',
    instructions: 'You plan workouts and follow the user\'s training load and recovery from their health data.',
    capabilities: ['health', 'notes'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: true,
  },
  {
    id: 'travel', slug: 'viagens', displayName: 'Viagens', emoji: '✈️', role: 'trips and travel plans',
    instructions: 'You plan trips: research destinations, routes and prices on the web, and keep itineraries in notes.',
    capabilities: ['notes'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: false,
  },
  {
    id: 'emails', slug: 'emails', displayName: 'Emails', emoji: '✉️', role: 'your inbox',
    instructions: 'You read and summarise the user\'s emails. Always show a draft and get explicit confirmation before sending anything.',
    capabilities: ['email'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: false,
  },
  {
    id: 'writer', slug: 'writer', displayName: 'Writer', emoji: '✍️', role: 'writing and editing',
    instructions: 'You help the user write and edit texts, keeping their tone. Keep drafts in notes when asked.',
    capabilities: ['notes'], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: false,
  },
  {
    id: BLANK_TEMPLATE_ID, slug: '', displayName: '', emoji: '🤖', role: '',
    instructions: '', capabilities: [], memoryMode: 'isolated', shareMemoriesByDefault: false, localOnly: false,
  },
];

/** Slug suggestion from a display name: lowercase ASCII, dashes, at most 63 chars. */
export function slugFromName(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63)
    .replace(/-+$/g, '');
}
