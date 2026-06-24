# Finance API

Finance endpoints expose the user's stock watchlist through the Control API.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/finance/watchlist` | `finance:read` |
| `POST /api/v1/finance/watchlist` | `finance:write` |
| `DELETE /api/v1/finance/watchlist/:symbol` | `finance:write` |

Browser sessions can call these endpoints without API key scopes.

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
