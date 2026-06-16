'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/app/context/ThemeContext';
import AlleracTaskbar from '@/app/components/layout/AlleracTaskbar';
import type { SatelliteData, PreviewOrbit, GroundStationData, SatLink } from '@/app/components/space/SatelliteSimulator';
import type { PassEvent, ConjunctionEvent, SatrecEntry } from '@/app/components/space/spaceCompute';
import { useConversations } from '@/app/hooks/useConversations';
import { useDomainChat } from '@/app/hooks/useDomainChat';
import ChatMessages from '@/app/components/chat/ChatMessages';
import ChatInput from '@/app/components/chat/ChatInput';
import { MODELS } from '@/app/services/llm/models';

const SatelliteSimulator = dynamic(
  () => import('@/app/components/space/SatelliteSimulator'),
  { ssr: false, loading: () => <div style={{ width: '100%', height: '100%', background: '#000510' }} /> },
);

const SolarSystemSimulator = dynamic(
  () => import('@/app/components/space/SolarSystemSimulator'),
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
  { id: 'gps-s',   name: 'GPS (single)', altitude: 20200, inclination: 55.0, raan: 200, color: '#66ffaa', showCoverage: false },
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

const SOLAR_SPEED_PRESETS = [
  { label: '1 day/s',   sub: '86,400×',   value: 86400              },
  { label: '30 days/s', sub: '2.6M×',     value: 86400 * 30         },
  { label: '1 year/s',  sub: '31.5M×',    value: 86400 * 365        },
];

let idCounter = 100;

type TLEStatus = 'idle' | 'loading' | 'ok' | 'error';

// ── TDRS Relay Scenario ───────────────────────────────────────────────────────
const _toRad = (d: number) => d * Math.PI / 180;

const TDRS_SCENARIO_SATS: SatelliteData[] = [
  { id: 'sc-hubble', name: 'Hubble Space Telescope', altitude: 547,   inclination: 28.5, raan: 10, initialTheta: 0,             color: '#88ccff', showCoverage: false },
  { id: 'sc-tdrs-e', name: 'TDRS-East (41°W)',       altitude: 35786, inclination: 3,    raan: 0,  initialTheta: _toRad(-41),  color: '#ffcc44', showCoverage: false },
  { id: 'sc-tdrs-w', name: 'TDRS-West (174°W)',      altitude: 35786, inclination: 3,    raan: 0,  initialTheta: _toRad(-174), color: '#ffcc44', showCoverage: false },
];

const TDRS_LINKS = [
  { fromId: 'sc-hubble', toId: 'sc-tdrs-e', color: '#44aaff' },
  { fromId: 'sc-hubble', toId: 'sc-tdrs-w', color: '#44aaff' },
];

// White Sands Complex, NM — NASA TDRS ground terminal
const WHITE_SANDS_GS = (() => {
  const lat = _toRad(32.54), lon = _toRad(-106.61), cosLat = Math.cos(lat);
  return {
    id: 'gs-white-sands',
    pos: { x: cosLat * Math.cos(-lon), y: Math.sin(lat), z: cosLat * Math.sin(-lon) },
    latRad: lat, lonRad: lon,
    coords: '33°N 107°W', locationName: 'White Sands, NM', loading: false,
  };
})();

export default function SpaceClient({ userId, userName, userEmail, isAdmin, allowedDomains }: Props) {
  'use no memo';
  const { isDark } = useTheme();
  const d = isDark;
  const router  = useRouter();
  const [satellites, setSatellites]     = useState<SatelliteData[]>(DEFAULT_SATELLITES);
  const [timeSpeed, setTimeSpeed]       = useState(60);
  const [showPaths, setShowPaths]       = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showDayNight, setShowDayNight] = useState(false);
  const [panelOpen, setPanelOpen]       = useState(false);
  const [chatOpen,  setChatOpen]        = useState(true);
  const [mobileTab, setMobileTab]       = useState<'globe' | 'ctrl' | 'chat'>('globe');
  const [viewMode,  setViewMode]        = useState<'earth' | 'solar'>('earth');
  const [tdrsMode,  setTdrsMode]        = useState(false);
  const [satLinkStatuses, setSatLinkStatuses] = useState<Record<string, boolean>>({});

  // Ground stations (multiple)
  const [groundStationMode, setGroundStationMode] = useState(false);
  type GS = { id: string; pos: { x: number; y: number; z: number }; latRad: number; lonRad: number; coords: string; locationName: string | null; loading: boolean };
  const [groundStations, setGroundStations] = useState<GS[]>([]);
  const [citySearch, setCitySearch]         = useState('');
  const [citySearching, setCitySearching]   = useState(false);
  const [activeStationId, setActiveStationId] = useState<string | null>(null);
  const [visibleIds, setVisibleIds]          = useState<string[]>([]);
  const gsIdCounter = useRef(0);

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

  // SGP4 passes + conjunctions
  const [passes, setPasses]               = useState<PassEvent[]>([]);
  const [passesStatus, setPassesStatus]   = useState<'idle' | 'computing' | 'ok' | 'no-data'>('idle');
  const [conjunctions, setConjunctions]   = useState<ConjunctionEvent[]>([]);
  const [conjStatus, setConjStatus]       = useState<'idle' | 'computing' | 'ok' | 'no-data'>('idle');

  // Chat
  const {
    conversations: chatConvs, currentConvId, setCurrentConvId,
    messages, setMessages, selectConversation, newConversation,
    deleteConversation, pinConversation, renameConversation, reload,
  } = useConversations(userId, 'space');

  const handleConvCreated = useCallback((id: string) => {
    setCurrentConvId(id); reload();
  }, [setCurrentConvId, reload]);

  const getSpaceContext = useCallback(() => {
    const satLines = satellites.map(s =>
      `- ${s.name}: alt=${Math.round(s.altitude)}km, incl=${s.inclination.toFixed(1)}°${selectedIds.includes(s.id) ? ' [SELECTED]' : ''}${visibleIds.includes(s.id) ? ' [VISIBLE from GS]' : ''}`
    ).join('\n');
    const gsLines = groundStations.map(gs =>
      `- ${gs.locationName ?? gs.coords}${gs.id === activeStationId ? ' [ACTIVE]' : ''}`
    ).join('\n');
    return [
      `Current space simulation state:`,
      `Time warp: ${timeSpeed}x (${timeSpeed < 3600 ? timeSpeed + 's/s' : Math.round(timeSpeed / 3600) + 'h/s'})`,
      satLines ? `Satellites:\n${satLines}` : 'No satellites.',
      gsLines  ? `Ground stations:\n${gsLines}` : 'No ground stations.',
      passes.length   ? `Last pass computation: ${passes.length} passes found.` : '',
      conjunctions.length ? `Conjunctions detected: ${conjunctions.length}` : '',
      tdrsMode ? `TDRS relay scenario active. Link statuses:\n${
        Object.entries(satLinkStatuses).map(([k, v]) => `  ${k}: ${v ? 'OPEN' : 'BLOCKED (Zone of Exclusion)'}`).join('\n') || '  (computing...)'
      }` : '',
    ].filter(Boolean).join('\n');
  }, [satellites, selectedIds, visibleIds, groundStations, activeStationId, timeSpeed, passes, conjunctions, tdrsMode, satLinkStatuses]);

  const {
    input, setInput, sending, selectedModel, setSelectedModel,
    convId, isAgentMode, toggleAgentMode, githubToken,
    messagesEndRef, lastToolCall, setLastToolCall,
    send, handleKeyPress, handleSaveToMemory,
    memoryOpen, setMemoryOpen, memoryLoading, memoryResult, setMemoryResult,
  } = useDomainChat({
    userId, domain: 'space', currentConvId,
    messages, setMessages,
    onConversationCreated: handleConvCreated,
    getPostContext: getSpaceContext,
  });

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
      const lon = -Math.atan2(pos.z, pos.x) * 180 / Math.PI;
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

  const addStationByCity = useCallback(async (query: string) => {
    if (!query.trim()) return;
    setCitySearching(true);
    try {
      const data = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        { headers: { 'Accept-Language': 'en' } },
      ).then(r => r.json());
      if (!data?.[0]) return;
      const latDeg = parseFloat(data[0].lat);
      const lonDeg = parseFloat(data[0].lon);
      const latRad = latDeg * Math.PI / 180;
      const lonRad = lonDeg * Math.PI / 180;
      const cosLat = Math.cos(latRad);
      const pos = { x: cosLat * Math.cos(-lonRad), y: Math.sin(latRad), z: cosLat * Math.sin(-lonRad) };
      const coords = `${latDeg >= 0 ? Math.round(latDeg) + '°N' : Math.abs(Math.round(latDeg)) + '°S'} ${lonDeg >= 0 ? Math.round(lonDeg) + '°E' : Math.abs(Math.round(lonDeg)) + '°W'}`;
      const a = data[0];
      const locationName = a.display_name?.split(',').slice(0, 2).join(',').trim() ?? query;
      const id = `gs-${++gsIdCounter.current}`;
      setGroundStations(prev => [...prev, { id, pos, latRad, lonRad, coords, locationName, loading: false }]);
      setActiveStationId(id);
      setCitySearch('');
    } catch {
      // silent fail
    } finally {
      setCitySearching(false);
    }
  }, []);

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
    const id     = `gs-${++gsIdCounter.current}`;
    // pos is ECF (Earth-local, normalized) from SatelliteSimulator
    const latRad = Math.asin(pos.y);
    const lonRad = -Math.atan2(pos.z, pos.x);
    const latDeg = latRad * 180 / Math.PI;
    const lonDeg = lonRad * 180 / Math.PI;
    const coords = `${latDeg >= 0 ? Math.round(latDeg) + '°N' : Math.abs(Math.round(latDeg)) + '°S'} ${lonDeg >= 0 ? Math.round(lonDeg) + '°E' : Math.abs(Math.round(lonDeg)) + '°W'}`;
    const newStation: GS = { id, pos, latRad, lonRad, coords, locationName: null, loading: true };
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

  // ── TDRS Scenario callbacks ───────────────────────────────────────────────────
  const activateTdrsScenario = useCallback(() => {
    setSatellites(prev => {
      const existingIds = new Set(prev.map(s => s.id));
      const toAdd = TDRS_SCENARIO_SATS.filter(s => !existingIds.has(s.id));
      return [...prev, ...toAdd];
    });
    setGroundStations(prev => {
      if (prev.some(gs => gs.id === WHITE_SANDS_GS.id)) return prev;
      return [...prev, WHITE_SANDS_GS];
    });
    setTdrsMode(true);
  }, []);

  const deactivateTdrsScenario = useCallback(() => {
    const ids = new Set(TDRS_SCENARIO_SATS.map(s => s.id));
    setSatellites(prev => prev.filter(s => !ids.has(s.id)));
    setGroundStations(prev => prev.filter(gs => gs.id !== WHITE_SANDS_GS.id));
    setSelectedIds(prev => prev.filter(id => !ids.has(id)));
    setSatLinkStatuses({});
    setTdrsMode(false);
  }, []);

  const handleSatLinkUpdate = useCallback((statuses: Record<string, boolean>) => {
    setSatLinkStatuses(statuses);
  }, []);

  const satLinks: SatLink[] = useMemo(
    () => tdrsMode ? TDRS_LINKS : [],
    [tdrsMode],
  );

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
      const data: Array<{ name: string; altitude: number; inclination: number; raan: number; initialTheta: number; line1: string; line2: string }> = await res.json();
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
        tle:           d.line1 && d.line2 ? { line1: d.line1, line2: d.line2 } : undefined,
      }));
      setSatellites(prev => [...prev.filter(s => s.constellation !== 'Real TLE'), ...tleSats]);
      setTleStatus('ok');
      // Reset SGP4-dependent computations when TLE data changes
      setPasses([]); setPassesStatus('idle');
      setConjunctions([]); setConjStatus('idle');
    } catch {
      setTleStatus('error');
      setTimeout(() => setTleStatus('idle'), 3000);
    }
  };

  const handleComputePasses = async () => {
    const activeStation = groundStations.find(gs => gs.id === activeStationId);
    const tleSats = satellites.filter(s => s.tle);
    if (!activeStation || tleSats.length === 0) {
      setPassesStatus('no-data');
      setTimeout(() => setPassesStatus('idle'), 2500);
      return;
    }
    setPassesStatus('computing');
    const { computePasses: compute, twoline2satrec } = await import('satellite.js').then(async (satLib) => {
      const { computePasses: cp } = await import('@/app/components/space/spaceCompute');
      return { computePasses: cp, twoline2satrec: satLib.twoline2satrec };
    });
    const entries: SatrecEntry[] = tleSats.flatMap(s => {
      if (!s.tle) return [];
      const satrec = twoline2satrec(s.tle.line1, s.tle.line2);
      if ((satrec as { error?: number }).error) return [];
      return [{ id: s.id, name: s.name, satrec }];
    });
    const result = compute(
      entries,
      { latitude: activeStation.latRad, longitude: activeStation.lonRad, height: 0 },
      Date.now(),
    );
    setPasses(result);
    setPassesStatus('ok');
  };

  const handleComputeConjunctions = async () => {
    const tleSats = satellites.filter(s => s.tle);
    if (tleSats.length < 2) {
      setConjStatus('no-data');
      setTimeout(() => setConjStatus('idle'), 2500);
      return;
    }
    setConjStatus('computing');
    const { computeConjunctions: compute, twoline2satrec } = await import('satellite.js').then(async (satLib) => {
      const { computeConjunctions: cc } = await import('@/app/components/space/spaceCompute');
      return { computeConjunctions: cc, twoline2satrec: satLib.twoline2satrec };
    });
    const entries: SatrecEntry[] = tleSats.flatMap(s => {
      if (!s.tle) return [];
      const satrec = twoline2satrec(s.tle.line1, s.tle.line2);
      if ((satrec as { error?: number }).error) return [];
      return [{ id: s.id, name: s.name, satrec }];
    });
    const result = compute(entries, Date.now());
    setConjunctions(result);
    setConjStatus('ok');
  };

  // ── Time helpers ─────────────────────────────────────────────────────────────
  function fmtTime(d: Date): string {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function fmtDuration(a: Date, b: Date): string {
    const s = Math.round((b.getTime() - a.getTime()) / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? String(s % 60).padStart(2, '0') + 's' : ''}`;
  }

  // ── Styles ────────────────────────────────────────────────────────────────────
  // Panels (Space Control + Space Assistant) follow the app theme
  const panelBg      = d ? '#060c1a' : '#f0f4f8';
  const panelBdr     = d ? '#1a3060' : '#b8cce0';
  const textPrimary  = d ? '#c8d8f0' : '#1a2a3a';
  const textMuted    = d ? '#506090' : '#5878a0';
  const btnBg        = d ? '#080e1c' : '#ffffff';
  const btnBgAlt     = d ? '#0a1630' : '#e8f0f8';
  const btnActive    = d ? '#1a3e7a' : '#d0e8f8';
  const btnActiveBdr = d ? '#4af'    : '#2266aa';
  const btnActiveClr = d ? '#4af'    : '#1a4a8a';
  const itemBg       = d ? '#060c0a' : '#f8fbff';
  const itemActiveBg = d ? '#0d1e10' : '#e0f0e8';
  const itemActiveBdr= d ? '#2a6a30' : '#4a9a60';
  const inputBg      = d ? '#04080f' : '#ffffff';
  const fontMono     = '"Courier New", "Lucida Console", monospace';
  // Canvas overlays always stay dark (they float over the 3D space background)
  const overlayBg    = 'rgba(6,12,26,0.85)';
  const overlayBdr   = '#1a3060';
  const overlayText  = '#c8d8f0';
  const overlayMuted = '#506090';
  const taskbarH    = 52;
  const PANEL_W     = 290;
  const CHAT_W      = 320;

  const effectiveChatW = isMobile ? 0 : (chatOpen ? CHAT_W : 0);
  const canvasRight    = isMobile ? 0 : (effectiveChatW + (panelOpen ? PANEL_W : 0));
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute', left: 0, right: 0, bottom: taskbarH,
        height: '62dvh', background: panelBg, borderTop: `1px solid ${panelBdr}`,
        display: 'flex', flexDirection: 'column', overflowY: 'auto', zIndex: 20,
        transform: mobileTab === 'ctrl' ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.25s ease',
      }
    : {
        position: 'absolute', right: effectiveChatW, top: 0, bottom: taskbarH,
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
        position: 'absolute', top: isMobile ? 36 : 0, left: 0, bottom: taskbarH, right: canvasRight,
        transition: 'right 0.2s ease',
        cursor: groundStationMode ? 'crosshair' : 'default',
        display: isMobile && mobileTab !== 'globe' ? 'none' : undefined,
      }}>
        {viewMode === 'earth' ? (
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
            satLinks={satLinks}
            onSatLinkUpdate={handleSatLinkUpdate}
          />
        ) : (
          <SolarSystemSimulator timeSpeed={timeSpeed} />
        )}
      </div>

      {/* View mode toggle — always dark (over 3D canvas) */}
      {!isMobile && (
        <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 22, display: 'flex', gap: 2 }}>
          {(['earth', 'solar'] as const).map(mode => (
            <button key={mode} onClick={() => {
              setViewMode(mode);
              setTimeSpeed(mode === 'solar' ? 86400 * 30 : 60);
            }} style={{
              padding: '5px 10px', fontSize: 9, fontFamily: fontMono, letterSpacing: 1,
              background: viewMode === mode ? '#0d1e30' : overlayBg,
              border: `1px solid ${viewMode === mode ? '#4af' : overlayBdr}`,
              color: viewMode === mode ? '#4af' : overlayMuted, cursor: 'pointer',
            }}>
              {mode === 'earth' ? '◎ EARTH ORBIT' : '☀ SOLAR SYSTEM'}
            </button>
          ))}
        </div>
      )}

      {/* Ground station mode indicator — always dark */}
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

      {/* Active station mini overlay — always dark */}
      {activeStation && !panelOpen && (
        <div style={{
          position: 'absolute', bottom: taskbarH + 8, left: 8, zIndex: 20,
          background: overlayBg, border: '1px solid #2a5a30',
          padding: '7px 12px', fontSize: 10, fontFamily: fontMono,
        }}>
          <div style={{ color: '#ffdd00', letterSpacing: 1, marginBottom: 3 }}>
            ◈ {activeStation.loading ? 'locating...' : (activeStation.locationName ?? activeStation.coords)}
          </div>
          {activeStation.locationName && <div style={{ color: overlayMuted, marginBottom: 3 }}>{activeStation.coords}</div>}
          {groundStations.length > 1 && <div style={{ color: overlayMuted, marginBottom: 3 }}>{groundStations.length} stations total</div>}
          <div style={{ color: visibleIds.length >= 3 ? '#44ffcc' : visibleIds.length > 0 ? '#ffaa44' : '#ff4444' }}>
            {visibleIds.length} visible{visibleIds.length >= 3 && ' — TRIANGULATED ✓'}
          </div>
        </div>
      )}

      {/* Panel toggle (desktop) — uses panel theme since it's part of the panel edge */}
      {!panelOpen && !isMobile && (
        <button
          onClick={() => setPanelOpen(true)}
          title="Open control panel"
          style={{
            position: 'absolute', right: effectiveChatW, top: '50%', transform: 'translateY(-50%)',
            background: panelBg, border: `1px solid ${panelBdr}`, color: textPrimary,
            padding: '8px 4px', cursor: 'pointer', fontSize: 12, letterSpacing: 1,
            writingMode: 'vertical-rl', zIndex: 21,
          }}
        >
          CTRL ▶
        </button>
      )}
      {isMobile && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
          display: 'flex', borderBottom: `1px solid ${panelBdr}`, background: panelBg,
        }}>
          {(['globe', 'ctrl', 'chat'] as const).map(tab => (
            <button key={tab} onClick={() => setMobileTab(tab)} style={{
              flex: 1, padding: '9px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 1.5,
              background: mobileTab === tab ? btnBgAlt : 'transparent',
              border: 'none', borderBottom: `2px solid ${mobileTab === tab ? '#4af' : 'transparent'}`,
              color: mobileTab === tab ? '#4af' : textMuted, cursor: 'pointer',
            }}>
              {tab === 'globe' ? (viewMode === 'solar' ? '☀ SOLAR' : '◎ GLOBE') : tab === 'ctrl' ? '⊞ CTRL' : '◈ CHAT'}
            </button>
          ))}
          <button onClick={() => {
            const next = viewMode === 'earth' ? 'solar' : 'earth';
            setViewMode(next);
            setTimeSpeed(next === 'solar' ? 86400 * 30 : 60);
            setMobileTab('globe');
          }} style={{
            padding: '9px 10px', fontSize: 9, fontFamily: fontMono,
            background: viewMode === 'solar' ? btnBgAlt : 'transparent',
            border: 'none', borderBottom: `2px solid ${viewMode === 'solar' ? '#fa0' : 'transparent'}`,
            color: viewMode === 'solar' ? '#fa0' : textMuted, cursor: 'pointer',
          }}>
            {viewMode === 'solar' ? '☀' : '☀'}
          </button>
        </div>
      )}

      {/* Control panel */}
      <div style={panelStyle}>

        {/* Header */}
        <div style={{ height: 42, padding: '0 14px', borderBottom: `1px solid ${panelBdr}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <span style={{ color: '#4af', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>◈ SPACE CONTROL</span>
          <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 14 }}>◀</button>
        </div>

        {/* Time warp */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>TIME WARP</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {(viewMode === 'solar' ? SOLAR_SPEED_PRESETS : SPEED_PRESETS).map(p => {
              const active = timeSpeed === p.value;
              return (
                <button key={p.value} onClick={() => setTimeSpeed(p.value)} style={{
                  flex: 1, padding: '6px 2px', fontFamily: fontMono, cursor: 'pointer',
                  background: active ? btnActive : btnBgAlt,
                  border: `1px solid ${active ? btnActiveBdr : panelBdr}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: active ? btnActiveClr : textPrimary, whiteSpace: 'nowrap' }}>{p.label}</span>
                  <span style={{ fontSize: 8, color: active ? btnActiveClr : textMuted }}>{p.sub}</span>
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
                background: value ? btnActive : btnBg,
                border: `1px solid ${value ? btnActiveBdr : panelBdr}`,
                color: value ? btnActiveClr : textMuted, cursor: 'pointer',
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
              background: groundStationMode ? 'rgba(255,200,0,0.12)' : btnBg,
              border: `1px solid ${groundStationMode ? '#ffcc00' : panelBdr}`,
              color: groundStationMode ? '#ffcc00' : textMuted, cursor: 'pointer', marginBottom: 6,
            }}
          >
            {groundStationMode ? '◉ CLICK GLOBE TO PLACE — ESC cancels' : '◎ + ADD STATION ON GLOBE'}
          </button>

          {/* City search */}
          <form
            onSubmit={e => { e.preventDefault(); addStationByCity(citySearch); }}
            style={{ display: 'flex', gap: 4, marginBottom: 6 }}
          >
            <input
              value={citySearch}
              onChange={e => setCitySearch(e.target.value)}
              placeholder="City name…"
              disabled={citySearching}
              style={{
                flex: 1, padding: '5px 7px', fontSize: 9, fontFamily: fontMono,
                background: inputBg, border: `1px solid ${panelBdr}`,
                color: textPrimary, outline: 'none',
                opacity: citySearching ? 0.5 : 1,
              }}
            />
            <button
              type="submit"
              disabled={citySearching || !citySearch.trim()}
              style={{
                padding: '5px 8px', fontSize: 9, fontFamily: fontMono,
                background: btnBg, border: `1px solid ${panelBdr}`,
                color: citySearching ? textMuted : textPrimary,
                cursor: citySearching || !citySearch.trim() ? 'default' : 'pointer',
              }}
            >
              {citySearching ? '…' : '→'}
            </button>
          </form>

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
                      background: isActive ? itemActiveBg : itemBg,
                      border: `1px solid ${isActive ? itemActiveBdr : panelBdr}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: isActive ? '#ffdd00' : '#666', fontSize: 10 }}>◈</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: isActive ? textPrimary : textMuted, fontWeight: isActive ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {gs.loading ? 'locating...' : (gs.locationName ?? gs.coords)}
                        </div>
                        {gs.locationName && <div style={{ color: textMuted }}>{gs.coords}</div>}
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

              const satRow = (sat: typeof satellites[0]) => {
                const isSel = selectedIds.includes(sat.id);
                const isVis = visibleIds.includes(sat.id);
                return (
                  <div
                    key={sat.id}
                    onClick={() => toggleSelect(sat.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', cursor: 'pointer',
                      background: isSel ? btnActive : btnBg,
                      border: `1px solid ${isSel ? btnActiveBdr : panelBdr}`,
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
                    <button onClick={e => { e.stopPropagation(); handleRemove(sat.id); }} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#604060', padding: 0 }}>✕</button>
                  </div>
                );
              };

              return (
                <>
                  {standalones.map(satRow)}
                  {Array.from(groups.entries()).map(([groupName, groupSats]) => {
                    const isExpanded = expandedConstellations.has(groupName);
                    const groupIds = groupSats.map(s => s.id);
                    const allSel  = groupIds.every(id => selectedIds.includes(id));
                    const someSel = groupIds.some(id => selectedIds.includes(id));
                    const visCount = groupIds.filter(id => visibleIds.includes(id)).length;
                    return (
                      <div key={groupName}>
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 5, padding: '5px 6px', cursor: 'pointer',
                          background: allSel ? btnActive : someSel ? btnBgAlt : btnBg,
                          border: `1px solid ${allSel ? btnActiveBdr : someSel ? panelBdr : panelBdr}`,
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
                          <button onClick={() => removeGroup(groupIds)} title="Remove all" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#604060', padding: 0 }}>✕</button>
                        </div>
                        {isExpanded && (
                          <div style={{ paddingLeft: 10, display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2 }}>
                            {groupSats.map(satRow)}
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
                background: itemBg, border: `1px solid ${panelBdr}`, color: preset.color, cursor: 'pointer',
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
              background: tleStatus === 'ok' ? itemActiveBg : tleStatus === 'error' ? (d ? '#200a0a' : '#fde8e8') : btnBg,
              border: `1px solid ${tleStatus === 'ok' ? itemActiveBdr : tleStatus === 'error' ? (d ? '#6a2a2a' : '#e05050') : panelBdr}`,
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

        {/* SGP4 Passes */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
            PASSES (SGP4 — next 24h)
          </div>
          <button
            onClick={handleComputePasses}
            disabled={passesStatus === 'computing'}
            style={{
              width: '100%', padding: '6px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 0.8,
              background: passesStatus === 'ok' ? itemActiveBg : passesStatus === 'no-data' ? (d ? '#1a0a0a' : '#fde8e8') : btnBg,
              border: `1px solid ${passesStatus === 'ok' ? itemActiveBdr : passesStatus === 'no-data' ? (d ? '#6a2a2a' : '#e05050') : panelBdr}`,
              color: passesStatus === 'ok' ? '#44ff44' : passesStatus === 'no-data' ? '#ff4444' : '#4488cc',
              cursor: passesStatus === 'computing' ? 'default' : 'pointer', marginBottom: 6,
            }}
          >
            {passesStatus === 'computing' ? '◌ COMPUTING...' :
             passesStatus === 'no-data'   ? '✕ SELECT STATION + LOAD TLE' :
             passesStatus === 'ok'        ? `✓ ${passes.length} PASSES FOUND` :
             '⟳ COMPUTE PASSES'}
          </button>
          {passesStatus === 'ok' && passes.length === 0 && (
            <div style={{ color: textMuted, fontSize: 9 }}>No passes in next 24h</div>
          )}
          {passesStatus === 'ok' && passes.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 200, overflowY: 'auto' }}>
              {passes.slice(0, 12).map((p, i) => {
                const elevColor = p.maxElev > 60 ? '#44ffcc' : p.maxElev > 20 ? '#ffaa44' : textMuted;
                return (
                  <div key={i} style={{ padding: '5px 7px', background: itemBg, border: `1px solid ${panelBdr}`, fontSize: 9 }}>
                    <div style={{ color: '#88ccff', fontWeight: 700, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.satName}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: textMuted }}>
                      <span>AOS {fmtTime(p.aos)}</span>
                      <span style={{ color: elevColor }}>↑{p.maxElev.toFixed(1)}°</span>
                    </div>
                    <div style={{ color: '#2a4060' }}>LOS {fmtTime(p.los)} · {fmtDuration(p.aos, p.los)}</div>
                  </div>
                );
              })}
              {passes.length > 12 && <div style={{ color: '#2a4060', fontSize: 8 }}>+{passes.length - 12} more</div>}
            </div>
          )}
          {passesStatus !== 'ok' && (
            <div style={{ color: '#2a4060', fontSize: 8 }}>Requires TLE data + active ground station</div>
          )}
        </div>

        {/* Conjunction detection */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>
            CONJUNCTION ALERTS (24h, &lt;10km)
          </div>
          <button
            onClick={handleComputeConjunctions}
            disabled={conjStatus === 'computing'}
            style={{
              width: '100%', padding: '6px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 0.8,
              background: conjStatus === 'ok' ? (conjunctions.length > 0 ? (d ? '#1a0808' : '#fde8e8') : itemActiveBg) : conjStatus === 'no-data' ? (d ? '#1a0a0a' : '#fde8e8') : btnBg,
              border: `1px solid ${conjStatus === 'ok' ? (conjunctions.length > 0 ? (d ? '#aa2222' : '#e05050') : itemActiveBdr) : conjStatus === 'no-data' ? (d ? '#6a2a2a' : '#e05050') : panelBdr}`,
              color: conjStatus === 'ok' ? (conjunctions.length > 0 ? '#ff6644' : '#44ff44') : conjStatus === 'no-data' ? '#ff4444' : '#4488cc',
              cursor: conjStatus === 'computing' ? 'default' : 'pointer', marginBottom: 6,
            }}
          >
            {conjStatus === 'computing' ? '◌ SCANNING ORBITS...' :
             conjStatus === 'no-data'   ? '✕ NEED ≥2 TLE SATELLITES' :
             conjStatus === 'ok'        ? (conjunctions.length > 0 ? `⚠ ${conjunctions.length} CONJUNCTION(S)` : '✓ NO CONJUNCTIONS') :
             '⟳ CHECK CONJUNCTIONS'}
          </button>
          {conjStatus === 'ok' && conjunctions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 180, overflowY: 'auto' }}>
              {conjunctions.slice(0, 8).map((c, i) => {
                const risk = c.minDist < 1 ? '#ff2222' : c.minDist < 5 ? '#ff8844' : '#ffcc44';
                return (
                  <div key={i} style={{ padding: '5px 7px', background: itemBg, border: `1px solid ${panelBdr}`, fontSize: 9 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ color: risk, fontWeight: 700 }}>⚠ {c.minDist.toFixed(2)} km</span>
                      <span style={{ color: '#2a4060' }}>{fmtTime(c.time)}</span>
                    </div>
                    <div style={{ color: textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.satNameA}</div>
                    <div style={{ color: textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>× {c.satNameB}</div>
                  </div>
                );
              })}
            </div>
          )}
          {conjStatus === 'ok' && conjunctions.length === 0 && (
            <div style={{ color: '#44aa44', fontSize: 9 }}>All clear — no close approaches detected</div>
          )}
          {conjStatus !== 'ok' && conjStatus !== 'no-data' && (
            <div style={{ color: '#2a4060', fontSize: 8 }}>Requires TLE data (≥2 satellites)</div>
          )}
        </div>

        {/* TDRS Relay Scenario */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          <div style={{ fontSize: 9, color: textMuted, letterSpacing: 1.5, marginBottom: 6, fontFamily: fontMono }}>
            RELAY SCENARIO — HUBBLE/TDRS
          </div>
          <button onClick={tdrsMode ? deactivateTdrsScenario : activateTdrsScenario} style={{
            width: '100%', padding: '7px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
            background: tdrsMode ? (d ? 'rgba(255,180,0,0.12)' : 'rgba(255,150,0,0.08)') : btnBg,
            border: `1px solid ${tdrsMode ? '#ffaa44' : panelBdr}`,
            color: tdrsMode ? '#ffaa44' : textMuted, cursor: 'pointer', marginBottom: tdrsMode ? 8 : 0,
          }}>
            {tdrsMode ? '⊟ DEACTIVATE SCENARIO' : '⊞ LOAD HUBBLE + TDRS SCENARIO'}
          </button>
          {tdrsMode && (
            <div style={{ fontSize: 9, fontFamily: fontMono }}>
              <div style={{ color: textMuted, marginBottom: 4 }}>S2S LINK STATUS</div>
              {TDRS_LINKS.map(link => {
                const key = `${link.fromId}::${link.toId}`;
                const active = satLinkStatuses[key];
                const toName = TDRS_SCENARIO_SATS.find(s => s.id === link.toId)?.name ?? link.toId;
                return (
                  <div key={key} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 0', borderBottom: `1px solid ${panelBdr}`,
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                      background: active === undefined ? '#444' : active ? '#44ff88' : '#ff3333',
                      boxShadow: active ? '0 0 6px #44ff88' : undefined,
                    }} />
                    <span style={{ color: textPrimary, flex: 1 }}>
                      Hubble → {toName.replace('TDRS-East (41°W)', 'TDRS-East').replace('TDRS-West (174°W)', 'TDRS-West')}
                    </span>
                    <span style={{ color: active === undefined ? '#666' : active ? '#44ff88' : '#ff3333' }}>
                      {active === undefined ? 'INIT' : active ? 'OPEN' : 'ZoE'}
                    </span>
                  </div>
                );
              })}
              <div style={{ color: '#666', fontSize: 8, marginTop: 6, lineHeight: 1.5 }}>
                ZoE = Zone of Exclusion (Earth blocking)<br />
                White Sands ground station added
              </div>
            </div>
          )}
        </div>

        {/* Add satellite */}
        <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0 }}>
          {!showForm ? (
            <button onClick={() => setShowForm(true)} style={{
              width: '100%', padding: '7px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
              background: btnBgAlt, border: `1px dashed ${panelBdr}`, color: '#4a8', cursor: 'pointer',
            }}>
              + ADD SATELLITE
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5 }}>NEW SATELLITE</div>
              <input
                value={addName} onChange={e => setAddName(e.target.value)}
                placeholder="Name"
                style={{ padding: '5px 8px', fontSize: 11, fontFamily: fontMono, background: inputBg, border: `1px solid ${panelBdr}`, color: textPrimary, outline: 'none' }}
              />
              <div>
                <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>ALTITUDE (km)</div>
                <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                  {[{ l: 'LEO', v: 400 }, { l: 'MEO', v: 20200 }, { l: 'GEO', v: 35786 }].map(p => (
                    <button key={p.l} onClick={() => setAddAlt(p.v)} style={{
                      flex: 1, padding: '3px 0', fontSize: 9, fontFamily: fontMono,
                      background: addAlt === p.v ? btnActive : btnBgAlt,
                      border: `1px solid ${addAlt === p.v ? btnActiveBdr : panelBdr}`,
                      color: addAlt === p.v ? btnActiveClr : textMuted, cursor: 'pointer',
                    }}>{p.l}</button>
                  ))}
                </div>
                <input
                  type="number" value={addAlt} onChange={e => setAddAlt(Number(e.target.value))}
                  min={200} max={42000}
                  style={{ width: '100%', padding: '4px 8px', fontSize: 11, fontFamily: fontMono, background: inputBg, border: `1px solid ${panelBdr}`, color: textPrimary, outline: 'none', boxSizing: 'border-box' }}
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
                  background: itemActiveBg, border: `1px solid ${itemActiveBdr}`, color: '#4a8', cursor: 'pointer',
                }}>LAUNCH ▶</button>
                <button onClick={() => setShowForm(false)} style={{
                  padding: '6px 10px', fontSize: 10, fontFamily: fontMono,
                  background: btnBg, border: `1px solid ${panelBdr}`, color: textMuted, cursor: 'pointer',
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

      {/* Chat column */}
      {!isMobile && (
        <>
          {/* Collapsed tab */}
          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              title="Open chat"
              style={{
                position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
                background: panelBg, border: `1px solid ${panelBdr}`, color: textPrimary,
                padding: '8px 4px', cursor: 'pointer', fontSize: 12, letterSpacing: 1,
                writingMode: 'vertical-rl', zIndex: 21,
              }}
            >
              ◀ CHAT
            </button>
          )}
          {chatOpen && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: taskbarH, width: CHAT_W, zIndex: 20,
          background: panelBg, borderLeft: `1px solid ${panelBdr}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ height: 42, padding: '0 14px', borderBottom: `1px solid ${panelBdr}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5 }}>SPACE ASSISTANT</div>
            <button
              onClick={() => setChatOpen(false)}
              title="Collapse chat"
              style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}
            >
              ▶
            </button>
          </div>
          {messages.length === 0 && !sending ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px', gap: 8 }}>
              <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1, textAlign: 'center', lineHeight: 1.8, marginBottom: 8 }}>
                {'ASK ABOUT ORBITAL MECHANICS,\nCOVERAGE, PASSES OR\nWHAT YOU SEE ON THE GLOBE'}
              </div>
              {[
                'Why do LEO satellites move so fast?',
                'How does coverage change with altitude?',
                'What causes satellite conjunctions?',
              ].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  style={{
                    width: '100%', padding: '8px 10px', fontSize: 9, fontFamily: fontMono,
                    background: btnBg, border: `1px solid ${panelBdr}`,
                    color: textMuted, cursor: 'pointer', textAlign: 'left', letterSpacing: 0.5,
                  }}
                >
                  {q}
                </button>
              ))}
              <div style={{ width: '100%', marginTop: 8 }}>
                <ChatInput
                  inputMessage={input} setInputMessage={setInput}
                  handleKeyPress={handleKeyPress} handleSendMessage={send}
                  isSending={sending} githubToken={githubToken} isDarkMode={d}
                  setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel} MODELS={MODELS}
                  githubConfigured ollamaConnected googleConfigured
                  isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                  onSaveMemory={handleSaveToMemory} hasConversation={!!convId}
                />
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <ChatMessages
                  messages={messages as unknown as import('@/app/types').Message[]}
                  isSending={sending} selectedModel={selectedModel} MODELS={MODELS}
                  isDarkMode={d} currentConversationId={convId} userId={userId}
                  githubToken={githubToken} messagesEndRef={messagesEndRef} domainSlug="space"
                />
              </div>
              <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: `1px solid ${panelBdr}` }}>
                <ChatInput
                  inputMessage={input} setInputMessage={setInput}
                  handleKeyPress={handleKeyPress} handleSendMessage={send}
                  isSending={sending} githubToken={githubToken} isDarkMode={d}
                  setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel} MODELS={MODELS}
                  githubConfigured ollamaConnected googleConfigured
                  isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                  onSaveMemory={handleSaveToMemory} hasConversation={!!convId}
                />
              </div>
            </>
          )}
        </div>
          )}
        </>
      )}

      {/* Mobile chat panel */}
      {isMobile && mobileTab === 'chat' && (
        <div style={{
          position: 'absolute', top: 36, left: 0, right: 0, bottom: taskbarH, zIndex: 20,
          background: panelBg, display: 'flex', flexDirection: 'column',
        }}>
          {messages.length === 0 && !sending ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 20px', gap: 8 }}>
              <div style={{ color: textMuted, fontSize: 10, letterSpacing: 1, textAlign: 'center', lineHeight: 1.8, marginBottom: 8 }}>
                {'PERGUNTE SOBRE MECÂNICA ORBITAL,\nCOBERTURA, PASSES OU\nO QUE VOCÊ VÊ NO GLOBO'}
              </div>
              {[
                'Por que satélites LEO se movem tão rápido?',
                'Como a altitude afeta a cobertura?',
                'O que causa conjunções de satélites?',
              ].map(q => (
                <button key={q} onClick={() => setInput(q)}
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 11, fontFamily: fontMono,
                    background: btnBg, border: `1px solid ${panelBdr}`,
                    color: textMuted, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  {q}
                </button>
              ))}
              <div style={{ width: '100%', marginTop: 8 }}>
                <ChatInput
                  inputMessage={input} setInputMessage={setInput}
                  handleKeyPress={handleKeyPress} handleSendMessage={send}
                  isSending={sending} githubToken={githubToken} isDarkMode={d}
                  setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel} MODELS={MODELS}
                  githubConfigured ollamaConnected googleConfigured
                  isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                  onSaveMemory={handleSaveToMemory} hasConversation={!!convId}
                />
              </div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                <ChatMessages
                  messages={messages as unknown as import('@/app/types').Message[]}
                  isSending={sending} selectedModel={selectedModel} MODELS={MODELS}
                  isDarkMode={d} currentConversationId={convId} userId={userId}
                  githubToken={githubToken} messagesEndRef={messagesEndRef} domainSlug="space"
                />
              </div>
              <div style={{ flexShrink: 0, padding: '10px 12px', borderTop: `1px solid ${panelBdr}` }}>
                <ChatInput
                  inputMessage={input} setInputMessage={setInput}
                  handleKeyPress={handleKeyPress} handleSendMessage={send}
                  isSending={sending} githubToken={githubToken} isDarkMode={d}
                  setIsDocumentModalOpen={() => {}} selectedModel={selectedModel}
                  setSelectedModel={setSelectedModel} MODELS={MODELS}
                  githubConfigured ollamaConnected googleConfigured
                  isAgentMode={isAgentMode} onToggleAgentMode={toggleAgentMode}
                  onSaveMemory={handleSaveToMemory} hasConversation={!!convId}
                />
              </div>
            </>
          )}
        </div>
      )}

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
