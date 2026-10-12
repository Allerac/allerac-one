import pool from '@/app/clients/db';

export type InstructionSource = 'explicit' | 'distilled';

export interface DomainInstruction {
  id: string;
  instruction: string;
  source: InstructionSource;
  status: 'active' | 'revoked';
  evidence: string | null;
  sourceConversationId: string | null;
  sourceSummaryId: string | null;
  createdAt: string;
}

interface LearnInstructionsInput {
  userId: string;
  domainSlug: string;
  instructions: string[];
  source: InstructionSource;
  evidence?: string | null;
  sourceConversationId?: string | null;
  sourceSummaryId?: string | null;
}

const LEARNED_SECTION = '## Learned by Allerac';

function normalizeInstruction(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '').toLocaleLowerCase();
}

function composeDocument(baseContent: string, instructions: Array<{ instruction: string }>): string {
  const base = baseContent.trim();
  if (instructions.length === 0) return base;
  const learned = `${LEARNED_SECTION}\n${instructions.map(item => `- ${item.instruction}`).join('\n')}`;
  return base ? `${base}\n\n${learned}` : learned;
}

function mapInstruction(row: any): DomainInstruction {
  return {
    id: row.id,
    instruction: row.instruction,
    source: row.source,
    status: row.status,
    evidence: row.evidence ?? null,
    sourceConversationId: row.source_conversation_id ?? null,
    sourceSummaryId: row.source_summary_id ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export class DomainInstructionsService {
  async learn(input: LearnInstructionsInput): Promise<{ added: DomainInstruction[]; content: string }> {
    const values = input.instructions.map(value => value.trim()).filter(Boolean).slice(0, 10);
    if (values.length === 0) return { added: [], content: '' };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO user_domain_instructions
           (user_id, domain_slug, content, base_content, revision, last_writer)
         VALUES ($1, $2, '', '', 1, 'distiller')
         ON CONFLICT (user_id, domain_slug) DO NOTHING`,
        [input.userId, input.domainSlug],
      );
      const documentResult = await client.query(
        `SELECT base_content, content, revision
         FROM user_domain_instructions
         WHERE user_id = $1 AND domain_slug = $2
         FOR UPDATE`,
        [input.userId, input.domainSlug],
      );
      const added: DomainInstruction[] = [];
      for (const instruction of values) {
        const inserted = await client.query(
          `INSERT INTO domain_instructions
             (user_id, domain_slug, instruction, normalized_key, source, evidence,
              source_conversation_id, source_summary_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, domain_slug, normalized_key) WHERE status = 'active'
           DO NOTHING
           RETURNING *`,
          [
            input.userId,
            input.domainSlug,
            instruction,
            normalizeInstruction(instruction),
            input.source,
            input.evidence ?? null,
            input.sourceConversationId ?? null,
            input.sourceSummaryId ?? null,
          ],
        );
        if (inserted.rows[0]) added.push(mapInstruction(inserted.rows[0]));
      }

      if (added.length === 0) {
        await client.query('COMMIT');
        return { added: [], content: documentResult.rows[0].content };
      }

      const activeResult = await client.query(
        `SELECT instruction FROM domain_instructions
         WHERE user_id = $1 AND domain_slug = $2 AND status = 'active'
         ORDER BY created_at ASC`,
        [input.userId, input.domainSlug],
      );
      const content = composeDocument(documentResult.rows[0].base_content, activeResult.rows);
      const saved = await client.query(
        `UPDATE user_domain_instructions
         SET content = $3, revision = revision + 1, last_writer = 'distiller', updated_at = NOW()
         WHERE user_id = $1 AND domain_slug = $2
         RETURNING revision`,
        [input.userId, input.domainSlug, content],
      );
      await client.query(
        `INSERT INTO user_domain_instruction_versions
           (user_id, domain_slug, revision, content, writer, source_summary_id)
         VALUES ($1, $2, $3, $4, 'distiller', $5)`,
        [input.userId, input.domainSlug, saved.rows[0].revision, content, input.sourceSummaryId ?? null],
      );
      await client.query('COMMIT');
      return { added, content };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async list(userId: string, domainSlug: string): Promise<{
    content: string;
    baseContent: string;
    instructions: DomainInstruction[];
  }> {
    const [document, entries] = await Promise.all([
      pool.query(
        `SELECT content, base_content FROM user_domain_instructions
         WHERE user_id = $1 AND domain_slug = $2`,
        [userId, domainSlug],
      ),
      pool.query(
        `SELECT * FROM domain_instructions
         WHERE user_id = $1 AND domain_slug = $2 AND status = 'active'
         ORDER BY created_at ASC`,
        [userId, domainSlug],
      ),
    ]);
    return {
      content: document.rows[0]?.content ?? '',
      baseContent: document.rows[0]?.base_content ?? '',
      instructions: entries.rows.map(mapInstruction),
    };
  }

  async revoke(userId: string, domainSlug: string, instructionId: string): Promise<boolean> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query(
        `UPDATE domain_instructions
         SET status = 'revoked', revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND domain_slug = $3 AND status = 'active'
         RETURNING id`,
        [instructionId, userId, domainSlug],
      );
      if (!revoked.rows[0]) {
        await client.query('COMMIT');
        return false;
      }
      const document = await client.query(
        `SELECT base_content FROM user_domain_instructions
         WHERE user_id = $1 AND domain_slug = $2
         FOR UPDATE`,
        [userId, domainSlug],
      );
      const active = await client.query(
        `SELECT instruction FROM domain_instructions
         WHERE user_id = $1 AND domain_slug = $2 AND status = 'active'
         ORDER BY created_at ASC`,
        [userId, domainSlug],
      );
      const content = composeDocument(document.rows[0]?.base_content ?? '', active.rows);
      const saved = await client.query(
        `UPDATE user_domain_instructions
         SET content = $3, revision = revision + 1, last_writer = 'distiller', updated_at = NOW()
         WHERE user_id = $1 AND domain_slug = $2
         RETURNING revision`,
        [userId, domainSlug, content],
      );
      await client.query(
        `INSERT INTO user_domain_instruction_versions
           (user_id, domain_slug, revision, content, writer)
         VALUES ($1, $2, $3, $4, 'distiller')`,
        [userId, domainSlug, saved.rows[0].revision, content],
      );
      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const domainInstructionsService = new DomainInstructionsService();
