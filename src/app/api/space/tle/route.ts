import { NextRequest, NextResponse } from 'next/server';

const GM        = 3.986004418e14;
const R_EARTH_M = 6.371e6;

// Celestrak GP catalog — TLE format by group name
function celestrakUrl(group: string) {
  return `https://celestrak.org/SOCRATES/query.php?GROUP=${encodeURIComponent(group)}&FORMAT=TLE`;
}

function parseTLE(header: string, line1: string, line2: string): {
  name: string; altitude: number; inclination: number;
  raan: number; initialTheta: number;
} | null {
  try {
    if (!line2 || line2[0] !== '2') return null;
    const inclination  = parseFloat(line2.substring(8, 16));
    const raan         = parseFloat(line2.substring(17, 25));
    const meanAnomaly  = parseFloat(line2.substring(43, 51));
    const meanMotion   = parseFloat(line2.substring(52, 63)); // rev/day
    const n            = meanMotion * (2 * Math.PI) / 86400;  // rad/s
    const a            = Math.cbrt(GM / (n * n));              // meters
    const altitude     = Math.max(0, (a - R_EARTH_M) / 1000); // km
    const initialTheta = (meanAnomaly * Math.PI) / 180;
    if (!isFinite(altitude) || !isFinite(inclination)) return null;
    return { name: header.trim(), altitude, inclination, raan, initialTheta };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const group = req.nextUrl.searchParams.get('group') ?? 'visual';
  try {
    const res = await fetch(celestrakUrl(group), {
      headers: { 'User-Agent': 'allerac-one/1.0 (educational)' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) throw new Error(`Celestrak HTTP ${res.status}`);
    const lines = (await res.text()).split('\n').map(l => l.trimEnd()).filter(Boolean);
    const results = [];
    for (let k = 0; k + 2 < lines.length; k += 3) {
      const parsed = parseTLE(lines[k], lines[k + 1], lines[k + 2]);
      if (parsed) results.push(parsed);
    }
    return NextResponse.json(results, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 502 },
    );
  }
}
