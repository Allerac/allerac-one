import { createHash } from 'crypto';
import pool from '@/app/clients/db';
import { NotesService } from '@/app/services/notes/notes.service';
import type { NotesConnector, NotesConnectorItem, NotesConnectorProvider } from './types';

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

interface ConnectorItemRow {
  external_id: string;
  note_id: string;
  external_content_hash: string;
  imported_content_hash: string;
  status: 'synced' | 'conflict';
}

export interface ImportSummary {
  imported: number;
  updated: number;
  failed: { externalId: string; error: string }[];
}

export interface ResyncSummary {
  unchanged: number;
  updated: number;
  conflicts: number;
  failed: { externalId: string; error: string }[];
}

export interface ConflictRow {
  externalId: string;
  noteId: string;
  sourceUrl: string;
  title: string | null;
}

/**
 * Provider-agnostic import/resync pipeline for Notes connectors. Providers
 * only need to implement NotesConnector.fetchContent/normalizeToMarkdown
 * (and, for OneNote, listItems) — this class owns the note upsert, dedup,
 * and the local-edit conflict rule documented in
 * docs/roadmap/notes-external-connectors.md.
 */
export class NotesConnectorItemsService {
  private readonly notes = new NotesService();

  constructor(
    private readonly provider: NotesConnectorProvider,
    private readonly connector: Pick<NotesConnector, 'fetchContent' | 'normalizeToMarkdown'>,
  ) {}

  /** Explicit, user-selected import (Picker result or OneNote checkbox tree). Always applies the fetched content. */
  async importSelected(userId: string, credentialId: string, accessToken: string, items: NotesConnectorItem[]): Promise<ImportSummary> {
    const summary: ImportSummary = { imported: 0, updated: 0, failed: [] };

    for (const item of items) {
      try {
        const markdown = await this.fetchAndNormalize(accessToken, item.externalId);
        const contentHash = hash(markdown);

        const existing = await pool.query<{ note_id: string }>(
          `SELECT note_id FROM notes_connector_items WHERE credential_id = $1 AND external_id = $2`,
          [credentialId, item.externalId],
        );

        const tags = item.parentLabel ? [item.parentLabel] : [];

        if (existing.rows[0]) {
          await this.notes.updateNote(userId, existing.rows[0].note_id, { content: markdown, title: item.title, tags });
          await pool.query(
            `UPDATE notes_connector_items
             SET external_content_hash=$3, imported_content_hash=$3, status='synced', pending_external_content_hash=NULL,
                 source_url=$4, provider_modified_at=$5, last_synced_at=NOW()
             WHERE credential_id=$1 AND external_id=$2`,
            [credentialId, item.externalId, contentHash, item.sourceUrl, item.modifiedAt],
          );
          summary.updated += 1;
        } else {
          const note = await this.notes.createNote(userId, { content: markdown, title: item.title, tags, source: this.provider });
          await pool.query(
            `INSERT INTO notes_connector_items (
               credential_id, external_id, note_id, source_url, external_content_hash, imported_content_hash, provider_modified_at
             ) VALUES ($1,$2,$3,$4,$5,$5,$6)`,
            [credentialId, item.externalId, note.id, item.sourceUrl, contentHash, item.modifiedAt],
          );
          summary.imported += 1;
        }
      } catch (error) {
        summary.failed.push({ externalId: item.externalId, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return summary;
  }

  /**
   * Re-checks previously imported items only — never expands the selection.
   * Never overwrites a note the user edited locally since import; such items
   * are marked status='conflict' for explicit resolution instead.
   */
  async resync(userId: string, credentialId: string, accessToken: string): Promise<ResyncSummary> {
    const summary: ResyncSummary = { unchanged: 0, updated: 0, conflicts: 0, failed: [] };

    const rows = await pool.query<ConnectorItemRow>(
      `SELECT external_id, note_id, external_content_hash, imported_content_hash, status
       FROM notes_connector_items WHERE credential_id = $1`,
      [credentialId],
    );

    for (const row of rows.rows) {
      try {
        const markdown = await this.fetchAndNormalize(accessToken, row.external_id);
        const newHash = hash(markdown);

        if (newHash === row.external_content_hash) {
          summary.unchanged += 1;
          continue;
        }

        const currentNote = await pool.query<{ content: string }>(`SELECT content FROM user_notes WHERE id = $1`, [row.note_id]);
        const currentContent = currentNote.rows[0]?.content ?? '';
        const editedLocally = hash(currentContent) !== row.imported_content_hash;

        if (editedLocally) {
          await pool.query(
            `UPDATE notes_connector_items SET status='conflict', pending_external_content_hash=$3, last_synced_at=NOW()
             WHERE credential_id=$1 AND external_id=$2`,
            [credentialId, row.external_id, newHash],
          );
          summary.conflicts += 1;
        } else {
          await this.notes.updateNote(userId, row.note_id, { content: markdown });
          await pool.query(
            `UPDATE notes_connector_items
             SET external_content_hash=$3, imported_content_hash=$3, status='synced', pending_external_content_hash=NULL, last_synced_at=NOW()
             WHERE credential_id=$1 AND external_id=$2`,
            [credentialId, row.external_id, newHash],
          );
          summary.updated += 1;
        }
      } catch (error) {
        summary.failed.push({ externalId: row.external_id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    return summary;
  }

  async listConflicts(credentialId: string): Promise<ConflictRow[]> {
    const rows = await pool.query<{ external_id: string; note_id: string; source_url: string; title: string | null }>(
      `SELECT nci.external_id, nci.note_id, nci.source_url, un.title
       FROM notes_connector_items nci
       JOIN user_notes un ON un.id = nci.note_id
       WHERE nci.credential_id = $1 AND nci.status = 'conflict'`,
      [credentialId],
    );
    return rows.rows.map(r => ({ externalId: r.external_id, noteId: r.note_id, sourceUrl: r.source_url, title: r.title }));
  }

  async resolveConflict(userId: string, credentialId: string, accessToken: string, externalId: string, resolution: 'keep_local' | 'use_source'): Promise<void> {
    const row = await pool.query<{ note_id: string; pending_external_content_hash: string | null; status: string }>(
      `SELECT note_id, pending_external_content_hash, status FROM notes_connector_items WHERE credential_id = $1 AND external_id = $2`,
      [credentialId, externalId],
    );
    const item = row.rows[0];
    if (!item || item.status !== 'conflict' || !item.pending_external_content_hash) return;

    if (resolution === 'keep_local') {
      await pool.query(
        `UPDATE notes_connector_items SET external_content_hash=$3, status='synced', pending_external_content_hash=NULL
         WHERE credential_id=$1 AND external_id=$2`,
        [credentialId, externalId, item.pending_external_content_hash],
      );
      return;
    }

    const markdown = await this.fetchAndNormalize(accessToken, externalId);
    const newHash = hash(markdown);
    await this.notes.updateNote(userId, item.note_id, { content: markdown });
    await pool.query(
      `UPDATE notes_connector_items
       SET external_content_hash=$3, imported_content_hash=$3, status='synced', pending_external_content_hash=NULL
       WHERE credential_id=$1 AND external_id=$2`,
      [credentialId, externalId, newHash],
    );
  }

  private async fetchAndNormalize(accessToken: string, externalId: string): Promise<string> {
    const content = await this.connector.fetchContent(accessToken, externalId);
    return this.connector.normalizeToMarkdown(content);
  }
}
