/** @jest-environment node */
import fs from 'fs';
import path from 'path';
import { canUseInbox } from '@/federation/inbox-policy';

const SRC = path.join(__dirname, '..', '..');

describe('canUseInbox', () => {
  it('is admin only', () => {
    expect(canUseInbox({ is_admin: true })).toBe(true);
    expect(canUseInbox({ is_admin: false })).toBe(false);
    expect(canUseInbox(null)).toBe(false);
  });

  it('is never available in public domains', () => {
    expect(canUseInbox({ is_admin: true }, 'sales')).toBe(false);
    expect(canUseInbox({ is_admin: true }, 'OpenWorld')).toBe(false);
    expect(canUseInbox({ is_admin: true }, 'health')).toBe(true);
  });
});

describe('unified inbox guards', () => {
  const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

  it('browser code never calls peers or handles keys', () => {
    for (const file of ['app/components/inbox/inbox-api.ts', 'app/components/inbox/AgentsInboxSection.tsx', 'app/components/inbox/FederatedThreadPanel.tsx']) {
      const source = read(file);
      expect(source).not.toMatch(/outboundKey|federation-client|peer-client|Authorization/);
      expect(source).not.toMatch(/fetch\(\s*['"`]https?:/);
      expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    }
  });

  it('peer conversations are excluded from memory extraction', () => {
    const memory = read('app/services/memory/conversation-memory.service.ts');
    expect(memory.match(/cc\.source <> 'federation'/g)).toHaveLength(2);
    expect(read('federation/agents.instance.ts')).toContain("VALUES ($1, $2, $3, 'federation')");
  });

  it('migration 146 keeps remote text out of chat_conversations', () => {
    const sql = read('database/migrations/146_federated_threads.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS federated_threads');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS federated_messages');
    expect(sql).toMatch(/peer_id UUID NOT NULL REFERENCES federation_peers\(id\) ON DELETE CASCADE/);
  });
});
