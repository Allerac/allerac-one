const HEADERS = { 'User-Agent': 'Mozilla/5.0' };
const SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,20}$/;
const MAX_SYMBOLS = 20;

export type CandlePeriod = '1W' | '1M' | '6M';

export interface SymbolSearchResult {
  symbol: string;
  displaySymbol: string;
  description: string;
  type: string;
}

export interface QuoteResult {
  symbol: string;
  name?: string;
  c?: number;
  d?: number;
  dp?: number;
  error?: boolean;
}

export interface Candle {
  t: number;
  c: number;
}

function assertValidSymbols(symbols: string[]): void {
  if (
    symbols.length === 0
    || symbols.length > MAX_SYMBOLS
    || symbols.some((symbol) => !SYMBOL_PATTERN.test(symbol))
  ) {
    throw new Error('Invalid symbols');
  }
}

function periodToYahooParams(period: CandlePeriod): { interval: string; range: string } {
  switch (period) {
    case '1W': return { interval: '1h', range: '5d' };
    case '1M': return { interval: '1d', range: '1mo' };
    case '6M': return { interval: '1d', range: '6mo' };
  }
}

export class InvalidMarketDataInputError extends Error {}

export class MarketDataService {
  async searchSymbols(query: string): Promise<SymbolSearchResult[]> {
    const q = query.trim();
    if (!q || q.length > 100) {
      throw new InvalidMarketDataInputError('Invalid query');
    }

    const res = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=6&newsCount=0&enableFuzzyQuery=false`,
      { headers: HEADERS },
    );
    if (!res.ok) return [];

    const data = await res.json();
    return (data.quotes ?? [])
      .filter((r: any) => r.quoteType === 'EQUITY' || r.quoteType === 'ETF')
      .map((r: any) => ({
        symbol: r.symbol,
        displaySymbol: r.symbol,
        description: r.shortname ?? r.longname ?? r.symbol,
        type: r.quoteType === 'ETF' ? 'ETP' : 'Common Stock',
      }));
  }

  async getQuotes(rawSymbols: string[]): Promise<QuoteResult[]> {
    const symbols = rawSymbols.map((s) => s.trim().toUpperCase()).filter(Boolean);
    try {
      assertValidSymbols(symbols);
    } catch {
      throw new InvalidMarketDataInputError('Invalid symbols');
    }

    return Promise.all(
      symbols.map(async (symbol) => {
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
            { headers: HEADERS },
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
      }),
    );
  }

  async getCandles(rawSymbol: string, period: CandlePeriod): Promise<Candle[]> {
    const symbol = rawSymbol.trim().toUpperCase();
    if (!symbol || !SYMBOL_PATTERN.test(symbol)) {
      throw new InvalidMarketDataInputError('Invalid symbol');
    }

    const { interval, range } = periodToYahooParams(period);
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
      { headers: HEADERS },
    );
    if (!res.ok) return [];

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp?.length) return [];

    const closes = result.indicators?.quote?.[0]?.close as (number | null)[];
    const timestamps = result.timestamp as number[];

    return timestamps
      .map((t: number, i: number) => ({ t: t * 1000, c: closes[i] }))
      .filter((c): c is Candle => c.c != null);
  }
}
