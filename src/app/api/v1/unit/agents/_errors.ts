import { UnitAgentError } from '@/app/services/agent/unit-agents.repository';
import { apiError } from '../../_lib/responses';

const STATUS: Record<UnitAgentError['code'], number> = {
  invalid_slug: 400,
  unknown_bot: 400,
  slug_reserved: 409,
  slug_taken: 409,
  default_agent_locked: 409,
  not_found: 404,
};

/** API response for a bot management error, or null for any other error. */
export function unitAgentErrorResponse(error: unknown): Response | null {
  if (!(error instanceof UnitAgentError)) return null;
  return apiError(error.code, error.message, STATUS[error.code], error.details);
}
