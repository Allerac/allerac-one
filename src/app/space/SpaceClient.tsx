'use client';

import dynamic from 'next/dynamic';
import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AlleracTaskbar from '@/app/components/layout/AlleracTaskbar';
import type { SatelliteData, PreviewOrbit } from '@/app/components/space/SatelliteSimulator';

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

const GM         = 3.986004418e14;
const R_EARTH_M  = 6.371e6;

function orbitalPeriodLabel(altKm: number): string {
  const a   = R_EARTH_M + altKm * 1000;
  const sec = 2 * Math.PI * Math.sqrt(a ** 3 / GM);
  const m   = Math.round(sec / 60);
  if (m < 120) return `${m}min`;
  const h   = Math.floor(m / 60), rem = m % 60;
  return rem ? `${h}h ${rem}min` : `${h}h`;
}

function satType(altKm: number): string {
  if (altKm < 2000) return 'LEO';
  if (altKm < 35000) return 'MEO';
  return 'GEO';
}

const DEFAULT_SATELLITES: SatelliteData[] = [
  { id: 'iss',      name: 'ISS',         altitude: 408,   inclination: 51.6, raan: 0,   color: '#e8f4ff', showCoverage: false },
  { id: 'hubble',   name: 'Hubble',      altitude: 547,   inclination: 28.5, raan: 60,  color: '#ffd966', showCoverage: false },
  { id: 'starlink', name: 'Starlink-L1', altitude: 550,   inclination: 53.0, raan: 120, color: '#66b2ff', showCoverage: false },
  { id: 'gps-s',   name: 'GPS (single)', altitude: 20200, inclination: 55.0, raan: 200, color: '#66ffaa', showCoverage: true  },
  { id: 'meteosat', name: 'Meteosat-12', altitude: 35786, inclination: 0.1,  raan: 0,   color: '#ff8844', showCoverage: false },
];

// GPS Walker 24/6/2 constellation (real parameters)
function generateGPSConstellation(): SatelliteData[] {
  const sats: SatelliteData[] = [];
  const planes = 6, perPlane = 4;
  const phaseShift = (2 * 360) / 24; // Walker F=2 → 30° offset per plane
  for (let p = 0; p < planes; p++) {
    for (let s = 0; s < perPlane; s++) {
      const initialTheta = ((s * 90 + p * phaseShift) % 360) * (Math.PI / 180);
      sats.push({
        id:            `gps-${p}-${s}`,
        name:          `GPS ${String.fromCharCode(65 + p)}${s + 1}`,
        altitude:      20200,
        inclination:   55,
        raan:          p * 60,
        color:         '#44ffaa',
        showCoverage:  true,
        initialTheta,
        constellation: 'GPS Walker 24/6/2',
      });
    }
  }
  return sats;
}

const PRESET_COLORS = [
  '#e8f4ff', '#ffd966', '#66b2ff', '#66ffaa', '#ff8844',
  '#ff66aa', '#cc88ff', '#44ffee', '#ff4444', '#ffffff',
];

const SPEED_PRESETS = [
  { label: '1×',    value: 1     },
  { label: '60×',   value: 60    },
  { label: '300×',  value: 300   },
  { label: '1800×', value: 1800  },
];

let idCounter = 100;

