# Search API

Search endpoints expose configured web search through the Control API.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/search` | `search:read` |

Browser sessions can call this endpoint without API key scopes.

## `GET /api/v1/search`

Runs a Tavily-backed web search. The Tavily key can come from user settings,
system/admin settings, or `TAVILY_API_KEY`.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `q` | string | Yes | Search query, max 500 characters |

Example:

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/search?q=allerac+one"
```

Response:

```json
{
  "data": {
    "search": {
      "answer": "Short synthesized answer.",
      "results": [
        {
          "title": "Result title",
          "url": "https://example.com",
          "content": "Result snippet",
          "score": 0.9
        }
      ],
      "query": "allerac one"
    }
  }
}
```

If Tavily is not configured, the endpoint returns `422 provider_not_configured`.
