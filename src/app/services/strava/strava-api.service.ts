const AUTH_URL = 'https://www.strava.com/oauth/authorize';
const TOKEN_URL = 'https://www.strava.com/oauth/token';
const API_URL = 'https://www.strava.com/api/v3';

const SCOPES = 'read,activity:read_all';

export interface StravaAthlete {
  id: number;
  firstname?: string;
  lastname?: string;
  profile?: string;
}

export interface StravaTokenResponse {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: number;
  expires_in: number;
  athlete?: StravaAthlete;
}

export interface StravaActivity {
  id: number;
  external_id?: string | null;
  upload_id?: number | null;
  name: string;
  sport_type?: string;
  type?: string;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  distance?: number;
  moving_time?: number;
  elapsed_time?: number;
  total_elevation_gain?: number;
  elev_high?: number;
  elev_low?: number;
  average_speed?: number;
  max_speed?: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_watts?: number;
  max_watts?: number;
  weighted_average_watts?: number;
  average_cadence?: number;
  calories?: number;
  private?: boolean;
  visibility?: string;
  device_name?: string;
  gear_id?: string | null;
  map?: { id?: string; summary_polyline?: string | null; polyline?: string | null };
  [key: string]: unknown;
}

export interface StravaStream {
  data: unknown[];
  original_size?: number;
  resolution?: string;
  series_type?: string;
}

function config() {
  return {
    clientId: process.env.STRAVA_CLIENT_ID?.trim() ?? '',
    clientSecret: process.env.STRAVA_CLIENT_SECRET?.trim() ?? '',
    redirectUri: process.env.STRAVA_REDIRECT_URI?.trim() ?? '',
  };
}

function requireConfig() {
  const value = config();
  if (!value.clientId || !value.clientSecret || !value.redirectUri) {
    throw new Error('Strava is not configured');
  }
  return value;
}

async function parse<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Strava ${operation} failed (http_${response.status}): ${body.slice(0, 300)}`);
  }
  return response.json() as Promise<T>;
}

export class StravaApiService {
  isConfigured() {
    const value = config();
    return Boolean(value.clientId && value.clientSecret && value.redirectUri);
  }

  buildAuthUrl(state: string) {
    const value = requireConfig();
    const params = new URLSearchParams({
      client_id: value.clientId,
      redirect_uri: value.redirectUri,
      response_type: 'code',
      approval_prompt: 'auto',
      scope: SCOPES,
      state,
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<StravaTokenResponse> {
    const value = requireConfig();
    return parse<StravaTokenResponse>(await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: value.clientId,
        client_secret: value.clientSecret,
        code,
        grant_type: 'authorization_code',
      }),
    }), 'token exchange');
  }

  async refreshToken(refreshToken: string): Promise<StravaTokenResponse> {
    const value = requireConfig();
    return parse<StravaTokenResponse>(await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: value.clientId,
        client_secret: value.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    }), 'token refresh');
  }

  async listActivities(accessToken: string, options: { page?: number; perPage?: number; after?: number } = {}) {
    const params = new URLSearchParams({
      page: String(options.page ?? 1),
      per_page: String(Math.min(100, Math.max(1, options.perPage ?? 30))),
    });
    if (options.after) params.set('after', String(options.after));
    return parse<StravaActivity[]>(await fetch(`${API_URL}/athlete/activities?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }), 'activity list');
  }

  async getActivity(accessToken: string, activityId: string) {
    return parse<StravaActivity>(await fetch(`${API_URL}/activities/${encodeURIComponent(activityId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }), 'activity detail');
  }

  async getActivityStreams(accessToken: string, activityId: string) {
    const keys = 'time,distance,latlng,altitude,velocity_smooth,heartrate,cadence,watts,temp,moving,grade_smooth';
    return parse<Record<string, StravaStream>>(await fetch(
      `${API_URL}/activities/${encodeURIComponent(activityId)}/streams?keys=${keys}&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    ), 'activity streams');
  }

  async getActivityZones(accessToken: string, activityId: string) {
    return parse<any[]>(await fetch(`${API_URL}/activities/${encodeURIComponent(activityId)}/zones`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }), 'activity zones');
  }
}
