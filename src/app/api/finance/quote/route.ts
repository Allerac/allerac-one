import { NextRequest, NextResponse } from 'next/server';
import {
  authenticationErrorResponse,
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';

const HEADERS = { 'User-Agent': 'Mozilla/5.0' };
const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;
const MAX_SYMBOLS = 20;

export async function GET(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'finance');

    const { searchParams } = new URL(req.url);
    const symbols = searchParams.get('symbols');
    const q = searchParams.get('q')?.trim();

    // Symbol search (autocomplete)
    if (q) {
      if (q.length > 100) {
        return NextResponse.json({ error: 'Query too long' }, { status: 400 });
      }
      const res = await fetch(
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0&enableFuzzyQuery=false`,
        { headers: HEADERS }
      );
      if (!res.ok) return NextResponse.json({ result: [] });
      const data = await res.json();
      const result = (data.quotes ?? [])
        .filter((r: any) => r.quoteType === 'EQUITY' || r.quoteType === 'ETF')
        .map((r: any) => ({
          symbol: r.symbol,
          displaySymbol: r.symbol,
          description: r.shortname ?? r.longname ?? r.symbol,
          type: r.quoteType === 'ETF' ? 'ETP' : 'Common Stock',
        }));
      return NextResponse.json({ result });
    }

    if (!symbols) return NextResponse.json({ error: 'symbols or q required' }, { status: 400 });

    const symbolList = symbols.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean);
    if (
      symbolList.length === 0
      || symbolList.length > MAX_SYMBOLS
      || symbolList.some((symbol) => !SYMBOL_PATTERN.test(symbol))
    ) {
      return NextResponse.json({ error: 'Invalid symbols' }, { status: 400 });
    }

    const quotes = await Promise.all(
      symbolList.map(async (symbol: string) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
            { headers: HEADERS }
          );
          if (!res.ok) return { symbol, error: true };
          const data = await res.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta) return { symbol, error: true };
          const c = meta.regularMarketPrice ?? 0;
          const pc = meta.chartPreviousClose ?? meta.previousClose ?? c;
          const d = c - pc;
          const dp = pc !== 0 ? (d / pc) * 100 : 0;
          return {
            symbol,
            name: meta.shortName ?? meta.longName ?? symbol,
            c,
            d,
            dp,
          };
        } catch {
          return { symbol, error: true };
        }
      })
    );

    return NextResponse.json({ quotes });
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    console.error('[Finance Quote API] Request failed:', error);
    return NextResponse.json({ error: 'Failed to load quotes' }, { status: 500 });
  }
}
