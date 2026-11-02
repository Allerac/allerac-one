import {
  AGENT_HOME_PATH, dataPageLinkForTool, getEnabledDataPages, isLegacyDomainsEnabled, isSafeRelativeHref,
} from '@/lib/legacy-domains';
import { addPageLink } from '@/app/services/chat/chat-message.service';
import type { Message } from '@/app/types';

describe('isLegacyDomainsEnabled', () => {
  it('defaults to false', () => {
    expect(isLegacyDomainsEnabled({})).toBe(false);
    expect(isLegacyDomainsEnabled({ ALLERAC_LEGACY_DOMAINS: '' })).toBe(false);
    expect(isLegacyDomainsEnabled({ ALLERAC_LEGACY_DOMAINS: '1' })).toBe(false);
  });
  it('is on only for "true"', () => {
    expect(isLegacyDomainsEnabled({ ALLERAC_LEGACY_DOMAINS: 'true' })).toBe(true);
    expect(isLegacyDomainsEnabled({ ALLERAC_LEGACY_DOMAINS: ' TRUE ' })).toBe(true);
  });
});

describe('data pages', () => {
  it('lists core pages and enabled modules only', () => {
    const ids = getEnabledDataPages(null, { ALLERAC_MODULES: 'music' }).map(p => p.id);
    expect(ids).toEqual(expect.arrayContaining(['notes', 'jobs', 'memory', 'music']));
    expect(ids).not.toContain('health');
    expect(ids).not.toContain('email');
  });
  it('narrows to the slugs a user can access', () => {
    expect(getEnabledDataPages(['health', 'notes'], {}).map(p => p.id)).toEqual(['health', 'notes']);
  });
});

describe('dataPageLinkForTool', () => {
  it('links health tools to the dashboard', () => {
    expect(dataPageLinkForTool('get_health_summary', {})).toEqual({ href: '/health', label: 'Open health dashboard' });
    expect(dataPageLinkForTool('list_notes', {})).toEqual({ href: '/notes', label: 'Open notes' });
  });
  it('returns null for unknown tools and disabled modules', () => {
    expect(dataPageLinkForTool('search_web', {})).toBeNull();
    expect(dataPageLinkForTool('get_health_summary', { ALLERAC_MODULES: 'music' })).toBeNull();
  });
});

describe('isSafeRelativeHref', () => {
  it.each(['/health', '/health?date=2026-01-01', AGENT_HOME_PATH])('accepts %s', href => {
    expect(isSafeRelativeHref(href)).toBe(true);
  });
  it.each(['https://evil.example', '//evil.example', 'javascript:alert(1)', '/\\evil', 'health', '', null, 42])('rejects %p', href => {
    expect(isSafeRelativeHref(href)).toBe(false);
  });
});

describe('addPageLink', () => {
  const base: Message[] = [
    { role: 'user', content: 'hi', timestamp: new Date() },
    { role: 'assistant', content: '', timestamp: new Date() },
  ];
  it('adds the link once to the assistant message', () => {
    const once = addPageLink(base, '/health', 'Open health dashboard');
    const twice = addPageLink(once, '/health', 'Open health dashboard');
    expect(twice[1].actions).toEqual([{ type: 'page_link', href: '/health', label: 'Open health dashboard' }]);
  });
  it('ignores a non-assistant tail', () => {
    expect(addPageLink(base.slice(0, 1), '/health', 'x')).toEqual(base.slice(0, 1));
  });
});
