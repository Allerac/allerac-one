/** Default, DB-backed AgentsService wiring for the inbound federation routes. */
import pool from '@/app/clients/db';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import { executeChatMessage } from '@/app/services/chat/chat-execution.service';
import type { ChatProvider } from '@/app/services/chat/chat-request-parser';
import { ChatService } from '@/app/services/database/chat.service';
import { domainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';
import { AgentsService } from './agents.service';
import { federationAuditRepository } from './audit.repository';
import { peerRepository } from './peer.repository';

const chatService = new ChatService();

export const agentsService = new AgentsService({
  store: peerRepository,
  audit: federationAuditRepository,
  acquire: (operation, subject) => acquireOperationLimit(operation, subject),
  runtime: {
    async loadUser(userId) {
      const result = await pool.query(
        'SELECT id, email, name, is_admin, created_at FROM users WHERE id = $1 AND is_active = true',
        [userId],
      );
      return result.rows[0] ?? null;
    },
    async listActiveDomains(slugs) {
      const result = await pool.query(
        'SELECT slug, display_name FROM domains WHERE slug = ANY($1) AND is_active = true ORDER BY display_name',
        [slugs],
      );
      return result.rows.map(row => ({ slug: row.slug, displayName: row.display_name }));
    },
    async canAccessDomain(user, slug) {
      try {
        await assertDomainAccess(user, slug);
        return true;
      } catch {
        return false;
      }
    },
    async findOrCreateConversation(userId, slug, title) {
      const existing = await pool.query(
        `SELECT id FROM chat_conversations
         WHERE user_id = $1 AND domain_slug = $2 AND title = $3
         ORDER BY created_at DESC LIMIT 1`,
        [userId, slug, title],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const id = await chatService.createConversation(userId, title, slug);
      if (!id) throw new Error('Failed to create federation conversation');
      return id;
    },
    resolveModel: (userId, slug) => domainModelSettingsService.resolveDomainDefault(userId, slug),
    async runChat(input) {
      const result = await executeChatMessage({
        ...input,
        // Admin-only features stay off for federated requests.
        user: { ...input.user, is_admin: false },
        provider: input.provider as ChatProvider,
        toolPolicy: 'federated',
      });
      return { content: result.content };
    },
  },
});
