# Finance API

Finance endpoints expose the user's stock watchlist and read-only market data
through the Control API.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/finance/quote` | `finance:read` |
| `GET /api/v1/finance/candles` | `finance:read` |
| `GET /api/v1/finance/watchlist` | `finance:read` |
| `POST /api/v1/finance/watchlist` | `finance:write` |
| `DELETE /api/v1/finance/watchlist/:symbol` | `finance:write` |

Browser sessions can call these endpoints without API key scopes.

## `GET /api/v1/finance/quote`

Returns quotes for comma-separated symbols, or symbol search results when `q` is
provided.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `symbols` | string | No | Comma-separated tickers, required unless `q` is set |
| `q` | string | No | Symbol search query, required unless `symbols` is set |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/finance/quote?symbols=AAPL,NVDA"
```

Response:

```json
{
  "data": {
    "quotes": [
      {
        "symbol": "AAPL",
        "name": "Apple Inc.",
        "c": 210,
        "d": 10,
        "dp": 5
      }
    ]
  }
}
```

Search example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/finance/quote?q=voo"
```

Response:

```json
{
  "data": {
    "result": [
      {
        "symbol": "VOO",
        "displaySymbol": "VOO",
        "description": "Vanguard S&P 500 ETF",
        "type": "ETP"
      }
    ]
  }
}
```

## `GET /api/v1/finance/candles`

Returns close-price candles for a symbol.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `symbol` | string | Yes | Ticker symbol |
| `period` | `1W`, `1M`, `6M` | No | Defaults to `1M` |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/finance/candles?symbol=MSFT&period=1W"
```

Response:

```json
{
  "data": {
    "candles": [
      { "t": 1717200000000, "c": 100 }
    ]
  }
}
```

## `GET /api/v1/finance/watchlist`

Returns the authenticated user's watchlist.

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/finance/watchlist
```

Response:

```json
{
  "data": {
    "symbols": ["AAPL", "NVDA", "MSFT"]
  }
}
```

## `POST /api/v1/finance/watchlist`

Adds a symbol to the watchlist. No-ops if the symbol is already present.

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `symbol` | string | Yes | Ticker symbol, uppercased automatically |

Example:

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/finance/watchlist \
  -d '{"symbol": "TSLA"}'
```

Response status:

```text
201 Created
```

Response:

```json
{
  "data": {
    "added": true,
    "symbol": "TSLA"
  }
}
```

## `DELETE /api/v1/finance/watchlist/:symbol`

Removes a symbol from the watchlist.

Example:

```bash
curl -s \
  -X DELETE \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/finance/watchlist/TSLA
```

Response:

```json
{
  "data": {
    "deleted": true,
    "symbol": "TSLA"
  }
}
```
