/**
 * next-intl has no per-key fallback here, so every locale must define every
 * setup wizard key.
 */
import en from '@/i18n/messages/en.json';
import pt from '@/i18n/messages/pt.json';
import es from '@/i18n/messages/es.json';
import ca from '@/i18n/messages/ca.json';

const setupKeys = (messages: { setup: Record<string, string> }) => Object.keys(messages.setup).sort();

it.each([['pt', pt], ['es', es], ['ca', ca]])('%s defines the same setup keys as en', (_locale, messages) => {
  expect(setupKeys(messages as { setup: Record<string, string> })).toEqual(setupKeys(en as { setup: Record<string, string> }));
});
