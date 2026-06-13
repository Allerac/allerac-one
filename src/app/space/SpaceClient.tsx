'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import AlleracTaskbar from '@/app/components/layout/AlleracTaskbar';
import type { SatelliteData, PreviewOrbit, GroundStationData } from '@/app/components/space/SatelliteSimulator';

const SatelliteSimulator = dynamic(
  () => import('@/app/components/space/SatelliteSimulator'),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100%', background: '#000510' }} /> },
);

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  allowedDomains: string[];
}

const GM        = 3.986004418e14;
const R_EARTH_M = 6.371e6;

function orbitalPeriodLabel(altKm: number): string {
  const a   = R_EARTH_M + altKm * 1000;
  const sec = 2 * Math.PI * Math.sqrt(a ** 3 / GM);
  const m   = Math.round(sec / 60);
  if (m < 120) return `${m}min`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}

function satType(altKm: number): string {
  if (altKm < 2000) return 'LEO';
  if (altKm < 35000) return 'MEO';
  return 'GEO';
}

// Walker constellation generator: T/P/F pattern
function generateWalkerConstellation(
  name: string, color: string,
  altitude: number, inclination: number,
  totalSats: number, planes: number, phaseF: number,
): SatelliteData[] {
  const perPlane     = Math.round(totalSats / planes);
  const raanStep     = 360 / planes;
  const inplaneStep  = 360 / perPlane;
  const phaseShift   = (phaseF * 360) / totalSats;
  const slug         = name.toLowerCase().replace(/[\s/()]+/g, '-');
  return Array.from({ length: planes }, (_, p) =>
    Array.from({ length: perPlane }, (_, s) => ({
      id:            `${slug}-${p}-${s}`,
      name:          `${name} ${String.fromCharCode(65 + p)}${s + 1}`,
      altitude, inclination,
      raan:          p * raanStep,
      color, showCoverage: false,
      initialTheta:  ((s * inplaneStep + p * phaseShift) % 360) * (Math.PI / 180),
      constellation: name,
    }))
  ).flat();
}

const DEFAULT_SATELLITES: SatelliteData[] = [
  { id: 'iss',      name: 'ISS',          altitude: 408,   inclination: 51.6, raan: 0,   color: '#e8f4ff', showCoverage: false },
  { id: 'hubble',   name: 'Hubble',       altitude: 547,   inclination: 28.5, raan: 60,  color: '#ffd966', showCoverage: false },
  { id: 'starlink', name: 'Starlink-L1',  altitude: 550,   inclination: 53.0, raan: 120, color: '#66b2ff', showCoverage: false },
  { id: 'gps-s',   name: 'GPS (single)', altitude: 20200, inclination: 55.0, raan: 200, color: '#66ffaa', showCoverage: true  },
  { id: 'meteosat', name: 'Meteosat-12', altitude: 35786, inclination: 0.1,  raan: 0,   color: '#ff8844', showCoverage: false },
];

const PRESETS = [
  {
    label: 'GPS WALKER 24/6/2',
    color: '#44ffaa',
    generate: () => generateWalkerConstellation('GPS Walker 24/6/2', '#44ffaa', 20200, 55, 24, 6, 2),
    idPrefix: 'gps-walker',
  },
  {
    label: 'IRIDIUM NEXT 66/6/2',
    color: '#ffaa44',
    generate: () => generateWalkerConstellation('Iridium NEXT 66/6/2', '#ffaa44', 780, 86.4, 66, 6, 2),
    idPrefix: 'iridium-next',
  },
  {
    label: 'STARLINK SHELL 1 (66)',
    color: '#88bbff',
    generate: () => generateWalkerConstellation('Starlink Shell 1', '#88bbff', 550, 53, 66, 6, 1),
    idPrefix: 'starlink-shell',
  },
  {
    label: 'ONEWEB (54)',
    color: '#ff88cc',
    generate: () => generateWalkerConstellation('OneWeb', '#ff88cc', 1200, 87.9, 54, 6, 1),
    idPrefix: 'oneweb',
  },
];

