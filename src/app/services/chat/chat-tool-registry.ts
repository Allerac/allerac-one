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

// Public-facing domains (reached by a service account with no personal data
// access, e.g. the website sales widget) that must not get the personal
// notes vault, even though every other domain does by default below. Also
// used outside this file (e.g. the messages route) to apply extra abuse
// limits — anonymous website visitors get less trust than logged-in users.
export const PUBLIC_DOMAINS = ['sales', 'openworld'];

// Domains that must get literally zero tools, not just the domain/personal
// ones withheld from every PUBLIC_DOMAINS entry below. Deliberately NOT
// implemented via an empty skill_tools list for the domain's skill — an
// empty list means "unrestricted" (falls through to the full general-
// purpose TOOLS array, including execute_shell), not "no tools". See
// docs/domains/expose-agent-to-website.md ("Tool scoping is deny-by-default
// in intent, not in code").
//
// openworld used to be here (FAQ-answering only), but now has search_web
// explicitly granted via skill_tools (migration 130_openworld_search_web_tool.sql)
// so it can look up current foreign-trade news — still no create_ticket/lead-capture
// equivalent; visitors are told to reach out via WhatsApp/e-mail directly instead
// (see skills/openworld.md).
export const NO_TOOL_DOMAINS: string[] = [];

// The sales domain only ever needs to create a ticket (lead capture) — never
// list, read, or update tickets, which would let one website visitor read
// another visitor's captured lead (tickets are scoped by the calling
// account, and every visitor shares the same sales-bot account/conversation
// history model).
const SALES_TICKET_TOOL_DEFINITIONS = TICKETS_TOOL_DEFINITIONS.filter(
  (tool: any) => tool.function.name === 'create_ticket',
);

export async function resolveChatTools(
  skillId: string | null | undefined,
  domain: string,
): Promise<any[]> {
  if (NO_TOOL_DOMAINS.includes(domain)) {
    return [];
  }

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
    // Memory, scheduling, and self-instruction tools are otherwise unconditional across every
    // domain — withheld here for public-facing domains (no personal memory/automation access,
    // and learn_instruction in particular would let a visitor durably alter the agent's behavior).
    ...(PUBLIC_DOMAINS.includes(domain) ? [] : [
      RECALL_MEMORY_TOOL_DEFINITION,
      CREATE_MEMORY_TOOL_DEFINITION,
      SCHEDULE_TASK_TOOL_DEFINITION,
      LEARN_INSTRUCTION_TOOL_DEFINITION,
      ...NOTES_TOOL_DEFINITIONS,
    ]),
    ...(domain === 'memory' ? MEMORY_DOMAIN_TOOL_DEFINITIONS : []),
    ...(domain === 'email' ? EMAIL_TOOL_DEFINITIONS : []),
    ...(domain === 'jobs' ? JOBS_TOOL_DEFINITIONS : []),
    ...(domain === 'tickets' ? TICKETS_TOOL_DEFINITIONS : []),
    ...(domain === 'sales' ? SALES_TICKET_TOOL_DEFINITIONS : []),
  ];
}
