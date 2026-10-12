export interface WikiQuery {
  /** Index of the first character after `[[`. */
  start: number;
  query: string;
}

/** Returns the open `[[query` right before the cursor, if any. */
export function getWikiQuery(text: string, cursor: number): WikiQuery | null {
  const before = text.slice(0, cursor);
  const open = before.lastIndexOf('[[');
  if (open < 0) return null;
  const query = before.slice(open + 2);
  if (/[\]\n[|]/.test(query) || query.length > 100) return null;
  return { start: open + 2, query };
}

/** Inserts `title]]` for the open query, consuming an existing `]]` after the cursor. */
export function applyWikiCompletion(text: string, q: WikiQuery, cursor: number, title: string) {
  const after = text.slice(cursor);
  const rest = after.startsWith(']]') ? after.slice(2) : after;
  const next = `${text.slice(0, q.start)}${title}]]${rest}`;
  return { text: next, cursor: q.start + title.length + 2 };
}

/** Ranks titles: prefix matches first, then substring matches. */
export function matchTitles(titles: string[], query: string, limit = 8): string[] {
  const q = query.trim().toLowerCase();
  const unique = [...new Set(titles.filter(Boolean))];
  const prefix = unique.filter(t => t.toLowerCase().startsWith(q));
  const contains = unique.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q));
  return [...prefix, ...contains].slice(0, limit);
}

export const WIKI_HREF_PREFIX = '#note:';

/**
 * Rewrites [[Page]] / [[Page|alias]] into markdown links for preview only.
 * Code blocks and inline code are left untouched; stored content never changes.
 */
export function linkifyWikiLinks(markdown: string): string {
  return markdown
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\[\[([^[\]\n]+?)\]\]/g, (_m, inner: string) => {
      const [target, alias] = inner.split('|');
      const label = (alias ?? target).trim();
      const t = target.trim();
      if (!t) return _m;
      return `[${label.replace(/[[\]]/g, '')}](${WIKI_HREF_PREFIX}${encodeURIComponent(t)})`;
    })))
    .join('');
}

/** Target of the [[link]] that contains `pos` on its line, if any. */
export function wikiLinkAt(text: string, pos: number): string | null {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEndRaw = text.indexOf('\n', pos);
  const line = text.slice(lineStart, lineEndRaw < 0 ? text.length : lineEndRaw);
  const offset = pos - lineStart;
  const re = /\[\[([^[\]\n]+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (offset >= m.index && offset <= m.index + m[0].length) {
      const target = m[1].split('|')[0].trim();
      return target || null;
    }
  }
  return null;
}
