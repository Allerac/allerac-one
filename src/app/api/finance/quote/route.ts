import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';

const authService = new AuthService();
const HEADERS = { 'User-Agent': 'Mozilla/5.0' };

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const symbols = searchParams.get('symbols');
  const q = searchParams.get('q');

  // Symbol search (autocomplete)
  if (q) {
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

  const quotes = await Promise.all(
    symbolList.map(async (symbol: string) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`,
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
}
