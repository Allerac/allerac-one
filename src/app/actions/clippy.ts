'use server';

import {
  GRAMPEADOR_MODEL,
  GRAMPEADOR_OPTIONS,
  buildGrampeadorPrompt,
} from '@/app/config/grampeador';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';

const TIME_LABEL: Record<string, (h: number) => string> = {
  pt: h => h < 6 ? 'madrugada' : h < 12 ? 'manhã' : h < 18 ? 'tarde' : 'noite',
  en: h => h < 6 ? 'night'     : h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening',
  es: h => h < 6 ? 'madrugada' : h < 12 ? 'mañana'  : h < 18 ? 'tarde' : 'noche',
  ca: h => h < 6 ? 'matinada'  : h < 12 ? 'matí'    : h < 18 ? 'tarda' : 'nit',
};

const FORBIDDEN_RE = /^(aqui vai|here you go|aquí va|here|olha|look|sure|claro|veja|mira|vinga|clar)[:\s!]*/i;

function sanitize(raw: string): string {
  return raw
    .replace(FORBIDDEN_RE, '')
    .replace(/^["'"'«»]|["'"'»]$/g, '')
    .trim();
}

export async function generateClippyBubble(domain: string, locale = 'pt'): Promise<string | null> {
  const user = await requireCurrentUser();
  if (!/^[a-z0-9][a-z0-9_-]{0,49}$/.test(domain)) return null;
  await assertDomainAccess(user, domain);
  if (!Object.hasOwn(TIME_LABEL, locale)) locale = 'en';

  const hour = new Date().getHours();
  const timeFn = TIME_LABEL[locale] ?? TIME_LABEL['en'];
  const timeLabel = timeFn(hour);
  const prompt = buildGrampeadorPrompt(domain, timeLabel, locale);

  console.log(`[Grampeador] Gerando para domain="${domain}" locale="${locale}" ${hour}h (${timeLabel})`);

  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GRAMPEADOR_MODEL,
        prompt,
        stream: false,
        options: GRAMPEADOR_OPTIONS,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[Grampeador] Ollama respondeu ${res.status}`);
      return null;
    }

    const data = await res.json();
    const raw = (data.response as string | undefined)?.trim() ?? '';
    const text = sanitize(raw);

    console.log(`[Grampeador] Gerado: "${text}"`);
    return text || null;
  } catch (err) {
    console.warn(`[Grampeador] Falhou:`, err instanceof Error ? err.message : err);
    return null;
  }
}
