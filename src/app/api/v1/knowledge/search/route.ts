import { z } from 'zod';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import {
  getKnowledgeSearchService,
  KNOWLEDGE_SOURCE_TYPES,
  MAX_KNOWLEDGE_LIMIT,
  type KnowledgeSourceType,
} from '@/app/services/knowledge/knowledge-search.service';
import { requireApiDomainUser, requireApiUser, type ApiUser } from '../../_lib/auth';
import { apiAuthError, apiData, apiError, apiInternalError } from '../../_lib/responses';

/** Each source type needs its own read scope; notes also need the notes domain. */
const SOURCE_SCOPES: Record<KnowledgeSourceType, string> = {
  note: 'notes:read',
  document: 'documents:read',
  memory: 'memory:read',
};

const querySchema = z.object({
  q: z.string().trim().min(1).max(1000),
  types: z.string().trim().optional(),
  domain: z.string().trim().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_KNOWLEDGE_LIMIT).optional(),
  include_archived: z.enum(['true', 'false']).optional(),
}).strict();

function parseTypes(raw: string | undefined): KnowledgeSourceType[] | null {
  if (!raw) return [...KNOWLEDGE_SOURCE_TYPES];
  const values = raw.split(',').map(v => v.trim().toLowerCase()).filter(Boolean);
  if (values.length === 0) return [...KNOWLEDGE_SOURCE_TYPES];
  // Unknown types (including 'ticket', which is never a knowledge source) are rejected.
  if (values.some(v => !(KNOWLEDGE_SOURCE_TYPES as readonly string[]).includes(v))) return null;
  return [...new Set(values)] as KnowledgeSourceType[];
}

export async function GET(request: Request): Promise<Response> {
  try {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiError('validation_error', 'Invalid query', 400, parsed.error.flatten());
    const types = parseTypes(parsed.data.types);
    if (!types) {
      return apiError('validation_error', `types must be a comma-separated subset of: ${KNOWLEDGE_SOURCE_TYPES.join(', ')}`, 400);
    }

    let user: ApiUser | null = null;
    for (const type of types) {
      user = type === 'note'
        ? await requireApiDomainUser(SOURCE_SCOPES[type], 'notes', request)
        : await requireApiUser(SOURCE_SCOPES[type], request);
    }
    if (!user) return apiError('unauthorized', 'Unauthorized', 401);

    const domain = parsed.data.domain ?? null;
    if (domain) await assertDomainAccess({ id: user.id, is_admin: user.isAdmin }, domain);

    const result = await getKnowledgeSearchService().search(
      { id: user.id, is_admin: user.isAdmin },
      parsed.data.q,
      {
        sourceTypes: types,
        domainSlug: domain,
        limit: parsed.data.limit,
        includeArchived: parsed.data.include_archived === 'true',
      },
    );

    return apiData({
      semanticAvailable: result.semanticAvailable,
      results: result.hits.map(hit => ({
        sourceType: hit.source_type,
        sourceId: hit.source_id,
        title: hit.title,
        snippet: hit.snippet,
        domainSlug: hit.domain_slug,
        score: Number(hit.score.toFixed(4)),
        similarity: hit.similarity === null ? null : Number(hit.similarity.toFixed(4)),
        match: hit.match,
        createdAt: hit.created_at,
      })),
    });
  } catch (error: unknown) {
    const authError = apiAuthError(error);
    if (authError) return authError;
    return apiInternalError('GET /api/v1/knowledge/search failed', error);
  }
}
