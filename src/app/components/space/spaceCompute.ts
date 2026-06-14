import * as satellite from 'satellite.js';

export interface PassEvent {
  satId: string;
  satName: string;
  aos: Date;
  los: Date;
  tca: Date;
  maxElev: number; // degrees
}

export interface ConjunctionEvent {
  satIdA: string;
  satNameA: string;
  satIdB: string;
  satNameB: string;
  minDist: number; // km
  time: Date;
}

export interface SatrecEntry {
  id: string;
  name: string;
  satrec: ReturnType<typeof satellite.twoline2satrec>;
}

export interface ObserverGd {
  longitude: number; // radians
  latitude: number;  // radians
  height: number;    // km
}

function propagateEci(
  satrec: ReturnType<typeof satellite.twoline2satrec>,
  date: Date,
): { x: number; y: number; z: number } | null {
  const pv = satellite.propagate(satrec, date) ?? {};
  const pos = (pv as { position?: unknown }).position;
  if (!pos || typeof pos === 'boolean') return null;
  return pos as { x: number; y: number; z: number };
}

export function computePasses(
  entries: SatrecEntry[],
  observerGd: ObserverGd,
  fromMs: number,
  durationH = 24,
  stepSec = 30,
): PassEvent[] {
  const passes: PassEvent[] = [];
  const totalSteps = Math.floor((durationH * 3600) / stepSec);

  for (const entry of entries) {
    let inPass = false;
    let aos: Date | null = null;
    let maxElev = 0;
    let tcaDate: Date | null = null;

    for (let k = 0; k <= totalSteps; k++) {
      const date = new Date(fromMs + k * stepSec * 1000);
      const posEci = propagateEci(entry.satrec, date);
      if (!posEci) continue;

      const gmst = satellite.gstime(date);
      const posEcf = satellite.eciToEcf(posEci, gmst);
      const la = satellite.ecfToLookAngles(observerGd, posEcf);
      const elevDeg = (la.elevation as number) * (180 / Math.PI);

      if (elevDeg > 0) {
        if (!inPass) {
          inPass = true;
          aos = date;
          maxElev = elevDeg;
          tcaDate = date;
        } else if (elevDeg > maxElev) {
          maxElev = elevDeg;
          tcaDate = date;
        }
      } else if (inPass) {
        inPass = false;
        if (aos && tcaDate) {
          passes.push({ satId: entry.id, satName: entry.name, aos, los: date, tca: tcaDate, maxElev });
        }
        aos = null; maxElev = 0; tcaDate = null;
      }
    }

    if (inPass && aos && tcaDate) {
      passes.push({
        satId: entry.id, satName: entry.name, aos,
        los: new Date(fromMs + durationH * 3600 * 1000),
        tca: tcaDate, maxElev,
      });
    }
  }

  return passes.sort((a, b) => a.aos.getTime() - b.aos.getTime());
}

export function computeConjunctions(
  entries: SatrecEntry[],
  fromMs: number,
  durationH = 24,
  stepSec = 60,
  thresholdKm = 10,
): ConjunctionEvent[] {
  if (entries.length < 2) return [];

  const totalSteps = Math.floor((durationH * 3600) / stepSec);
  const pairMin = new Map<string, { minDist: number; time: Date }>();

  for (let k = 0; k <= totalSteps; k++) {
    const date = new Date(fromMs + k * stepSec * 1000);
    const positions = entries.map(e => propagateEci(e.satrec, date));

    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        const pA = positions[a]; const pB = positions[b];
        if (!pA || !pB) continue;
        const dx = pA.x - pB.x, dy = pA.y - pB.y, dz = pA.z - pB.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < thresholdKm) {
          const key = `${entries[a].id}::${entries[b].id}`;
          const cur = pairMin.get(key);
          if (!cur || dist < cur.minDist) pairMin.set(key, { minDist: dist, time: date });
        }
      }
    }
  }

  const result: ConjunctionEvent[] = [];
  for (const [key, { minDist, time }] of pairMin.entries()) {
    const [idA, idB] = key.split('::');
    const eA = entries.find(e => e.id === idA)!;
    const eB = entries.find(e => e.id === idB)!;
    result.push({ satIdA: idA, satNameA: eA.name, satIdB: idB, satNameB: eB.name, minDist, time });
  }

  return result.sort((a, b) => a.minDist - b.minDist);
}
