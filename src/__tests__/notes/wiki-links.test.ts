import { applyWikiCompletion, getWikiQuery, linkifyWikiLinks, matchTitles } from '@/app/notes/wiki-links';

describe('wiki link editor helpers', () => {
  it('detects an open [[ query at the cursor', () => {
    expect(getWikiQuery('see [[Road', 10)).toEqual({ start: 6, query: 'Road' });
    expect(getWikiQuery('see [[Road]] x', 14)).toBeNull();
    expect(getWikiQuery('no link', 7)).toBeNull();
    expect(getWikiQuery('[[a\nb', 5)).toBeNull();
  });

  it('completes the title and closes the link', () => {
    const text = 'see [[Ro and more';
    const q = getWikiQuery(text, 8)!;
    expect(applyWikiCompletion(text, q, 8, 'Roadmap')).toEqual({ text: 'see [[Roadmap]] and more', cursor: 15 });
    const closed = 'x [[Ro]]';
    expect(applyWikiCompletion(closed, getWikiQuery(closed, 6)!, 6, 'Roadmap').text).toBe('x [[Roadmap]]');
  });

  it('ranks prefix matches before substring matches', () => {
    expect(matchTitles(['Old roadmap', 'Roadmap', 'Ideas', 'Roadmap'], 'road')).toEqual(['Roadmap', 'Old roadmap']);
  });

  it('linkifies wiki links outside code only', () => {
    expect(linkifyWikiLinks('a [[My Page]] b [[X|alias]]')).toBe('a [My Page](#note:My%20Page) b [alias](#note:X)');
    expect(linkifyWikiLinks('`[[Code]]` and\n```\n[[Fenced]]\n```')).toBe('`[[Code]]` and\n```\n[[Fenced]]\n```');
  });
});
