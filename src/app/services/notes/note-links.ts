/** Maximum number of [[links]] parsed from one note (guards pathological input). */
export const MAX_LINKS_PER_NOTE = 200;
const MAX_TITLE_LENGTH = 200;

/** Removes fenced and inline code so `[[x]]` inside code is not treated as a link. */
function stripCode(markdown: string): string {
  return markdown
    .replace(/(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*(?=\n|$)|$)/g, '$1')
    .replace(/`[^`\n]*`/g, '');
}

/** Normalised key used to match a link target against note titles. */
export function normalizeLinkTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Extracts unique [[Page]] / [[Page|alias]] targets from markdown, in order of
 * first appearance. Matching is case-insensitive; the first spelling wins.
 */
export function parseWikiLinks(markdown: string): string[] {
  const text = stripCode(markdown ?? '');
  const seen = new Set<string>();
  const out: string[] = [];
  const re = /\[\[([^[\]\n]+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) && out.length < MAX_LINKS_PER_NOTE) {
    const target = m[1].split('|')[0].trim().replace(/\s+/g, ' ');
    if (!target || target.length > MAX_TITLE_LENGTH) continue;
    const key = normalizeLinkTitle(target);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(target);
  }
  return out;
}
