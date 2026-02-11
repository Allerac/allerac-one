import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

const SUPPORTED_LOCALES = ['en', 'es', 'pt'];
const DEFAULT_LOCALE = 'en';

function detectLocaleFromHeader(acceptLanguage: string | null): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  // Parse Accept-Language header (e.g., "pt-BR,pt;q=0.9,en;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map(lang => {
      const [code, q = 'q=1'] = lang.trim().split(';');
      const quality = parseFloat(q.replace('q=', '')) || 1;
      // Get base language (pt-BR -> pt, es-ES -> es)
      const baseCode = code.split('-')[0].toLowerCase();
      return { code: baseCode, quality };
    })
    .sort((a, b) => b.quality - a.quality);

  // Find first supported locale
  for (const { code } of languages) {
    if (SUPPORTED_LOCALES.includes(code)) {
      return code;
    }
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // Priority: 1. Cookie (user preference), 2. Browser language, 3. Default
  let locale = cookieStore.get('locale')?.value;

  if (!locale || !SUPPORTED_LOCALES.includes(locale)) {
    const acceptLanguage = headerStore.get('accept-language');
    locale = detectLocaleFromHeader(acceptLanguage);
  }

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  };
});