export default function SpaceClient({ userId, userName, userEmail, isAdmin, allowedDomains }: Props) {
  const router  = useRouter();
  const [satellites, setSatellites] = useState<SatelliteData[]>(DEFAULT_SATELLITES);
  const [timeSpeed, setTimeSpeed]   = useState(300);
  const [showPaths, setShowPaths]   = useState(true);
  const [showCoverage, setShowCoverage] = useState(true);
  const [panelOpen, setPanelOpen]   = useState(false);

  // Add-satellite form state
  const [addName,     setAddName]     = useState('');
  const [addAlt,      setAddAlt]      = useState(408);
  const [addIncl,     setAddIncl]     = useState(51.6);
  const [addRaan,     setAddRaan]     = useState(0);
  const [addColor,    setAddColor]    = useState(PRESET_COLORS[0]);
  const [addCoverage, setAddCoverage] = useState(false);
  const [showForm,    setShowForm]    = useState(false);

  const [selectedIds,            setSelectedIds]            = useState<string[]>([]);
  const [expandedConstellations, setExpandedConstellations] = useState<Set<string>>(new Set());

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

  const handleLoadGPS = () => {
    const gpsSats = generateGPSConstellation();
    setSatellites(prev => {
      const nonGps = prev.filter(s => !s.id.startsWith('gps-'));
      return [...nonGps, ...gpsSats];
    });
  };

  const handleAdd = () => {
    if (!addName.trim()) return;
    const newSat: SatelliteData = {
      id:           `sat-${++idCounter}`,
      name:         addName.trim(),
      altitude:     addAlt,
      inclination:  addIncl,
      raan:         addRaan,
      color:        addColor,
      showCoverage: addCoverage,
    };
    setSatellites(prev => [...prev, newSat]);
    setAddName(''); setShowForm(false);
  };

  const handleRemove = (id: string) => setSatellites(prev => prev.filter(s => s.id !== id));

  const toggleSatCoverage = (id: string) =>
    setSatellites(prev => prev.map(s => s.id === id ? { ...s, showCoverage: !s.showCoverage } : s));

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // ── styles ──────────────────────────────────────────────────────────────────
  const panelBg    = '#060c1a';
  const panelBdr   = '#1a3060';
  const textPrimary = '#c8d8f0';
  const textMuted  = '#506090';
  const fontMono   = '"Courier New", "Lucida Console", monospace';
  const taskbarH   = 52;
  const PANEL_W    = 280; // desktop side panel width

  // Desktop: canvas shrinks when panel open; mobile: canvas always full width
  const canvasRight = isMobile ? 0 : (panelOpen ? PANEL_W : 0);
  // Panel positioning differs by device
  const panelStyle: React.CSSProperties = isMobile
    ? {
        position: 'absolute', left: 0, right: 0, bottom: taskbarH,
        height: '62dvh',
        background: panelBg,
        borderTop: `1px solid ${panelBdr}`,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        zIndex: 20,
        transform: panelOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.25s ease',
      }
    : {
        position: 'absolute', right: 0, top: 0, bottom: taskbarH,
        width: PANEL_W,
        background: panelBg,
        borderLeft: `1px solid ${panelBdr}`,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
        zIndex: 20,
        transform: panelOpen ? 'translateX(0)' : `translateX(${PANEL_W}px)`,
        transition: 'transform 0.2s ease',
      };

  return (
    <div style={{ position: 'relative', height: '100dvh', background: '#000510', overflow: 'hidden', fontFamily: fontMono }}>

      {/* 3D canvas — right margin shrinks on desktop when panel open */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, bottom: taskbarH,
        right: canvasRight,
        transition: 'right 0.2s ease',
      }}>
        <SatelliteSimulator
          satellites={satellites}
          timeSpeed={timeSpeed}
          showPaths={showPaths}
          showCoverage={showCoverage}
          previewOrbit={previewOrbit}
          selectedIds={selectedIds}
        />
      </div>

      {/* Panel toggle — desktop: edge tab; mobile: floating button top-right */}
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
      {/* Mobile: floating toggle button */}
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

      {/* Control panel — always rendered, slides in/out via transform */}
      <div style={panelStyle}>

          {/* Header */}
          <div style={{
            padding: '10px 14px',
            borderBottom: `1px solid ${panelBdr}`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ color: '#4af', fontSize: 11, fontWeight: 700, letterSpacing: 2 }}>
              ◈ SPACE CONTROL
            </span>
            <button onClick={() => setPanelOpen(false)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 14 }}>◀</button>
          </div>

          {/* Speed */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}` }}>
            <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>TIME WARP</div>
            <div style={{ display: 'flex', gap: 4 }}>
              {SPEED_PRESETS.map(p => (
                <button
                  key={p.value}
                  onClick={() => setTimeSpeed(p.value)}
                  style={{
                    flex: 1, padding: '4px 0', fontSize: 10, fontFamily: fontMono,
                    background: timeSpeed === p.value ? '#1a3e7a' : '#0a1630',
                    border: `1px solid ${timeSpeed === p.value ? '#4af' : panelBdr}`,
                    color: timeSpeed === p.value ? '#4af' : textMuted,
                    cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Toggles */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}`, display: 'flex', gap: 8 }}>
            {[
              { label: 'PATHS', value: showPaths, toggle: () => setShowPaths(v => !v) },
              { label: 'COVERAGE', value: showCoverage, toggle: () => setShowCoverage(v => !v) },
            ].map(({ label, value, toggle }) => (
              <button
                key={label}
                onClick={toggle}
                style={{
                  flex: 1, padding: '5px 0', fontSize: 9, fontFamily: fontMono, letterSpacing: 1,
                  background: value ? '#0d2a4a' : '#080e1c',
                  border: `1px solid ${value ? '#2a7acc' : panelBdr}`,
                  color: value ? '#6ac' : textMuted,
                  cursor: 'pointer',
                }}
              >
                {value ? '◉' : '○'} {label}
              </button>
            ))}
          </div>

          {/* Satellite list */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}` }}>
            <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 8 }}>
              SATELLITES ({satellites.length}){selectedIds.length > 0 && <span style={{ color: '#4af', marginLeft: 6 }}>· {selectedIds.length} selected</span>}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {/* Group constellation satellites */}
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
                  return (
                    <div
                      key={sat.id}
                      onClick={() => toggleSelect(sat.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '4px 6px', cursor: 'pointer',
                        background: isSel ? '#0d2240' : '#080e1c',
                        border: `1px solid ${isSel ? '#2a6acc' : panelBdr}`,
                        boxShadow: isSel ? `inset 0 0 0 1px #2a6acc` : 'none',
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sat.color, flexShrink: 0, boxShadow: `0 0 4px ${sat.color}` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ color: isSel ? '#88ccff' : textPrimary, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sat.name}</div>
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
                      const allSel = groupIds.every(id => selectedIds.includes(id));
                      const someSel = groupIds.some(id => selectedIds.includes(id));
                      const allCov  = groupSats.every(s => s.showCoverage);
                      return (
                        <div key={groupName}>
                          {/* Group header */}
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: 5,
                            padding: '5px 6px',
                            background: allSel ? '#0d2240' : someSel ? '#0a1a30' : '#0c1020',
                            border: `1px solid ${allSel ? '#2a6acc' : someSel ? '#1a4a8a' : '#1a3060'}`,
                            cursor: 'pointer',
                          }}>
                            <button onClick={() => toggleExpandConstellation(groupName)} style={{ background: 'none', border: 'none', color: textMuted, cursor: 'pointer', fontSize: 10, padding: 0, flexShrink: 0 }}>{isExpanded ? '▾' : '▸'}</button>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: groupSats[0].color, flexShrink: 0, boxShadow: `0 0 4px ${groupSats[0].color}` }} />
                            <div onClick={() => toggleGroupSelect(groupIds)} style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: allSel ? '#88ccff' : textPrimary, fontSize: 10, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{groupName}</div>
                              <div style={{ color: textMuted, fontSize: 9 }}>{groupSats.length} satellites · {satType(groupSats[0].altitude)}</div>
                            </div>
                            <button onClick={() => toggleGroupCoverage(groupIds)} title="Coverage all" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: allCov ? groupSats[0].color : textMuted, padding: 0 }}>◎</button>
                            <button onClick={() => removeGroup(groupIds)} title="Remove all" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 10, color: '#604060', padding: 0 }}>✕</button>
                          </div>
                          {/* Expanded rows */}
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
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}` }}>
            <div style={{ color: textMuted, fontSize: 9, letterSpacing: 1.5, marginBottom: 6 }}>CONSTELLATION PRESETS</div>
            <button
              onClick={handleLoadGPS}
              style={{
                width: '100%', padding: '7px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
                background: '#0a2010', border: '1px solid #1a5a30', color: '#44ffaa', cursor: 'pointer',
              }}
            >
              ◈ GPS WALKER 24/6/2
            </button>
          </div>

          {/* Add satellite */}
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${panelBdr}` }}>
            {!showForm ? (
              <button
                onClick={() => setShowForm(true)}
                style={{
                  width: '100%', padding: '7px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
                  background: '#0a1a30', border: `1px dashed ${panelBdr}`, color: '#4a8', cursor: 'pointer',
                }}
              >
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

                {/* Altitude presets */}
                <div>
                  <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>ALTITUDE (km)</div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 4 }}>
                    {[{ l: 'LEO', v: 400 }, { l: 'MEO', v: 20200 }, { l: 'GEO', v: 35786 }].map(p => (
                      <button
                        key={p.l}
                        onClick={() => setAddAlt(p.v)}
                        style={{
                          flex: 1, padding: '3px 0', fontSize: 9, fontFamily: fontMono,
                          background: addAlt === p.v ? '#1a3e7a' : '#0a1630',
                          border: `1px solid ${addAlt === p.v ? '#4af' : panelBdr}`,
                          color: addAlt === p.v ? '#4af' : textMuted, cursor: 'pointer',
                        }}
                      >
                        {p.l}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" value={addAlt}
                    onChange={e => setAddAlt(Number(e.target.value))}
                    min={200} max={42000}
                    style={{ width: '100%', padding: '4px 8px', fontSize: 11, fontFamily: fontMono, background: '#04080f', border: `1px solid ${panelBdr}`, color: textPrimary, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                {/* Inclination */}
                <div>
                  <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>INCLINATION: {addIncl.toFixed(1)}°</div>
                  <input
                    type="range" min={0} max={90} step={0.5} value={addIncl}
                    onChange={e => setAddIncl(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#4af' }}
                  />
                </div>

                {/* RAAN */}
                <div>
                  <div style={{ color: textMuted, fontSize: 9, marginBottom: 3 }}>RAAN: {addRaan.toFixed(0)}°</div>
                  <input
                    type="range" min={0} max={360} step={1} value={addRaan}
                    onChange={e => setAddRaan(Number(e.target.value))}
                    style={{ width: '100%', accentColor: '#4af' }}
                  />
                </div>

                {/* Color palette */}
                <div>
                  <div style={{ color: textMuted, fontSize: 9, marginBottom: 4 }}>COLOR</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {PRESET_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setAddColor(c)}
                        style={{
                          width: 18, height: 18, background: c,
                          border: addColor === c ? '2px solid #fff' : '2px solid transparent',
                          cursor: 'pointer', borderRadius: '50%',
                          boxShadow: addColor === c ? `0 0 6px ${c}` : 'none',
                          padding: 0,
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Coverage toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: textMuted, fontSize: 10 }}>
                  <input type="checkbox" checked={addCoverage} onChange={e => setAddCoverage(e.target.checked)} style={{ accentColor: '#4af' }} />
                  Show coverage circle
                </label>

                {/* Buttons */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    onClick={handleAdd}
                    style={{
                      flex: 1, padding: '6px 0', fontSize: 10, fontFamily: fontMono, letterSpacing: 1,
                      background: '#0a2a18', border: '1px solid #2a6a3a', color: '#4a8', cursor: 'pointer',
                    }}
                  >
                    LAUNCH ▶
                  </button>
                  <button
                    onClick={() => setShowForm(false)}
                    style={{
                      padding: '6px 10px', fontSize: 10, fontFamily: fontMono,
                      background: '#0a0a18', border: `1px solid ${panelBdr}`, color: textMuted, cursor: 'pointer',
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding: '10px 14px', color: textMuted, fontSize: 9, lineHeight: 1.8, letterSpacing: 0.5 }}>
            <div style={{ letterSpacing: 1.5, marginBottom: 4 }}>ORBIT TYPES</div>
            <div>LEO  &lt; 2,000 km  — fast (~90min)</div>
            <div>MEO    2k–36k km  — medium (12h)</div>
            <div>GEO  35,786 km   — stationary (24h)</div>
            <div style={{ marginTop: 6, color: '#2a5080' }}>◎ = coverage circle</div>
          </div>
        </div>

      {/* Taskbar — absolutely pinned to bottom */}
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
