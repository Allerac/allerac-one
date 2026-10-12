import { createHash } from 'crypto';

/** Text that represents a note in the semantic index. */
export function buildNoteIndexText(title: string | null | undefined, content: string): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle ? `${trimmedTitle}\n\n${content}` : content;
}

export function hashNoteIndexText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Label stored in documents.filename for a note-backed document. */
export function noteDocumentName(title: string | null | undefined, content: string): string {
  const trimmedTitle = title?.trim();
  return trimmedTitle || content.slice(0, 60).replace(/\n/g, ' ');
}

const DEFAULT_DEBOUNCE_MS = 15_000;

function configuredDebounceMs(): number {
  const parsed = Number(process.env.NOTE_REINDEX_DEBOUNCE_MS ?? DEFAULT_DEBOUNCE_MS);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEBOUNCE_MS;
}

type Reindexer = (userId: string, noteId: string) => Promise<unknown>;

/**
 * Debounced, per-note re-embedding queue.
 *
 * Saves only schedule work; the save request never waits for embeddings. Each
 * note gets at most one pending timer (reset on every save) and at most one
 * running reindex. A save that lands while a reindex is running triggers one
 * follow-up run. The embedding calls themselves go through the shared
 * EmbeddingScheduler with 'document' (background) priority, so interactive
 * queries stay ahead of them.
 *
 * Pending work is in-memory: if the process exits first, the note keeps a stale
 * content_hash and is re-embedded on its next save.
 */
export class NoteReindexQueue {
  private readonly timers = new Map<string, { timer: ReturnType<typeof setTimeout>; userId: string }>();
  private readonly running = new Map<string, Promise<void>>();
  private readonly rerun = new Map<string, string>();

  constructor(
    private readonly reindex: Reindexer,
    private readonly debounceMs: number = configuredDebounceMs(),
  ) {}

  schedule(userId: string, noteId: string): void {
    const pending = this.timers.get(noteId);
    if (pending) clearTimeout(pending.timer);
    const timer = setTimeout(() => this.start(userId, noteId), this.debounceMs);
    // Do not keep the process alive just for a pending reindex.
    (timer as { unref?: () => void }).unref?.();
    this.timers.set(noteId, { timer, userId });
  }

  cancel(noteId: string): void {
    const pending = this.timers.get(noteId);
    if (pending) clearTimeout(pending.timer);
    this.timers.delete(noteId);
    this.rerun.delete(noteId);
  }

  getStats(): { pending: number; running: number } {
    return { pending: this.timers.size, running: this.running.size };
  }

  /** Runs all pending work now and waits for it (tests and graceful shutdown). */
  async flush(): Promise<void> {
    for (const [noteId, { timer, userId }] of [...this.timers.entries()]) {
      clearTimeout(timer);
      this.start(userId, noteId);
    }
    while (this.running.size > 0 || this.timers.size > 0) {
      await Promise.all([...this.running.values()]);
    }
  }

  private start(userId: string, noteId: string): void {
    this.timers.delete(noteId);
    if (this.running.has(noteId)) {
      this.rerun.set(noteId, userId);
      return;
    }
    const run = Promise.resolve()
      .then(() => this.reindex(userId, noteId))
      .then(
        () => undefined,
        (error: unknown) => console.error(`[Notes] Background re-embedding failed for note ${noteId}:`, error),
      )
      .finally(() => {
        this.running.delete(noteId);
        const rerunUser = this.rerun.get(noteId);
        if (rerunUser) {
          this.rerun.delete(noteId);
          this.start(rerunUser, noteId);
        }
      });
    this.running.set(noteId, run);
  }
}
