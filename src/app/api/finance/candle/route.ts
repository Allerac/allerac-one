import { NextRequest, NextResponse } from 'next/server';
import {
  authenticationErrorResponse,
  assertDomainAccess,
  ForbiddenError,
  requireCurrentUser,
  UnauthorizedError,
} from '@/app/lib/auth-session';

type Period = '1W' | '1M' | '6M';
const PERIODS = new Set<Period>(['1W', '1M', '6M']);
const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;

function periodToYahooParams(period: Period): { interval: string; range: string } {
  switch (period) {
    case '1W': return { interval: '1h',  range: '5d' };
    case '1M': return { interval: '1d',  range: '1mo' };
    case '6M': return { interval: '1d',  range: '6mo' };
  }
}

export async function GET(req: NextRequest) {
  try {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'finance');

    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol')?.trim().toUpperCase();
    const requestedPeriod = searchParams.get('period') ?? '1M';

    if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
      return NextResponse.json({ error: 'Invalid symbol' }, { status: 400 });
    }
    if (!PERIODS.has(requestedPeriod as Period)) {
      return NextResponse.json({ error: 'Invalid period' }, { status: 400 });
    }
    const period = requestedPeriod as Period;

    const { interval, range } = periodToYahooParams(period);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    if (!res.ok) return NextResponse.json({ candles: [] });

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp?.length) return NextResponse.json({ candles: [] });

    const closes = result.indicators?.quote?.[0]?.close as (number | null)[];
    const timestamps = result.timestamp as number[];

    const candles = timestamps
      .map((t: number, i: number) => ({ t: t * 1000, c: closes[i] }))
      .filter((c): c is { t: number; c: number } => c.c != null);

    return NextResponse.json({ candles });
  } catch (error) {
    const authError = authenticationErrorResponse(error);
    if (authError) return authError;
    console.error('[Finance Candle API] Request failed:', error);
    return NextResponse.json({ error: 'Failed to load candles' }, { status: 500 });
  }
}
