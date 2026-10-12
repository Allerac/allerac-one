'use server';

import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { KnowledgeGraphService } from '@/app/services/knowledge/knowledge-graph.service';

const knowledgeGraphService = new KnowledgeGraphService();

export async function getKnowledgeGraph(limit = 200, domainSlug?: string | null) {
  const user = await requireCurrentUser();
  if (domainSlug) await assertDomainAccess(user, domainSlug);
  return knowledgeGraphService.getGraph(user.id, {
    limit,
    domainSlug,
    isAdmin: user.is_admin,
  });
}
