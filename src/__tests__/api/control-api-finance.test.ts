/** @jest-environment node */

import { requireCurrentUser, UnauthorizedError } from '@/app/lib/auth-session';
import pool from '@/app/clients/db';
import { GET as getWatchlist, POST as addToWatchlist } from '@/app/api/v1/finance/watchlist/route';
import { DELETE as removeFromWatchlist } from '@/app/api/v1/finance/watchlist/[symbol]/route';
import { GET as getQuote } from '@/app/api/v1/finance/quote/route';
import { GET as getCandles } from '@/app/api/v1/finance/candles/route';

jest.mock('@/app/lib/auth-session', () => {
  class MockUnauthorizedError extends Error {}
  class MockForbiddenError extends Error {}
  return {
    UnauthorizedError: MockUnauthorizedError,
    ForbiddenError: MockForbiddenError,
    requireCurrentUser: jest.fn(),
    assertDomainAccess: jest.fn(),
  };
});

jest.mock('@/app/clients/db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

const mockRequireCurrentUser = jest.mocked(requireCurrentUser);
const mockPool = pool as jest.Mocked<typeof pool>;

const user = {
  id: 'user-id',
  email: 'user@example.com',
  name: 'User',
  is_admin: false,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
};

function jsonRequest(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function routeParams(symbol = 'AAPL') {
  return { params: Promise.resolve({ symbol }) };
}

describe('Control API v1 finance', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue(user);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns 401 when unauthenticated', async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new UnauthorizedError());

    const response = await getWatchlist(new Request('http://localhost/api/v1/finance/watchlist'));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: { code: 'unauthorized', message: 'Unauthorized' } });
  });

  it('returns watchlist symbols for current user', async () => {
    mockPool.query.mockResolvedValueOnce({
      rows: [{ symbol: 'AAPL' }, { symbol: 'TSLA' }],
    } as any);

    const response = await getWatchlist(new Request('http://localhost/api/v1/finance/watchlist'));

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('user_watchlist'),
      [user.id],
    );
    const body = await response.json();
    expect(body.data.symbols).toEqual(['AAPL', 'TSLA']);
  });

  it('returns empty array when no symbols found', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await getWatchlist(new Request('http://localhost/api/v1/finance/watchlist'));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.symbols).toEqual([]);
  });

  it('validates missing symbol on add', async () => {
    const response = await addToWatchlist(jsonRequest('http://localhost/api/v1/finance/watchlist', 'POST', {}));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(mockPool.query).not.toHaveBeenCalled();
  });

  it('upcases symbol before inserting', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await addToWatchlist(jsonRequest('http://localhost/api/v1/finance/watchlist', 'POST', { symbol: 'nvda' }));

    expect(response.status).toBe(201);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('user_watchlist'),
      [user.id, 'NVDA'],
    );
    const body = await response.json();
    expect(body.data).toMatchObject({ added: true, symbol: 'NVDA' });
  });

  it('adds symbol to watchlist', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] } as any);

    const response = await addToWatchlist(jsonRequest('http://localhost/api/v1/finance/watchlist', 'POST', { symbol: 'AAPL' }));

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.data).toMatchObject({ added: true, symbol: 'AAPL' });
  });

  it('removes symbol from watchlist', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 1 } as any);

    const response = await removeFromWatchlist(
      new Request('http://localhost/api/v1/finance/watchlist/AAPL', { method: 'DELETE' }),
      routeParams('AAPL'),
    );

    expect(response.status).toBe(200);
    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM user_watchlist'),
      [user.id, 'AAPL'],
    );
    expect(await response.json()).toEqual({ data: { deleted: true, symbol: 'AAPL' } });
  });

  it('returns 404 when symbol not in watchlist on delete', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: 0 } as any);

    const response = await removeFromWatchlist(
      new Request('http://localhost/api/v1/finance/watchlist/MISSING', { method: 'DELETE' }),
      routeParams('MISSING'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('returns 404 when rowCount is null on delete (no affected rows)', async () => {
    mockPool.query.mockResolvedValueOnce({ rowCount: null } as any);

    const response = await removeFromWatchlist(
      new Request('http://localhost/api/v1/finance/watchlist/MISSING', { method: 'DELETE' }),
      routeParams('MISSING'),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found' } });
  });

  it('returns quotes for symbols', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            meta: {
              shortName: 'Apple Inc.',
              regularMarketPrice: 210,
              chartPreviousClose: 200,
            },
          }],
        },
      }),
    } as Response);

    const response = await getQuote(new Request('http://localhost/api/v1/finance/quote?symbols=aapl'));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/v8/finance/chart/AAPL'),
      expect.objectContaining({ headers: { 'User-Agent': 'Mozilla/5.0' } }),
    );
    expect(await response.json()).toEqual({
      data: {
        quotes: [{
          symbol: 'AAPL',
          name: 'Apple Inc.',
          c: 210,
          d: 10,
          dp: 5,
        }],
      },
    });
  });

  it('searches finance symbols', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        quotes: [
          { symbol: 'VOO', quoteType: 'ETF', shortname: 'Vanguard S&P 500 ETF' },
          { symbol: 'NEWS', quoteType: 'NEWS', shortname: 'Ignored' },
        ],
      }),
    } as Response);

    const response = await getQuote(new Request('http://localhost/api/v1/finance/quote?q=voo'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        result: [{
          symbol: 'VOO',
          displaySymbol: 'VOO',
          description: 'Vanguard S&P 500 ETF',
          type: 'ETP',
        }],
      },
    });
  });

  it('validates quote query', async () => {
    const response = await getQuote(new Request('http://localhost/api/v1/finance/quote'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns candles for a symbol', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        chart: {
          result: [{
            timestamp: [1717200000, 1717286400],
            indicators: { quote: [{ close: [100, null] }] },
          }],
        },
      }),
    } as Response);

    const response = await getCandles(new Request('http://localhost/api/v1/finance/candles?symbol=msft&period=1W'));

    expect(response.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('interval=1h&range=5d'),
      expect.objectContaining({ headers: { 'User-Agent': 'Mozilla/5.0' } }),
    );
    expect(await response.json()).toEqual({
      data: { candles: [{ t: 1717200000000, c: 100 }] },
    });
  });

  it('validates candle period', async () => {
    const response = await getCandles(new Request('http://localhost/api/v1/finance/candles?symbol=MSFT&period=1Y'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'validation_error' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
