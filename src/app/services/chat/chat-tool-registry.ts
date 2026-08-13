import { skillsService } from '@/app/services/skills/skills.service';
import { EMAIL_TOOL_DEFINITIONS } from '@/app/tools/email.tool';
import { GITHUB_TOOL_NAMES } from '@/app/tools/github.tool.definitions';
import { LOGS_TOOL_NAMES } from '@/app/tools/logs.tool.definitions';
import { JOBS_TOOL_DEFINITIONS } from '@/app/tools/jobs.tool';
import { NOTES_TOOL_DEFINITIONS } from '@/app/tools/notes.tool';
import { TICKETS_TOOL_DEFINITIONS } from '@/app/tools/tickets.tool';
import { TOOLS } from '@/app/tools/tools';

export { GITHUB_TOOL_NAMES };
export { LOGS_TOOL_NAMES };

export const NOTE_TOOL_NAMES = ['save_note', 'query_vault', 'list_notes', 'delete_note', 'update_note'];
export const EMAIL_TOOL_NAMES = ['list_emails', 'read_email', 'send_email'];
export const JOB_TOOL_NAMES = ['list_jobs', 'create_job', 'update_job', 'delete_job', 'toggle_job'];
export const TICKET_TOOL_NAMES = ['list_tickets', 'create_ticket', 'update_ticket_status', 'get_ticket'];

const DOMAIN_TOOL_NAMES = [
  ...NOTE_TOOL_NAMES,
  ...EMAIL_TOOL_NAMES,
  ...JOB_TOOL_NAMES,
  ...TICKET_TOOL_NAMES,
];

// Public-facing domains (reached by a service account with no personal data
// access, e.g. the website sales widget) that must not get the personal
// notes vault, even though every other domain does by default below.
const PUBLIC_DOMAINS = ['sales'];

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
  let tools: any[] = TOOLS;

  if (skillId) {
    const allowedToolNames = await skillsService.getSkillTools(skillId);
    if (allowedToolNames.length > 0) {
      tools = TOOLS.filter((tool) => allowedToolNames.includes(tool.function.name));
    }
  }

  return [
    ...tools.filter((tool) => !DOMAIN_TOOL_NAMES.includes(tool.function.name)),
    ...(PUBLIC_DOMAINS.includes(domain) ? [] : NOTES_TOOL_DEFINITIONS),
    ...(domain === 'email' ? EMAIL_TOOL_DEFINITIONS : []),
    ...(domain === 'jobs' ? JOBS_TOOL_DEFINITIONS : []),
    ...(domain === 'tickets' ? TICKETS_TOOL_DEFINITIONS : []),
    ...(domain === 'sales' ? SALES_TICKET_TOOL_DEFINITIONS : []),
  ];
}
