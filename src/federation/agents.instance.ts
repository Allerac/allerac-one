/** Default, DB-backed AgentsService wiring for the inbound federation routes. */
import pool from '@/app/clients/db';
import { acquireOperationLimit } from '@/app/lib/operation-limiter';
import { assertDomainAccess } from '@/app/lib/domain-access-check';
import { executeChatMessage } from '@/app/services/chat/chat-execution.service';
import type { ChatProvider } from '@/app/services/chat/chat-request-parser';
import { domainModelSettingsService } from '@/app/services/domains/domain-model-settings.service';
import { SystemSettingsService } from '@/app/services/system/system-settings.service';
import { UserSettingsService } from '@/app/services/user/user-settings.service';
import { AgentsService } from './agents.service';
import { askDedupeRepository } from './ask-dedupe.repository';
import { resolveFederationModel, type ResolvedProvider } from './model-resolution';
import { federationAuditRepository } from './audit.repository';
import { peerRepository } from './peer.repository';
import { loadUnitProfile } from './unit-profile.repository';

const userSettingsService = new UserSettingsService();
const systemSettingsService = new SystemSettingsService();

const present = (value: string | null | undefined) => typeof value === 'string' && value.trim().length > 0;

async function configuredProviders(userId: string): Promise<Set<ResolvedProvider>> {
  const [user, system] = await Promise.all([
    userSettingsService.loadUserSettings(userId),
    systemSettingsService.loadAll().catch(() => null),
  ]);
  const providers = new Set<ResolvedProvider>();
  if (present(user?.anthropic_api_key) || present(system?.anthropic_api_key) || present(process.env.ANTHROPIC_API_KEY)) providers.add('anthropic');
  if (present(user?.openai_api_key) || present(system?.openai_api_key) || present(process.env.OPENAI_API_KEY)) providers.add('openai');
  if (present(user?.google_api_key) || present(system?.google_api_key) || present(process.env.GOOGLE_API_KEY)) providers.add('gemini');
  if (present(user?.github_token) || present(system?.github_token) || present(process.env.GITHUB_TOKEN)) providers.add('github');
  if (present(process.env.OLLAMA_BASE_URL)) providers.add('ollama');
  return providers;
}

export const agentsService = new AgentsService({
  store: peerRepository,
  audit: federationAuditRepository,
  acquire: (operation, subject) => acquireOperationLimit(operation, subject),
  loadProfile: loadUnitProfile,
  dedupe: askDedupeRepository,
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
      // Federated conversations stay in chat history, tagged source='federation'
      // so memory extraction skips them (P4 decision 1, mig 146).
      const existing = await pool.query(
        `SELECT id FROM chat_conversations
         WHERE user_id = $1 AND domain_slug = $2 AND title = $3 AND source = 'federation'
         ORDER BY created_at DESC LIMIT 1`,
        [userId, slug, title],
      );
      if (existing.rows[0]) return existing.rows[0].id;
      const created = await pool.query(
        `INSERT INTO chat_conversations (user_id, title, domain_slug, source)
         VALUES ($1, $2, $3, 'federation') RETURNING id`,
        [userId, title, slug],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new Error('Failed to create federation conversation');
      return id;
    },
    async createFederatedConversation({ userId, slug, principalId, title }) {
      const created = await pool.query(
        `INSERT INTO chat_conversations (user_id, title, domain_slug, source, federation_principal_id)
         VALUES ($1, $2, $3, 'federation', $4) RETURNING id`,
        [userId, title, slug, principalId],
      );
      const id = created.rows[0]?.id;
      if (!id) throw new Error('Failed to create federation conversation');
      return id;
    },
    async ownsFederatedConversation({ id, userId, slug, principalId }) {
      const result = await pool.query(
        `SELECT 1 FROM chat_conversations
         WHERE id = $1 AND user_id = $2 AND domain_slug = $3
           AND source = 'federation' AND federation_principal_id = $4`,
        [id, userId, slug, principalId],
      );
      return (result.rowCount ?? 0) > 0;
    },
    resolveModel: (userId, slug) => resolveFederationModel({
      domainDefault: (id, domain) => domainModelSettingsService.resolveDomainDefault(id, domain),
      userSelectedModel: async id => (await userSettingsService.loadUserSettings(id))?.selected_model ?? null,
      configuredProviders,
    }, userId, slug),
    async runChat(input) {
      const result = await executeChatMessage({
        ...input,
        // Admin-only features stay off for federated requests.
        user: { ...input.user, is_admin: false },
        provider: input.provider as ChatProvider,
        toolPolicy: 'federated',
      });
      const latest = await pool.query(
        `SELECT id FROM chat_messages WHERE conversation_id = $1 AND role = 'assistant'
         ORDER BY created_at DESC LIMIT 1`,
        [input.conversationId],
      );
      return { content: result.content, messageId: latest.rows[0]?.id ? String(latest.rows[0].id) : null };
    },
  },
});
