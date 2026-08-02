import { skillsService } from '@/app/services/skills/skills.service';
import { EMAIL_TOOL_DEFINITIONS } from '@/app/tools/email.tool';
import { GITHUB_TOOL_NAMES } from '@/app/tools/github.tool.definitions';
import { LOGS_TOOL_NAMES } from '@/app/tools/logs.tool.definitions';
import {
  CREATE_MEMORY_TOOL_DEFINITION,
  MEMORY_DOMAIN_TOOL_DEFINITIONS,
  RECALL_MEMORY_TOOL_DEFINITION,
} from '@/app/tools/memory.tool.definitions';
import { JOBS_TOOL_DEFINITIONS, SCHEDULE_TASK_TOOL_DEFINITION } from '@/app/tools/jobs.tool';
import { NOTES_TOOL_DEFINITIONS } from '@/app/tools/notes.tool';
import { TICKETS_TOOL_DEFINITIONS } from '@/app/tools/tickets.tool';
import { TOOLS } from '@/app/tools/tools';
import { LEARN_INSTRUCTION_TOOL_DEFINITION } from '@/app/tools/instructions.tool.definitions';

export { GITHUB_TOOL_NAMES };
export { LOGS_TOOL_NAMES };

export const NOTE_TOOL_NAMES = ['save_note', 'query_vault', 'list_notes', 'delete_note', 'update_note'];
export const EMAIL_TOOL_NAMES = ['list_emails', 'read_email', 'send_email'];
export const JOB_TOOL_NAMES = ['list_jobs', 'create_job', 'update_job', 'delete_job', 'toggle_job'];
export const SCHEDULE_TASK_TOOL_NAME = 'schedule_task';
export const LEARN_INSTRUCTION_TOOL_NAME = 'learn_instruction';
export const TICKET_TOOL_NAMES = ['list_tickets', 'create_ticket', 'update_ticket_status', 'get_ticket'];
export const MEMORY_TOOL_NAMES = ['recall_memory', 'search_memory', 'create_memory', 'delete_memory'];

const DOMAIN_TOOL_NAMES = [
  ...NOTE_TOOL_NAMES,
  ...EMAIL_TOOL_NAMES,
  ...JOB_TOOL_NAMES,
  ...TICKET_TOOL_NAMES,
];

export async function resolveChatTools(
  skillId: string | null | undefined,
  domain: string,
): Promise<any[]> {
  let tools: any[] = TOOLS;

  if (skillId) {
    const allowedToolNames = await skillsService.getSkillTools(skillId);
    if (allowedToolNames.length > 0) {
      tools = TOOLS.filter((tool) => allowedToolNames.includes(tool.function.name));
    }
  }

  return [
    ...tools.filter((tool) => !DOMAIN_TOOL_NAMES.includes(tool.function.name)
      && !['recall_memory', 'create_memory'].includes(tool.function.name)),
    RECALL_MEMORY_TOOL_DEFINITION,
    CREATE_MEMORY_TOOL_DEFINITION,
    SCHEDULE_TASK_TOOL_DEFINITION,
    LEARN_INSTRUCTION_TOOL_DEFINITION,
    ...NOTES_TOOL_DEFINITIONS,
    ...(domain === 'memory' ? MEMORY_DOMAIN_TOOL_DEFINITIONS : []),
    ...(domain === 'email' ? EMAIL_TOOL_DEFINITIONS : []),
    ...(domain === 'jobs' ? JOBS_TOOL_DEFINITIONS : []),
    ...(domain === 'tickets' ? TICKETS_TOOL_DEFINITIONS : []),
  ];
}
