import pool from '@/app/clients/db';
import { assertDomainAccess, type DomainAccessUser } from '@/app/lib/domain-access-check';
import { NotesService, type Note } from '@/app/services/notes/notes.service';

export class PromoteMemoryError extends Error {
  constructor(message: string, readonly code: 'not_found') {
    super(message);
    this.name = 'PromoteMemoryError';
  }
}

export interface PromoteMemoryResult {
  note: Note;
  /** True when the memory had already been promoted; the existing page is returned. */
  alreadyPromoted: boolean;
}

const TITLE_MAX = 80;

/** Title for a promoted memory: the first sentence/line, trimmed to a readable length. */
export function titleFromMemory(summary: string): string {
  const firstLine = summary.trim().split(/\n/)[0] ?? '';
  const sentence = firstLine.split(/(?<=[.!?])\s/)[0] ?? firstLine;
  const base = (sentence || firstLine).trim();
  if (base.length <= TITLE_MAX) return base || 'Memory';
  const cut = base.slice(0, TITLE_MAX - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

/**
 * Turns a memory into a note page.
 *
 * Decision: the memory is kept unchanged. Memories feed chat recall and
 * promoting is about giving the knowledge an editable home, not moving it.
 * The relationship is recorded as a `note -derived_from-> memory` row in
 * knowledge_links, which marks the memory as promoted, makes promotion
 * idempotent, and shows up in the graph and in the page's Related panel.
 */
export class PromoteMemoryService {
  async promote(
    user: DomainAccessUser,
    memoryId: string,
    options: { parentId?: string | null; title?: string | null } = {},
  ): Promise<PromoteMemoryResult> {
    const memoryRes = await pool.query(
      `SELECT id, summary, key_topics, domain_slug FROM conversation_summaries WHERE id = $1 AND user_id = $2`,
      [memoryId, user.id],
    );
    const memory = memoryRes.rows[0] as { id: string; summary: string; key_topics: string[] | null; domain_slug: string | null } | undefined;
    if (!memory) throw new PromoteMemoryError('Memory not found', 'not_found');
    // The memory's own domain must be accessible, not just the notes domain.
    if (memory.domain_slug) await assertDomainAccess(user, memory.domain_slug);

    const existing = await pool.query(
      `SELECT n.* FROM knowledge_links l
       JOIN user_notes n ON n.id = l.from_id AND n.user_id = l.user_id
       WHERE l.user_id = $1 AND l.from_type = 'note' AND l.to_type = 'memory'
         AND l.to_id = $2 AND l.relation = 'derived_from'
       ORDER BY n.created_at ASC LIMIT 1`,
      [user.id, memoryId],
    );
    if (existing.rows[0]) return { note: existing.rows[0] as Note, alreadyPromoted: true };

    const tags = [...new Set((memory.key_topics ?? []).map(t => t.trim().toLowerCase()).filter(Boolean))].slice(0, 20);
    const note = await new NotesService().createNote(user.id, {
      title: options.title?.trim() || titleFromMemory(memory.summary),
      content: memory.summary,
      tags,
      source: 'memory',
      parent_id: options.parentId ?? null,
    });

    await pool.query(
      `INSERT INTO knowledge_links (user_id, from_type, from_id, to_type, to_id, relation)
       VALUES ($1, 'note', $2, 'memory', $3, 'derived_from')
       ON CONFLICT DO NOTHING`,
      [user.id, note.id, memoryId],
    );
    return { note, alreadyPromoted: false };
  }
}

export const promoteMemoryService = new PromoteMemoryService();
