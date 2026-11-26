import { render, screen } from '@testing-library/react';
import TerminalSessionHistory from '@/app/connections/TerminalSessionHistory';
import en from '@/i18n/messages/en.json';

jest.mock('next-intl', () => {
  const lookup = (namespace: string, key: string) =>
    [...namespace.split('.'), ...key.split('.')].reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], en);
  const translators: Record<string, (key: string, params?: Record<string, unknown>) => string> = {};
  return {
    useLocale: () => 'en',
    useTranslations: (namespace: string) => (translators[namespace] ??= (key: string, params?: Record<string, unknown>) => {
      const value = lookup(namespace, key);
      return typeof value === 'string' ? value.replace(/\{(\w+)\}/g, (_, name) => String(params?.[name])) : key;
    }),
  };
});

const originalFetch = global.fetch;
// jsdom has no Response; the component only uses ok, status and json().
const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
afterEach(() => { global.fetch = originalFetch; });

test('shows translated lifecycle events', async () => {
  global.fetch = jest.fn().mockResolvedValue(reply({ events: [
    { id: '1', provider: 'codex', sessionId: '12345678-aaaa', event: 'exited', exitCode: 2, userEmail: null, userName: null, createdAt: '2026-11-26T10:00:00Z' },
  ] }));
  render(<TerminalSessionHistory className="" />);
  expect(await screen.findByText('CLI exited')).toBeInTheDocument();
  expect(screen.getByText(/\(code 2\)/)).toBeInTheDocument();
  expect(screen.getByText('system')).toBeInTheDocument();
  expect(screen.getByText(/session 12345678/)).toBeInTheDocument();
});

test('translates the history_unavailable error code', async () => {
  global.fetch = jest.fn().mockResolvedValue(reply({ error: 'x', code: 'history_unavailable' }, 503));
  render(<TerminalSessionHistory className="" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load the terminal history.');
});
