import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AuthService } from '@/app/services/auth/auth.service';

const authService = new AuthService();

type Period = '1W' | '1M' | '6M';

function periodToYahooParams(period: Period): { interval: string; range: string } {
  switch (period) {
    case '1W': return { interval: '1h',  range: '5d' };
    case '1M': return { interval: '1d',  range: '1mo' };
    case '6M': return { interval: '1d',  range: '6mo' };
  }
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('session_token')?.value;
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const user = await authService.validateSession(token);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get('symbol')?.toUpperCase();
  const period = (searchParams.get('period') ?? '1M') as Period;

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  const { interval, range } = periodToYahooParams(period);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=${interval}&range=${range}`;

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
}
