# Music API

Music endpoints expose Spotify-derived recommendations and listening history
(read from PostgreSQL after a sync) plus live playlist read/write access
(via the Spotify Web API) through the Control API.

## Scopes

| Endpoint | Scope |
|---|---|
| `GET /api/v1/music/status` | `music:read` |
| `GET /api/v1/music/recommendations` | `music:read` |
| `GET /api/v1/music/top-tracks` | `music:read` |
| `GET /api/v1/music/recently-played` | `music:read` |
| `GET /api/v1/music/playlists` | `music:read` |
| `POST /api/v1/music/playlists` | `music:write` |
| `GET /api/v1/music/playlists/:id/tracks` | `music:read` |
| `POST /api/v1/music/playlists/:id/tracks` | `music:write` |
| `POST /api/v1/music/sync` | `music:write` |

Browser sessions can call these endpoints without API key scopes.

All endpoints other than `status` return `422 spotify_not_connected` if the user
hasn't connected Spotify.

## `GET /api/v1/music/status`

Returns whether the user has Spotify connected and when it last synced.

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/music/status
```

Response:

```json
{
  "data": {
    "status": {
      "configured": true,
      "is_connected": true,
      "display_name": "Gian",
      "avatar_url": null,
      "scopes": "user-read-email ... playlist-modify-private",
      "access_expires_at": "2026-07-25T12:00:00.000Z",
      "last_sync_at": "2026-07-24T20:36:17.792Z",
      "last_error": null
    }
  }
}
```

## `GET /api/v1/music/recommendations`

Returns the user's precomputed recommendations, most recently synced first.
These come from the local content-based recommender (see
[architecture](../../architecture/architecture.md)), not Spotify's own
recommendation engine.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `limit` | number | No | Default 30, max 100 |

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/music/recommendations?limit=10"
```

Response:

```json
{
  "data": {
    "recommendations": [
      {
        "trackId": "3n3Ppam7vgaVa1iaRUc9Lp",
        "score": 0.87,
        "reason": "Because you listen to Sunflower — Beach Bunny",
        "name": "Track Name",
        "artists": [{ "id": "...", "name": "Artist" }],
        "albumName": "Album",
        "albumImageUrl": "https://...",
        "externalUrl": "https://open.spotify.com/track/...",
        "previewUrl": null
      }
    ]
  }
}
```

## `GET /api/v1/music/top-tracks`

Returns the user's most-played tracks for a listening window.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `period` | `top_short`, `top_medium`, `top_long` | No | Defaults to `top_medium` |
| `limit` | number | No | Default 20, max 100 |

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/music/top-tracks?period=top_short&limit=10"
```

Response:

```json
{
  "data": {
    "period": "top_short",
    "tracks": [
      { "trackId": "...", "name": "Track", "artists": [{ "id": "...", "name": "Artist" }], "albumImageUrl": "https://...", "externalUrl": "https://...", "rank": 1 }
    ]
  }
}
```

## `GET /api/v1/music/recently-played`

Returns the user's most recently played tracks.

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `limit` | number | No | Default 20, max 50 |

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/music/recently-played?limit=10"
```

Response:

```json
{
  "data": {
    "tracks": [
      { "trackId": "...", "name": "Track", "artists": [{ "id": "...", "name": "Artist" }], "albumImageUrl": "https://...", "externalUrl": "https://...", "playedAt": "2026-07-24T20:00:00.000Z" }
    ]
  }
}
```

## `GET /api/v1/music/playlists`

Returns the user's Spotify playlists (live call to the Spotify Web API — not
limited to what a sync captured).

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/music/playlists
```

Response:

```json
{
  "data": {
    "playlists": [
      { "id": "37i9dQZF1...", "name": "Roadtrip", "imageUrl": "https://...", "trackCount": 42, "externalUrl": "https://open.spotify.com/playlist/..." }
    ]
  }
}
```

## `POST /api/v1/music/playlists`

Creates a new Spotify playlist, optionally adding tracks immediately.

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `name` | string | Yes | Playlist name, 1-200 chars |
| `trackIds` | string[] | No | Spotify track ids to add on creation, max 100 |

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/music/playlists \
  -d '{"name": "Roadtrip", "trackIds": ["3n3Ppam7vgaVa1iaRUc9Lp"]}'
```

Response status:

```text
201 Created
```

Response:

```json
{
  "data": {
    "playlist": { "id": "37i9dQZF1...", "name": "Roadtrip", "externalUrl": "https://open.spotify.com/playlist/..." }
  }
}
```

## `GET /api/v1/music/playlists/:id/tracks`

Returns the tracks inside a playlist, identified by its Spotify playlist id
(from `GET /api/v1/music/playlists`).

Query parameters:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `limit` | number | No | Default 100, max 200 |

```bash
curl -s \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  "http://localhost:8080/api/v1/music/playlists/37i9dQZF1.../tracks?limit=50"
```

Response:

```json
{
  "data": {
    "tracks": [
      { "trackId": "...", "name": "Track", "artists": [{ "id": "...", "name": "Artist" }], "albumImageUrl": "https://...", "externalUrl": "https://...", "addedAt": "2026-07-20T10:00:00.000Z" }
    ]
  }
}
```

## `POST /api/v1/music/playlists/:id/tracks`

Adds tracks to an existing playlist.

Request body:

| Field | Type | Required | Notes |
|---|---|---:|---|
| `trackIds` | string[] | Yes | Spotify track ids, 1-100 entries |

```bash
curl -s \
  -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/music/playlists/37i9dQZF1.../tracks \
  -d '{"trackIds": ["3n3Ppam7vgaVa1iaRUc9Lp"]}'
```

Response status:

```text
201 Created
```

Response:

```json
{
  "data": {
    "added": 1
  }
}
```

## `POST /api/v1/music/sync`

Triggers a full Spotify sync (recently played, top tracks, saved tracks,
playlists, candidate discovery, embeddings, recommendations) for the
authenticated user. This is a synchronous, potentially slow call — it runs
inline and returns once the sync completes.

```bash
curl -s \
  -X POST \
  -H "Authorization: Bearer $ALLERAC_API_KEY" \
  http://localhost:8080/api/v1/music/sync
```

Response:

```json
{
  "data": {
    "result": {
      "tracksUpserted": 812,
      "historyInserted": 340,
      "candidatesDiscovered": 96,
      "recommendationsGenerated": 30
    }
  }
}
```