const PRESET_COLORS = [
  '#e8f4ff', '#ffd966', '#66b2ff', '#66ffaa', '#ff8844',
  '#ff66aa', '#cc88ff', '#44ffee', '#ff4444', '#ffffff',
];

const SPEED_PRESETS = [
  { label: 'Real time', sub: '1×',       value: 1      },
  { label: '1 min/s',   sub: '60×',      value: 60     },
  { label: '1 hr/s',    sub: '3,600×',   value: 3600   },
  { label: '1 day/s',   sub: '86,400×',  value: 86400  },
];

let idCounter = 100;

type TLEStatus = 'idle' | 'loading' | 'ok' | 'error';

export default function SpaceClient({ userId, userName, userEmail, isAdmin, allowedDomains }: Props) {
  const router  = useRouter();
  const [satellites, setSatellites]     = useState<SatelliteData[]>(DEFAULT_SATELLITES);
  const [timeSpeed, setTimeSpeed]       = useState(3600);
  const [showPaths, setShowPaths]       = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [showDayNight, setShowDayNight] = useState(false);
  const [panelOpen, setPanelOpen]       = useState(false);

  // Ground stations (multiple)
  const [groundStationMode, setGroundStationMode] = useState(false);
  type GS = { id: string; pos: { x: number; y: number; z: number }; coords: string; locationName: string | null; loading: boolean };
  const [groundStations, setGroundStations] = useState<GS[]>([]);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds]          = useState<string[]>([]);
  let gsIdCounter = useRef(0);

  // Add-satellite form
  const [addName,     setAddName]     = useState('');
  const [addAlt,      setAddAlt]      = useState(408);
  const [addIncl,     setAddIncl]     = useState(51.6);
  const [addRaan,     setAddRaan]     = useState(0);
  const [addColor,    setAddColor]    = useState(PRESET_COLORS[0]);
  const [addCoverage, setAddCoverage] = useState(false);
  const [showForm,    setShowForm]    = useState(false);

  const [selectedIds,            setSelectedIds]            = useState<string[]>([]);
  const [expandedConstellations, setExpandedConstellations] = useState<Set<string>>(new Set());

  // TLE real data
  const [tleStatus, setTleStatus] = useState<TLEStatus>('idle');

  // Reverse geocoding — queued at 1 req/s to respect Nominatim rate limit
  const geoQueue  = useRef<Array<{ id: string; pos: { x: number; y: number; z: number } }>>([]);
  const geoActive = useRef(false);

  const runGeoQueue = useCallback(async () => {
    if (geoActive.current) return;
    geoActive.current = true;
    while (geoQueue.current.length > 0) {
      const item = geoQueue.current.shift()!;
      const { id, pos } = item;
      const lat = Math.asin(pos.y) * 180 / Math.PI;
      const lon = Math.atan2(pos.x, pos.z) * 180 / Math.PI;
      try {
        const data = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&format=json&zoom=10`,
          { headers: { 'Accept-Language': 'en' } },
        ).then(r => r.json());
        const a = data.address ?? {};
        const city    = a.city || a.town || a.village || a.municipality || a.county || a.state_district || '';
        const country = a.country || '';
        const sea     = a.sea || a.body_of_water || '';
        const name    = sea ? sea : city && country ? `${city}, ${country}` : country || data.display_name?.split(',')[0] || null;
        setGroundStations(prev => prev.map(gs => gs.id === id ? { ...gs, locationName: name, loading: false } : gs));
      } catch {
        setGroundStations(prev => prev.map(gs => gs.id === id ? { ...gs, loading: false } : gs));
      }
      // Nominatim policy: max 1 request/second
      if (geoQueue.current.length > 0) await new Promise(r => setTimeout(r, 1100));
    }
    geoActive.current = false;
  }, []);

  const geocodeStation = useCallback((id: string, pos: { x: number; y: number; z: number }) => {
    geoQueue.current.push({ id, pos });
    runGeoQueue();
  }, [runGeoQueue]);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ESC cancels ground station placement mode
  useEffect(() => {
    if (!groundStationMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setGroundStationMode(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groundStationMode]);

  // ── Callbacks to/from SatelliteSimulator ──────────────────────────────────────
  const handleSatelliteClick = useCallback((id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
    setPanelOpen(true); // open panel to show selection
  }, []);

  const handleEarthClick = useCallback((pos: { x: number; y: number; z: number }) => {
    if (!groundStationMode) return;
    const id  = `gs-${++gsIdCounter.current}`;
    const lat = Math.asin(pos.y) * 180 / Math.PI;
    const lon = Math.atan2(pos.x, pos.z) * 180 / Math.PI;
    const coords = `${lat >= 0 ? Math.round(lat) + '°N' : Math.abs(Math.round(lat)) + '°S'} ${lon >= 0 ? Math.round(lon) + '°E' : Math.abs(Math.round(lon)) + '°W'}`;
    const newStation: GS = { id, pos, coords, locationName: null, loading: true };
    setGroundStations(prev => [...prev, newStation]);
    setActiveStationId(id);
    geocodeStation(id, pos);
  }, [groundStationMode, geocodeStation]);

  const handleVisibilityUpdate = useCallback((ids: string[]) => {
    setVisibleIds(ids);
  }, []);

  // ── Selection helpers ─────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const toggleGroupSelect = (ids: string[]) => {
    const allSel = ids.every(id => selectedIds.includes(id));
    setSelectedIds(prev => allSel ? prev.filter(id => !ids.includes(id)) : [...new Set([...prev, ...ids])]);
  };

  const toggleExpandConstellation = (name: string) =>
    setExpandedConstellations(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });

  const toggleGroupCoverage = (ids: string[]) => {
    const allOn = ids.every(id => satellites.find(s => s.id === id)?.showCoverage);
    setSatellites(prev => prev.map(s => ids.includes(s.id) ? { ...s, showCoverage: !allOn } : s));
  };

  const removeGroup = (ids: string[]) => {
    setSatellites(prev => prev.filter(s => !ids.includes(s.id)));
    setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
  };

  const previewOrbit: PreviewOrbit | null = showForm
    ? { altitude: addAlt, inclination: addIncl, raan: addRaan }
    : null;

  const handleLogout = useCallback(async () => {
    const { logout } = await import('@/app/actions/auth');
    await logout();
    router.push('/login');
  }, [router]);

  const handleLoadPreset = (preset: typeof PRESETS[0]) => {
    const newSats = preset.generate();
    setSatellites(prev => {
      const idSet = new Set(newSats.map(s => s.id));
      return [...prev.filter(s => !s.constellation || !newSats.some(ns => ns.constellation === s.constellation)), ...newSats];
    });
  };

  const handleAdd = () => {
    if (!addName.trim()) return;
    setSatellites(prev => [...prev, {
      id:           `sat-${++idCounter}`,
      name:         addName.trim(),
      altitude:     addAlt,
      inclination:  addIncl,
      raan:         addRaan,
      color:        addColor,
      showCoverage: addCoverage,
    }]);
    setAddName(''); setShowForm(false);
  };

  const handleRemove = (id: string) => {
    setSatellites(prev => prev.filter(s => s.id !== id));
    setSelectedIds(prev => prev.filter(x => x !== id));
  };

  const toggleSatCoverage = (id: string) =>
    setSatellites(prev => prev.map(s => s.id === id ? { ...s, showCoverage: !s.showCoverage } : s));

  const handleFetchTLE = async () => {
    setTleStatus('loading');
    try {
      const res = await fetch('/api/space/tle?group=visual');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Array<{ name: string; altitude: number; inclination: number; raan: number; initialTheta: number }> = await res.json();
      const tleSats: SatelliteData[] = data.slice(0, 20).map((d, i) => ({
        id:            `tle-${i}`,
        name:          d.name,
        altitude:      d.altitude,
        inclination:   d.inclination,
        raan:          d.raan,
        color:         '#ff6644',
        showCoverage:  false,
        initialTheta:  d.initialTheta,
        constellation: 'Real TLE',
      }));
      setSatellites(prev => [...prev.filter(s => s.constellation !== 'Real TLE'), ...tleSats]);
      setTleStatus('ok');
    } catch {
      setTleStatus('error');
      setTimeout(() => setTleStatus('idle'), 3000);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────────
  const panelBg     = '#060c1a';
  const panelBdr    = '#1a3060';
  const textPrimary = '#c8d8f0';
  const textMuted   = '#506090';
  const fontMono    = '"Courier New", "Lucida Console", monospace';
  const taskbarH    = 52;
  const PANEL_W     = 290;

  const canvasRight  = isMobile ? 0 : (panelOpen ? PANEL_W : 0);
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute', left: 0, right: 0, bottom: taskbarH,
        height: '62dvh', background: panelBg, borderTop: `1px solid ${panelBdr}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 20,
        transform: panelOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.25s ease',
      }
    : {
        position: 'absolute', right: 0, top: 0, bottom: taskbarH,
        width: PANEL_W, background: panelBg, borderLeft: `1px solid ${panelBdr}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 20,
        transform: panelOpen ? 'translateX(0)' : `translateX(${PANEL_W}px)`,
        transition: 'transform 0.2s ease',
      };

  const activeStation = groundStations.find(gs => gs.id === activeStationId) ?? null;
  const simulatorStations: GroundStationData[] = groundStations.map(gs => ({
    id: gs.id, x: gs.pos.x, y: gs.pos.y, z: gs.pos.z, active: gs.id === activeStationId,
  }));

  return (
    <div style={{ position: 'relative', height: '100dvh', background: '#000510', overflow: 'hidden', fontFamily: fontMono }}>

      {/* 3D canvas */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: taskbarH, right: canvasRight,
        transition: 'right 0.2s ease',
        cursor: groundStationMode ? 'crosshair' : 'default',
      }}>
        <SatelliteSimulator
          satellites={satellites}
          timeSpeed={timeSpeed}
          showPaths={showPaths}
          showCoverage={showCoverage}
          showDayNight={showDayNight}
          previewOrbit={previewOrbit}
          selectedIds={selectedIds}
          groundStations={simulatorStations}
          onSatelliteClick={handleSatelliteClick}
          onEarthClick={handleEarthClick}
          onVisibilityUpdate={handleVisibilityUpdate}
        />
      </div>

      {/* Ground station mode indicator */}
      {groundStationMode && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(255,200,0,0.15)', border: '1px solid #ffcc00',
          color: '#ffcc00', padding: '5px 14px', fontSize: 10, letterSpacing: 1.5, zIndex: 25,
          pointerEvents: 'none',
        }}>
          ◉ CLICK GLOBE TO PLACE GROUND STATION — ESC to cancel
        </div>
      )}

      {/* Active station mini overlay (bottom-left, only when panel closed) */}
      {activeStation && !panelOpen && (
        <div style={{
          position: 'absolute', bottom: taskbarH + 8, left: 8, zIndex: 20,
          background: 'rgba(6,12,26,0.85)', border: '1px solid #2a5a30',
          padding: '7px 12px', fontSize: 10, fontFamily: fontMono,
        }}>
          <div style={{ color: '#ffdd00', letterSpacing: 1, marginBottom: 3 }}>
            ◈ {activeStation.loading ? 'locating...' : (activeStation.locationName ?? activeStation.coords)}
          </div>
          {activeStation.locationName && <div style={{ color: textMuted, marginBottom: 3 }}>{activeStation.coords}</div>}
          {groundStations.length > 1 && <div style={{ color: textMuted, marginBottom: 3 }}>{groundStations.length} stations total</div>}
          <div style={{ color: visibleIds.length >= 3 ? '#44ffcc' : visibleIds.length > 0 ? '#ffaa44' : '#ff4444' }}>
            {visibleIds.length} visible{visibleIds.length >= 3 && ' — TRIANGULATED ✓'}
          </div>
        </div>
      )}

      {/* Panel toggle */}
      {!panelOpen && !isMobile && (
        <button
          onClick={() => setPanelOpen(true)}
          title="Open control panel"
          style={{
            position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
            background: panelBg, border: `1px solid ${panelBdr}`, color: textPrimary,
            padding: '8px 4px', cursor: 'pointer', fontSize: 12, letterSpacing: 1,
            writingMode: 'vertical-rl', zIndex: 20,
          }}
        >
          CTRL ▶
        </button>
      )}
      {isMobile && (
        <button
          onClick={() => setPanelOpen(v => !v)}
          style={{
            position: 'absolute', top: 10, right: 12, zIndex: 25,
            background: panelOpen ? '#1a3e7a' : 'rgba(6,12,26,0.85)',
            border: `1px solid ${panelOpen ? '#4af' : panelBdr}`,
            color: panelOpen ? '#4af' : textPrimary,
            padding: '6px 10px', fontSize: 11, fontFamily: fontMono, letterSpacing: 1, cursor: 'pointer',
          }}
        >
          {panelOpen ? '▼ CTRL' : '▲ CTRL'}
        </button>
      )}

      {/* Control panel */}
      <div style={panelStyle}>

        {/* Header */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ color: '#4af', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>◈ SPACE CONTROL</span>
          <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 14 }}>◀</button>
        </div>

        {/* Time warp */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>TIME WARP</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {SPEED_PRESETS.map(p => {
              const active = timeSpeed === p.value;
              return (
                <button key={p.value} onClick={() => setTimeSpeed(p.value)} style={{
                  flex: 1, padding: '6px 2px', fontFamily: fontMono, cursor: 'pointer',
                  background: active ? '#1a3e7a' : '#0a1630',
                  border: `1px solid ${active ? '#4af' : panelBdr}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: active ? '#4af' : textPrimary, whiteSpace: 'nowrap' }}>{p.label}</span>
                  <span style={{ fontSize: 8, color: active ? '#2a7acc' : textMuted }}>{p.sub}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Toggles: paths / coverage / day-night / ground station */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {[
              { label: 'PATHS',    value: showPaths,    toggle: () => setShowPaths(v => !v) },
              { label: 'COVERAGE', value: showCoverage, toggle: () => setShowCoverage(v => !v) },
              { label: 'DAY/NIGHT', value: showDayNight, toggle: () => setShowDayNight(v => !v) },
            ].map(({ label, value, toggle }) => (
              <button key={label} onClick={toggle} style={{
                flex: '1 1 auto', padding: '5px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 0.8,
                background: value ? '#0d2a4a' : '#080e1c',
                border: `1px solid ${value ? '#2a7acc' : panelBdr}`,
                color: value ? '#6ac' : textMuted, cursor: 'pointer',
              }}>
                {value ? '◉' : '○'} {label}
              </button>
            ))}
          </div>
        </div>

        {/* Ground stations */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
            GROUND STATIONS ({groundStations.length})
          </div>
          <button
            onClick={() => setGroundStationMode(v => !v)}
            style={{
              width: '100%', padding: '6px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 0.8,
              background: groundStationMode ? 'rgba(255,200,0,0.12)' : '#080e1c',
              border: `1px solid ${groundStationMode ? '#ffcc00' : panelBdr}`,
              color: groundStationMode ? '#ffcc00' : textMuted, cursor: 'pointer', marginBottom: 6,
            }}
          >
            {groundStationMode ? '◉ CLICK GLOBE TO PLACE — ESC cancels' : '◎ + ADD STATION ON GLOBE'}
          </button>

          {/* Station list */}
          {groundStations.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {groundStations.map(gs => {
                const isActive = gs.id === activeStationId;
                return (
                  <div
                    key={gs.id}
                    onClick={() => setActiveStationId(gs.id)}
                    style={{
                      padding: '6px 8px', cursor: 'pointer', fontSize: 9,
                      background: isActive ? '#0d1e10' : '#060c0a',
                      border: `1px solid ${isActive ? '#2a6a30' : '#1a3020'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: isActive ? '#ffdd00' : '#666', fontSize: 10 }}>◈</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: isActive ? '#fff' : textMuted, fontWeight: isActive ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {gs.loading ? 'locating...' : (gs.locationName ?? gs.coords)}
                        </div>
                        {gs.locationName && <div style={{ color: '#2a5040' }}>{gs.coords}</div>}
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          setGroundStations(prev => prev.filter(s => s.id !== gs.id));
                          if (activeStationId === gs.id) {
                            setActiveStationId(groundStations.find(s => s.id !== gs.id)?.id ?? null);
                            setVisibleIds([]);
                          }
                        }}
                        style={{ background: 'none', border: 'none', color: '#604060', cursor: 'pointer', fontSize: 10, padding: 0, flexShrink: 0 }}
                      >✕</button>
                    </div>
                    {isActive && (
                      <div style={{ marginTop: 4, color: visibleIds.length >= 3 ? '#44ffcc' : visibleIds.length > 0 ? '#ffaa44' : '#ff4444' }}>
                        {visibleIds.length} visible{visibleIds.length >= 3 && ' — TRIANGULATED ✓'}
                        {visibleIds.length > 0 && (
                          <div style={{ marginTop: 3, color: textMuted, lineHeight: 1.6 }}>
                            {visibleIds.slice(0, 4).map(id => {
                              const sat = satellites.find(s => s.id === id);
                              return sat ? (
                                <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: sat.color, display: 'inline-block', flexShrink: 0 }} />
                                  {sat.name}
                                </span>
                              ) : null;
                            })}
                            {visibleIds.length > 4 && <span style={{ color: '#2a4060' }}>+{visibleIds.length - 4} more</span>}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {groundStations.length > 1 && (
                <button
                  onClick={() => { setGroundStations([]); setActiveStationId(null); setVisibleIds([]); }}
                  style={{ padding: '4px 0', fontSize: 8, fontFamily: fontMono, background: 'none', border: `1px solid #2a1a1a`, color: '#604060', cursor: 'pointer', marginTop: 2 }}
                >
                  ✕ REMOVE ALL
                </button>
              )}
            </div>
          )}
        </div>

        {/* Satellite list */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>
            SATELLITES ({satellites.length})
            {selectedIds.length > 0 && <span style={{ color: '#4af', marginLeft: 6 }}>· {selectedIds.length} selected</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {(() => {
              const groups = new Map<string, typeof satellites>();
              const standalones: typeof satellites = [];
              for (const sat of satellites) {
                if (sat.constellation) {
                  if (!groups.has(sat.constellation)) groups.set(sat.constellation, []);
                  groups.get(sat.constellation)!.push(sat);
                } else standalones.push(sat);
              }

              const SatRow = ({ sat }: { sat: typeof satellites[0] }) => {
                const isSel = selectedIds.includes(sat.id);
                const isVis = visibleIds.includes(sat.id);
                return (
                  <div
                    onClick={() => toggleSelect(sat.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', cursor: 'pointer',
                      background: isSel ? '#0d2240' : '#080e1c',
                      border: `1px solid ${isSel ? '#2a6acc' : panelBdr}`,
                    }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sat.color, flexShrink: 0, boxShadow: `0 0 4px ${sat.color}` }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: isSel ? '#88ccff' : textPrimary, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sat.name}
                        {isVis && <span style={{ color: '#44ffcc', marginLeft: 4 }}>●</span>}
                      </div>
                      <div style={{ color: textMuted, fontSize: 9 }}>{sat.altitude.toLocaleString()}km · {satType(sat.altitude)}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); toggleSatCoverage(sat.id); }} title="Coverage" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: sat.showCoverage ? sat.color : textMuted, padding: 0 }}>◎</button>
                    <button onClick={e => { e.stopPropagation(); handleRemove(sat.id); }} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#604060', padding: 0 }}>✕</button>
                  </div>
                );
              };

              return (
                <>
                  {standalones.map(sat => <SatRow key={sat.id} sat={sat} />)}
                  {Array.from(groups.entries()).map(([groupName, groupSats]) => {
                    const isExpanded = expandedConstellations.has(groupName);
                    const groupIds = groupSats.map(s => s.id);
                    const allSel  = groupIds.every(id => selectedIds.includes(id));
                    const someSel = groupIds.some(id => selectedIds.includes(id));
                    const allCov  = groupSats.every(s => s.showCoverage);
                    const visCount = groupIds.filter(id => visibleIds.includes(id)).length;
                    return (
                      <div key={groupName}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 6px', cursor: 'pointer',
                          background: allSel ? '#0d2240' : someSel ? '#0a1a30' : '#0c1020',
                          border: `1px solid ${allSel ? '#2a6acc' : someSel ? '#1a4a8a' : '#1a3060'}`,
                        }}>
                          <button onClick={() => toggleExpandConstellation(groupName)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 10, padding: 0, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</button>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: groupSats[0].color, flexShrink: 0, boxShadow: `0 0 4px ${groupSats[0].color}` }} />
                          <div onClick={() => toggleGroupSelect(groupIds)} style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ color: allSel ? '#88ccff' : textPrimary, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {groupName}
                              {visCount > 0 && <span style={{ color: '#44ffcc', marginLeft: 4, fontWeight: 400 }}>{visCount}✓</span>}
                            </div>
                            <div style={{ color: textMuted, fontSize: 9 }}>{groupSats.length} sats · {satType(groupSats[0].altitude)}</div>
                          </div>
                          <button onClick={() => toggleGroupCoverage(groupIds)} title="Coverage all" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: allCov ? groupSats[0].color : textMuted, padding: 0 }}>◎</button>
                          <button onClick={() => removeGroup(groupIds)} title="Remove all" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#604060', padding: 0 }}>✕</button>
                        </div>
                        {isExpanded && (
                          <div style={{ paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                            {groupSats.map(sat => <SatRow key={sat.id} sat={sat} />)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              );
            })()}
          </div>
        </div>

        {/* Constellation presets */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>CONSTELLATION PRESETS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {PRESETS.map(preset => (
              <button key={preset.label} onClick={() => handleLoadPreset(preset)} style={{
                width: '100%', padding: '7px 10px', fontSize: 9, fontFamily: fontMono, letterSpacing: 0.8,
                background: '#06100a', border: `1px solid #1a4a28`, color: preset.color, cursor: 'pointer',
                textAlign: 'left',
              }}>
                ◈ {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Real TLE data */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>REAL SATELLITE DATA</div>
          <button
            onClick={handleFetchTLE}
            disabled={tleStatus === 'loading'}
            style={{
              width: '100%', padding: '7px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 0.8,
              background: tleStatus === 'ok' ? '#0a200a' : tleStatus === 'error' ? '#200a0a' : '#0a1020',
              border: `1px solid ${tleStatus === 'ok' ? '#2a6a2a' : tleStatus === 'error' ? '#6a2a2a' : '#2a4060'}`,
              color: tleStatus === 'ok' ? '#44ff44' : tleStatus === 'error' ? '#ff4444' : '#4488cc',
              cursor: tleStatus === 'loading' ? 'default' : 'pointer',
            }}
          >
            {tleStatus === 'loading' ? '◌ FETCHING TLE...' :
             tleStatus === 'ok'      ? '✓ TLE LOADED (top 20)' :
             tleStatus === 'error'   ? '✕ FETCH FAILED' :
             '↓ FETCH REAL TLE (Celestrak)'}
          </button>
          <div style={{ color: '#2a4060', fontSize: 8, marginTop: 4 }}>Fetches visual satellites from Celestrak API</div>
        </div>

        {/* Add satellite */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          {!showForm ? (
            <button onClick={() => setShowForm(true)} style={{
              width: '100%', padding: '7px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
              background: '#0a1a30', border: `1px dashed ${panelBdr}`, color: '#4a8', cursor: 'pointer',
            }}>
              + ADD SATELLITE
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5 }}>NEW SATELLITE</div>
              <input
                value={addName} onChange={e => setAddName(e.target.value)}
                placeholder="Name"
                style={{ padding: '5px 8px', fontSize: 11, fontFamily: fontMono, background: '#04080f', border: `1px solid ${panelBdr}`, color: textPrimary, outline: 'none' }}
              />
              <div>
                <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>ALTITUDE (km)</div>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {[{ l: 'LEO', v: 400 }, { l: 'MEO', v: 20200 }, { l: 'GEO', v: 35786 }].map(p => (
                    <button key={p.l} onClick={() => setAddAlt(p.v)} style={{
                      flex: 1, padding: '3px 0', fontSize: 9, fontFamily: fontMono,
                      background: addAlt === p.v ? '#1a3e7a' : '#0a1630',
                      border: `1px solid ${addAlt === p.v ? '#4af' : panelBdr}`,
                      color: addAlt === p.v ? '#4af' : textMuted, cursor: 'pointer',
                    }}>{p.l}</button>
                  ))}
                </div>
                <input
                  type="number" value={addAlt} onChange={e => setAddAlt(Number(e.target.value))}
                  min={200} max={42000}
                  style={{ width: '100%', padding: '4px 8px', fontSize: 11, fontFamily: fontMono, background: '#04080f', border: `1px solid ${panelBdr}`, color: textPrimary, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>INCLINATION: {addIncl.toFixed(1)}°</div>
                <input type="range" min={0} max={90} step={0.5} value={addIncl} onChange={e => setAddIncl(Number(e.target.value))} style={{ width: '100%', accentColor: '#4af' }} />
              </div>
              <div>
                <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>RAAN: {addRaan.toFixed(0)}°</div>
                <input type="range" min={0} max={360} step={1} value={addRaan} onChange={e => setAddRaan(Number(e.target.value))} style={{ width: '100%', accentColor: '#4af' }} />
              </div>
              <div>
                <div style={{ color: textMuted, fontSize: 9, marginBottom: 4 }}>COLOR</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {PRESET_COLORS.map(c => (
                    <button key={c} onClick={() => setAddColor(c)} style={{
                      width: 18, height: 18, background: c, border: addColor === c ? '2px solid #fff' : '2px solid transparent',
                      cursor: 'pointer', borderRadius: '50%', boxShadow: addColor === c ? `0 0 6px ${c}` : 'none', padding: 0,
                    }} />
                  ))}
                </div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: textMuted, fontSize: 10 }}>
                <input type="checkbox" checked={addCoverage} onChange={e => setAddCoverage(e.target.checked)} style={{ accentColor: '#4af' }} />
                Show coverage circle
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={handleAdd} style={{
                  flex: 1, padding: '6px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
                  background: '#0a2a18', border: '1px solid #2a6a3a', color: '#4a8', cursor: 'pointer',
                }}>LAUNCH ▶</button>
                <button onClick={() => setShowForm(false)} style={{
                  padding: '6px 10px', fontSize: 10, fontFamily: fontMono,
                  background: '#0a0a18', border: `1px solid ${panelBdr}`, color: textMuted, cursor: 'pointer',
                }}>✕</button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div style={{ padding: '10px 14px', color: textMuted, fontSize: 9, lineHeight: 1.8, letterSpacing: 0.5, flexShrink: 0 }}>
          <div style={{ letterSpacing: 1.5, marginBottom: 4 }}>ORBIT TYPES</div>
          <div>LEO  &lt; 2,000 km  — fast (~90min)</div>
          <div>MEO    2k–36k km  — medium (12h)</div>
          <div>GEO  35,786 km   — stationary (24h)</div>
          <div style={{ marginTop: 6, color: '#2a5080' }}>● = visible from ground station</div>
          <div style={{ color: '#2a5080' }}>◎ = coverage circle</div>
          <div style={{ color: '#2a5080' }}>Click globe = add station</div>
          <div style={{ color: '#2a5080' }}>Click satellite = select</div>
        </div>
      </div>

      {/* Taskbar */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 30 }}>
        <AlleracTaskbar
          domainKey="space"
          domainName="Space"
          domainIcon="🛰️"
          userId={userId}
          userName={userName}
          userEmail={userEmail}
          isAdmin={isAdmin}
          allowedDomains={allowedDomains}
          onLogout={handleLogout}
        />
      </div>
    </div>
  );
}
