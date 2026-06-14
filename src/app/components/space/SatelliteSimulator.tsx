'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { propagate, twoline2satrec } from 'satellite.js';

// ═══════════════ Types ═══════════════════════════════════════════════════════

export interface SatelliteData {
  id: string;
  name: string;
  altitude: number;
  inclination: number;
  raan: number;
  color: string;
  showCoverage: boolean;
  initialTheta?: number;
  constellation?: string;
  tle?: { line1: string; line2: string };
}

export interface PreviewOrbit {
  altitude: number;
  inclination: number;
  raan: number;
}

export interface GroundStationData {
  id: string;
  x: number;
  y: number;
  z: number;
  active: boolean; // which one drives triangulation / visibility
}

interface Props {
  satellites: SatelliteData[];
  timeSpeed: number;
  showPaths: boolean;
  showCoverage: boolean;
  showDayNight: boolean;
  previewOrbit?: PreviewOrbit | null;
  selectedIds?: string[];
  groundStations?: GroundStationData[];
  targetFps?: number;
  onSatelliteClick?: (id: string) => void;
  onEarthClick?: (pos: { x: number; y: number; z: number }) => void;
  onVisibilityUpdate?: (ids: string[]) => void;
}

// ═══════════════ Constants ════════════════════════════════════════════════════

const GM         = 3.986004418e14;
const R_EARTH_M  = 6.371e6;
const EARTH_SPIN = (2 * Math.PI) / 86164;
const MAX_TRI    = 6; // max triangulation lines

// ═══════════════ Pure helpers ═════════════════════════════════════════════════

function sceneRadius(altKm: number) {
  return (R_EARTH_M + altKm * 1000) / R_EARTH_M;
}
function angularVelocity(altKm: number) {
  const a = R_EARTH_M + altKm * 1000;
  return (2 * Math.PI) / (2 * Math.PI * Math.sqrt(a ** 3 / GM));
}
// ECI → Three.js (Y = North Pole) — allocating version, only used outside the hot path
function orbitalPos(r: number, i: number, Ω: number, θ: number): THREE.Vector3 {
  const cosΩ = Math.cos(Ω), sinΩ = Math.sin(Ω);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  const ex = r * (cosΩ * cosθ - sinΩ * sinθ * cosi);
  const ey = r * (sinΩ * cosθ + cosΩ * sinθ * cosi);
  const ez = r * sinθ * sini;
  return new THREE.Vector3(ex, ez, ey);
}
// Zero-allocation version — writes directly into `out` to avoid GC pressure in hot path
function setOrbitalPos(out: THREE.Vector3, r: number, i: number, Ω: number, θ: number): void {
  const cosΩ = Math.cos(Ω), sinΩ = Math.sin(Ω);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  out.set(
    r * (cosΩ * cosθ - sinΩ * sinθ * cosi),  // Three.x = ECI x
    r * sinθ * sini,                            // Three.y = ECI z (north)
    r * (sinΩ * cosθ + cosΩ * sinθ * cosi),   // Three.z = ECI y
  );
}

function updateCoverageCircle(geo: THREE.BufferGeometry, satPos: THREE.Vector3, r: number) {
  const ρ = Math.acos(1 / r);
  _sNadir.copy(satPos).normalize();
  if (Math.abs(_sNadir.y) < 0.9) _sUp.copy(_YAXIS); else _sUp.copy(_XAXIS);
  _sTan.copy(_sUp).addScaledVector(_sNadir, -_sUp.dot(_sNadir)).normalize();
  _sBitan.copy(_sNadir).cross(_sTan).normalize();
  const attr = geo.attributes.position as THREE.BufferAttribute;
  const cosρ = Math.cos(ρ), sinρ = Math.sin(ρ);
  for (let k = 0; k <= 96; k++) {
    const phi = (k / 96) * 2 * Math.PI;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    attr.setXYZ(k,
      cosρ * _sNadir.x + sinρ * (cp * _sTan.x + sp * _sBitan.x),
      cosρ * _sNadir.y + sinρ * (cp * _sTan.y + sp * _sBitan.y),
      cosρ * _sNadir.z + sinρ * (cp * _sTan.z + sp * _sBitan.z),
    );
  }
  attr.needsUpdate = true;
}

const CAP_N = 32;
const CAP_OFFSET = 1.002; // slightly above Earth surface to avoid z-fighting
function updateCoverageCap(geo: THREE.BufferGeometry, satPos: THREE.Vector3, r: number) {
  const ρ = Math.acos(Math.min(1, 1 / r));
  _sNadir.copy(satPos).normalize();
  if (Math.abs(_sNadir.y) < 0.9) _sUp.copy(_YAXIS); else _sUp.copy(_XAXIS);
  _sTan.copy(_sUp).addScaledVector(_sNadir, -_sUp.dot(_sNadir)).normalize();
  _sBitan.copy(_sNadir).cross(_sTan).normalize();
  const attr = geo.attributes.position as THREE.BufferAttribute;
  const cosρ = Math.cos(ρ), sinρ = Math.sin(ρ);
  attr.setXYZ(0, _sNadir.x * CAP_OFFSET, _sNadir.y * CAP_OFFSET, _sNadir.z * CAP_OFFSET);
  for (let k = 0; k <= CAP_N; k++) {
    const phi = (k / CAP_N) * 2 * Math.PI;
    attr.setXYZ(k + 1,
      (cosρ * _sNadir.x + sinρ * (Math.cos(phi) * _sTan.x + Math.sin(phi) * _sBitan.x)) * CAP_OFFSET,
      (cosρ * _sNadir.y + sinρ * (Math.cos(phi) * _sTan.y + Math.sin(phi) * _sBitan.y)) * CAP_OFFSET,
      (cosρ * _sNadir.z + sinρ * (Math.cos(phi) * _sTan.z + Math.sin(phi) * _sBitan.z)) * CAP_OFFSET,
    );
  }
  attr.needsUpdate = true;
}

function loadEarthTextures(): { day: THREE.Texture; night: THREE.Texture } {
  const loader = new THREE.TextureLoader();
  const day   = loader.load('/textures/earth_day.jpg');
  const night = loader.load('/textures/earth_night.jpg');
  day.colorSpace   = THREE.SRGBColorSpace;
  night.colorSpace = THREE.SRGBColorSpace;
  return { day, night };
}

function createStarField(): THREE.Points {
  const n = 3500;
  const pos = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi = Math.acos(2 * Math.random() - 1);
    const d = 120 + Math.random() * 80;
    pos[k*3] = d * Math.sin(phi) * Math.cos(theta);
    pos[k*3+1] = d * Math.cos(phi);
    pos[k*3+2] = d * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, sizeAttenuation: true }));
}

let _selTex: THREE.Texture | null = null;
function getSelectionTexture(): THREE.Texture {
  if (_selTex) return _selTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
  ctx.shadowColor = '#88ddff'; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.stroke();
  _selTex = new THREE.CanvasTexture(c);
  return _selTex;
}

// Sprite-based glow replaces PointLight — same visual effect, zero GPU lighting cost
const _glowCache = new Map<string, THREE.Texture>();
function getGlowTexture(hex: string): THREE.Texture {
  if (_glowCache.has(hex)) return _glowCache.get(hex)!;
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, hex + 'ff');
  g.addColorStop(0.3, hex + '88');
  g.addColorStop(1, hex + '00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  _glowCache.set(hex, tex);
  return tex;
}

// ═══════════════ Internal ref types ══════════════════════════════════════════

const R_EARTH_KM = 6371;

// Pre-allocated scratch vectors — reused in hot path to avoid GC pressure
const _YAXIS   = new THREE.Vector3(0, 1, 0);
const _XAXIS   = new THREE.Vector3(1, 0, 0);
const _sNadir  = new THREE.Vector3();
const _sUp     = new THREE.Vector3();
const _sTan    = new THREE.Vector3();
const _sBitan  = new THREE.Vector3();
const _sWorld  = new THREE.Vector3();

type SatRef = {
  mesh: THREE.Mesh;
  orbitLine: THREE.Line | null;
  coverageLine: THREE.Line | null;
  coverageCap: THREE.Mesh | null;
  selectionSprite: THREE.Sprite | null;
  _pos: THREE.Vector3;  // pre-allocated to avoid GC churn per frame
  ω: number; r: number; i: number; Ω: number; θ0: number; θ: number;
  satrec?: ReturnType<typeof twoline2satrec>;
  constellation?: string;
  isPlaneRepresentative: boolean;
};

// ═══════════════ Component ════════════════════════════════════════════════════

export default function SatelliteSimulator({
  satellites, timeSpeed, showPaths, showCoverage, showDayNight,
  previewOrbit, selectedIds, groundStations, targetFps,
  onSatelliteClick, onEarthClick, onVisibilityUpdate,
}: Props) {
  'use no memo';
  const mountRef = useRef<HTMLDivElement>(null);

  const stateRef = useRef({
    renderer:    null as THREE.WebGLRenderer | null,
    scene:       null as THREE.Scene | null,
    camera:      null as THREE.PerspectiveCamera | null,
    controls:    null as OrbitControls | null,
    earth:       null as THREE.Mesh | null,
    earthMat:    null as THREE.MeshPhongMaterial | null,
    dayTexture:  null as THREE.Texture | null,
    nightTexture: null as THREE.Texture | null,
    ambientLight: null as THREE.AmbientLight | null,
    sunLight:    null as THREE.DirectionalLight | null,
    previewLine: null as THREE.Line | null,
    stationRefs: new Map<string, { mesh: THREE.Mesh; localPos: THREE.Vector3; worldPos: THREE.Vector3 | null; active: boolean }>(),
    triLines:    [] as THREE.Line[],
    frame: 0,
    clock: new THREE.Clock(),
    simTime: 0,
    sunAngle: 0,
    lastVisibleJoined: '',
    satRefs: new Map<string, SatRef>(),
    simEpochMs: Date.now(),
    targetFps: targetFps ?? 30,
    lastFrameTime: 0,
    lastInteractionTime: 0,
    selectedIdsSet: new Set<string>(),
    // Pre-allocated hot-path helpers — avoid GC churn in animate loop
    _simDate: new Date(),
    _stationNorm: new THREE.Vector3(),
    _activeWorldPos: new THREE.Vector3(),
    _hasActiveStation: false,
    _stationDir: new THREE.Vector3(),
    _visibleIds: [] as string[],
    // Synced from props (no re-render on change)
    timeSpeed,
    showPaths,
    showCoverage,
    showDayNight,
    onSatelliteClick: null as ((id: string) => void) | null,
    onEarthClick:     null as ((pos: { x: number; y: number; z: number }) => void) | null,
    onVisibilityUpdate: null as ((ids: string[]) => void) | null,
  });

  // ── Prop sync effects (no scene required) ───────────────────────────────────
  useEffect(() => { stateRef.current.targetFps = targetFps ?? 30; }, [targetFps]);
  useEffect(() => { stateRef.current.timeSpeed = timeSpeed; }, [timeSpeed]);
  useEffect(() => { stateRef.current.onSatelliteClick = onSatelliteClick ?? null; }, [onSatelliteClick]);
  useEffect(() => { stateRef.current.onEarthClick = onEarthClick ?? null; }, [onEarthClick]);
  useEffect(() => { stateRef.current.onVisibilityUpdate = onVisibilityUpdate ?? null; }, [onVisibilityUpdate]);

  useEffect(() => {
    const s = stateRef.current;
    s.showPaths = showPaths;
    const sel = s.selectedIdsSet;
    const constellationTotal = new Map<string, number>();
    const constellationSelected = new Map<string, number>();
    s.satRefs.forEach((ref, id) => {
      if (ref.constellation) {
        constellationTotal.set(ref.constellation, (constellationTotal.get(ref.constellation) ?? 0) + 1);
        if (sel.has(id)) constellationSelected.set(ref.constellation, (constellationSelected.get(ref.constellation) ?? 0) + 1);
      }
    });
    s.satRefs.forEach((satRef, id) => {
      if (!satRef.orbitLine) return;
      let show = showPaths;
      if (!show) {
        if (satRef.constellation) {
          const total = constellationTotal.get(satRef.constellation) ?? 1;
          const selCount = constellationSelected.get(satRef.constellation) ?? 0;
          show = total > 12 ? satRef.isPlaneRepresentative && selCount > total * 0.5 : sel.has(id);
        } else {
          show = sel.has(id);
        }
      }
      satRef.orbitLine.visible = show;
    });
  }, [showPaths]);

  useEffect(() => {
    const s = stateRef.current;
    s.showCoverage = showCoverage;
    const sel = s.selectedIdsSet;
    s.satRefs.forEach((satRef, id) => {
      const isSelected = sel.has(id);
      if (satRef.coverageLine) satRef.coverageLine.visible = showCoverage || isSelected;
      if (satRef.coverageCap)  satRef.coverageCap.visible  = showCoverage || isSelected;
    });
  }, [showCoverage]);

  useEffect(() => {
    const s = stateRef.current;
    s.showDayNight = showDayNight;
    if (!s.ambientLight || !s.sunLight || !s.earthMat) return;
    if (showDayNight) {
      s.ambientLight.intensity = 0.06;
      s.sunLight.intensity = 4.5;
      s.earthMat.emissiveIntensity = 0.0;
      // Night side shows city lights
      if (s.nightTexture) { s.earthMat.emissiveMap = s.nightTexture; s.earthMat.emissiveIntensity = 0.8; }
      s.earthMat.emissive.set(0xffffff);
    } else {
      s.ambientLight.intensity = 1.2;
      s.sunLight.intensity = 2.8;
      s.earthMat.emissiveMap = null;
      s.earthMat.emissive.set(0x040810);
      s.earthMat.emissiveIntensity = 0.0;
      s.sunLight.position.set(12, 6, 8);
    }
    s.earthMat.needsUpdate = true;
  }, [showDayNight]);

  // ── Ground stations sync (multi) ─────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene || !s.earth) return;
    const incoming = new Map((groundStations ?? []).map(gs => [gs.id, gs]));

    // Remove deleted stations
    for (const [id, ref] of s.stationRefs.entries()) {
      if (!incoming.has(id)) {
        s.scene.remove(ref.mesh);
        s.stationRefs.delete(id);
      }
    }

    // Add new stations + sync localPos + update active colour
    for (const gs of (groundStations ?? [])) {
      // gs.x/y/z is already in Earth-local (ECF) coords — recompute every run to stay in sync
      const localPos = new THREE.Vector3(gs.x, gs.y, gs.z).normalize();
      let ref = s.stationRefs.get(gs.id);
      if (!ref) {
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.018, 0.075, 6),
          new THREE.MeshBasicMaterial({ color: gs.active ? 0xffdd00 : 0xaaaaaa }),
        );
        s.scene.add(mesh);
        ref = { mesh, localPos, worldPos: null, active: gs.active };
        s.stationRefs.set(gs.id, ref);
      } else {
        ref.localPos.copy(localPos);
        ref.active = gs.active;
        (ref.mesh.material as THREE.MeshBasicMaterial).color.set(gs.active ? 0xffdd00 : 0xaaaaaa);
      }
    }

    // Clear triangulation if no active station
    if (!(groundStations ?? []).some(gs => gs.active)) {
      s.triLines.forEach(l => { l.visible = false; });
      s.lastVisibleJoined = '';
      s.onVisibilityUpdate?.([]);
    }
  }, [groundStations]);

  // ── Scene initialisation ──────────────────────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current!;
    const s = stateRef.current;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.setClearColor(0x000510);
    mount.appendChild(renderer.domElement);
    s.renderer = renderer;

    const scene = new THREE.Scene();
    s.scene = scene;

    const camera = new THREE.PerspectiveCamera(45, mount.clientWidth / mount.clientHeight, 0.01, 500);
    camera.position.set(0, 2.5, 7);
    s.camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.07;
    controls.minDistance = 1.4; controls.maxDistance = 40;
    controls.addEventListener('change', () => { s.lastInteractionTime = performance.now(); });
    s.controls = controls;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x223366, 1.2);
    scene.add(ambientLight);
    s.ambientLight = ambientLight;

    const sunLight = new THREE.DirectionalLight(0xfff0e0, 2.8);
    sunLight.position.set(12, 6, 8);
    scene.add(sunLight);
    s.sunLight = sunLight;

    // Stars + Earth
    scene.add(createStarField());

    const { day: dayTex, night: nightTex } = loadEarthTextures();
    s.dayTexture   = dayTex;
    s.nightTexture = nightTex;

    const earthMat = new THREE.MeshPhongMaterial({
      map: dayTex,
      specular: new THREE.Color(0x224466),
      shininess: 25,
    });
    s.earthMat = earthMat;
    const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
    scene.add(earth);
    s.earth = earth;

    // Atmosphere
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.022, 48, 48),
      new THREE.MeshPhongMaterial({ color: 0x3366ff, transparent: true, opacity: 0.06, side: THREE.FrontSide }),
    ));
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.065, 48, 48),
      new THREE.MeshPhongMaterial({ color: 0x2244cc, transparent: true, opacity: 0.035, side: THREE.BackSide }),
    ));

    // Pre-allocate triangulation lines
    for (let k = 0; k < MAX_TRI; k++) {
      const pts = new Float32Array(6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const line = new THREE.Line(geo,
        new THREE.LineBasicMaterial({ color: 0x44ffcc, opacity: 0.55, transparent: true }),
      );
      line.visible = false;
      scene.add(line);
      s.triLines.push(line);
    }

    // ── Raycaster click handler ────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.05 };
    let lastPointerDown = { x: 0, y: 0 };

    const onPointerDown = (e: PointerEvent) => {
      lastPointerDown = { x: e.clientX, y: e.clientY };
    };
    const onPointerUp = (e: PointerEvent) => {
      // Only fire if pointer didn't move much (not an orbit drag)
      const dx = e.clientX - lastPointerDown.x, dy = e.clientY - lastPointerDown.y;
      if (Math.sqrt(dx*dx + dy*dy) > 5) return;

      const rect = mount.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(mouse, s.camera!);

      // Check satellite meshes first
      const satMeshes = Array.from(s.satRefs.values()).map(sr => sr.mesh);
      const satHits = raycaster.intersectObjects(satMeshes, false);
      if (satHits.length > 0) {
        const hitMesh = satHits[0].object;
        for (const [id, sr] of s.satRefs.entries()) {
          if (sr.mesh === hitMesh) { s.onSatelliteClick?.(id); return; }
        }
      }

      // Check Earth — pass ECF (Earth-local) coords so callers get correct geodetic position
      const earthHits = s.earth ? raycaster.intersectObject(s.earth, false) : [];
      if (earthHits.length > 0) {
        const worldPt = earthHits[0].point;
        const ecfPt = s.earth!.worldToLocal(worldPt.clone()).normalize();
        s.onEarthClick?.({ x: ecfPt.x, y: ecfPt.y, z: ecfPt.z });
      }
    };
    mount.addEventListener('pointerdown', onPointerDown);
    mount.addEventListener('pointerup', onPointerUp);

    // ── ResizeObserver ────────────────────────────────────────────────────────
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    // ── Animation loop ────────────────────────────────────────────────────────
    const animate = (timestamp: number) => {
      s.frame = requestAnimationFrame(animate);
      const delta = s.clock.getDelta();
      s.simTime += delta * s.timeSpeed;

      // controls.update() runs at full rAF rate (60 Hz) so damping is always smooth;
      // it fires 'change' events during damping which keeps render at 60 fps until the
      // camera actually stops, then we drop to targetFps automatically.
      controls.update();

      // FPS cap — full speed during interaction/damping, target fps when idle
      const isInteracting = performance.now() - s.lastInteractionTime < 300;
      if (timestamp - s.lastFrameTime < 1000 / (isInteracting ? 60 : s.targetFps)) return;
      s.lastFrameTime = timestamp;

      earth.rotation.y = EARTH_SPIN * s.simTime;

      // Sun orbit when day/night is on (real time, not simulation)
      if (s.showDayNight) {
        s.sunAngle += delta * 0.08; // full orbit every ~79s real time
        s.sunLight!.position.set(
          Math.cos(s.sunAngle) * 20,
          4,
          Math.sin(s.sunAngle) * 20,
        );
      }

      // Update satellite positions — zero-allocation hot path
      s._simDate.setTime(s.simEpochMs + s.simTime * 1000);
      s.satRefs.forEach(sat => {
        if (sat.satrec) {
          const pv = propagate(sat.satrec, s._simDate) ?? {};
          const pvPos = (pv as { position?: unknown }).position;
          if (pvPos && typeof pvPos !== 'boolean') {
            const p = pvPos as { x: number; y: number; z: number };
            sat._pos.set(p.x / R_EARTH_KM, p.z / R_EARTH_KM, p.y / R_EARTH_KM);
          }
          // on propagation failure, keep last valid position
        } else {
          sat.θ = sat.ω * s.simTime + sat.θ0;
          setOrbitalPos(sat._pos, sat.r, sat.i, sat.Ω, sat.θ);
        }
        sat.mesh.position.copy(sat._pos);
        if (sat.coverageLine?.visible) updateCoverageCircle(sat.coverageLine.geometry, sat._pos, sat.r);
        if (sat.coverageCap?.visible)  updateCoverageCap(sat.coverageCap.geometry, sat._pos, sat.r);
      });

      // All stations: update world pos + orient cones — zero-allocation
      s._hasActiveStation = false;
      s.stationRefs.forEach((ref, id) => {
        if (!s.earth) return;
        _sWorld.copy(ref.localPos);
        s.earth.localToWorld(_sWorld);
        if (!ref.worldPos) ref.worldPos = new THREE.Vector3();
        ref.worldPos.copy(_sWorld);
        ref.mesh.position.copy(_sWorld);
        ref.mesh.quaternion.setFromUnitVectors(_YAXIS, s._stationNorm.copy(_sWorld).normalize());
        if (ref.active) {
          s._activeWorldPos.copy(_sWorld);
          s._hasActiveStation = true;
        }
      });

      // Visibility + connection lines from the active station
      s.triLines.forEach(l => { l.visible = false; });
      if (s._hasActiveStation) {
        s._stationDir.copy(s._activeWorldPos).normalize();
        s._visibleIds.length = 0;
        s.satRefs.forEach((satRef, id) => {
          // dot > 1.0: satellite above geometric horizon (Earth radius = 1.0 in scene units)
          // For LEO (r≈1.064) this covers the full ~20° visibility cone; works for all altitudes
          if (satRef.mesh.position.dot(s._stationDir) > 1.0) s._visibleIds.push(id);
        });
        s._visibleIds.sort();
        const joined = s._visibleIds.join(',');
        if (joined !== s.lastVisibleJoined) {
          s.lastVisibleJoined = joined;
          s.onVisibilityUpdate?.(s._visibleIds.slice());
        }
        // Draw lines from station to each SELECTED satellite that is also visible
        let lineIdx = 0;
        s._visibleIds.forEach(id => {
          if (!s.selectedIdsSet.has(id) || lineIdx >= s.triLines.length) return;
          const satRef = s.satRefs.get(id);
          if (!satRef) return;
          const line = s.triLines[lineIdx++];
          const attr = line.geometry.attributes.position as THREE.BufferAttribute;
          attr.setXYZ(0, s._activeWorldPos.x, s._activeWorldPos.y, s._activeWorldPos.z);
          attr.setXYZ(1, satRef.mesh.position.x, satRef.mesh.position.y, satRef.mesh.position.z);
          attr.needsUpdate = true;
          line.visible = true;
        });
      }

      renderer.render(scene, camera);
    };
    animate(0);

    return () => {
      cancelAnimationFrame(s.frame);
      mount.removeEventListener('pointerdown', onPointerDown);
      mount.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Preview orbit (live while form is open) ──────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene) return;
    if (s.previewLine) {
      s.scene.remove(s.previewLine);
      s.previewLine.geometry.dispose();
      s.previewLine = null;
    }
    if (!previewOrbit) return;
    const r = sceneRadius(previewOrbit.altitude);
    const i = THREE.MathUtils.degToRad(previewOrbit.inclination);
    const Ω = THREE.MathUtils.degToRad(previewOrbit.raan);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 128; k++) pts.push(orbitalPos(r, i, Ω, (k / 128) * 2 * Math.PI));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x00eeff, opacity: 0.75, transparent: true }),
    );
    s.scene.add(line);
    s.previewLine = line;
  }, [previewOrbit]);

  // ── Selection highlight + orbit/coverage visibility ───────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene) return;
    const sel = new Set(selectedIds ?? []);
    s.selectedIdsSet = sel;

    // Pre-compute constellation ratios for orbit line plane logic
    const constellationTotal = new Map<string, number>();
    const constellationSelected = new Map<string, number>();
    s.satRefs.forEach((ref, id) => {
      if (ref.constellation) {
        constellationTotal.set(ref.constellation, (constellationTotal.get(ref.constellation) ?? 0) + 1);
        if (sel.has(id)) constellationSelected.set(ref.constellation, (constellationSelected.get(ref.constellation) ?? 0) + 1);
      }
    });

    s.satRefs.forEach((satRef, id) => {
      const isSelected = sel.has(id);

      // Orbit line: individual when selected; for large constellations show plane
      // representative lines when >50% of the constellation is selected
      if (satRef.orbitLine) {
        let show = s.showPaths;
        if (!show) {
          if (satRef.constellation) {
            const total = constellationTotal.get(satRef.constellation) ?? 1;
            const selCount = constellationSelected.get(satRef.constellation) ?? 0;
            show = total > 12
              ? satRef.isPlaneRepresentative && selCount > total * 0.5
              : isSelected;
          } else {
            show = isSelected;
          }
        }
        satRef.orbitLine.visible = show;
      }

      // Coverage ring + cap: automatic on selection (or global override)
      if (satRef.coverageLine) satRef.coverageLine.visible = s.showCoverage || isSelected;
      if (satRef.coverageCap)  satRef.coverageCap.visible  = s.showCoverage || isSelected;

      // Scale + selection ring sprite
      satRef.mesh.scale.setScalar(isSelected ? 2.5 : 1.0);
      if (isSelected && !satRef.selectionSprite) {
        const sprite = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: getSelectionTexture(), transparent: true, opacity: 0.9, depthTest: false }),
        );
        sprite.scale.set(0.15, 0.15, 1);
        satRef.mesh.add(sprite);
        satRef.selectionSprite = sprite;
      } else if (!isSelected && satRef.selectionSprite) {
        satRef.mesh.remove(satRef.selectionSprite);
        satRef.selectionSprite = null;
      }
    });
  }, [selectedIds]);

  // ── Satellite reconciliation ──────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene) return;
    const scene = s.scene;
    const nextIds = new Set(satellites.map(d => d.id));

    // Remove deleted
    s.satRefs.forEach((satRef, id) => {
      if (!nextIds.has(id)) {
        scene.remove(satRef.mesh);
        if (satRef.orbitLine)    scene.remove(satRef.orbitLine);
        if (satRef.coverageLine) scene.remove(satRef.coverageLine);
        if (satRef.coverageCap)  scene.remove(satRef.coverageCap);
        satRef.mesh.geometry.dispose();
        s.satRefs.delete(id);
      }
    });

    // Count constellation sizes
    const constellationCounts = new Map<string, number>();
    for (const d of satellites) {
      if (d.constellation) constellationCounts.set(d.constellation, (constellationCounts.get(d.constellation) ?? 0) + 1);
    }

    // Track which orbital planes have a representative line (large constellations only)
    const drawnOrbitPlanes = new Set<string>();

    // Add new
    satellites.forEach(data => {
      if (s.satRefs.has(data.id)) return;
      const r = sceneRadius(data.altitude);
      const ω = angularVelocity(data.altitude);
      const i = THREE.MathUtils.degToRad(data.inclination);
      const Ω = THREE.MathUtils.degToRad(data.raan);
      const col = new THREE.Color(data.color);

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 8),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      const constellationSize = data.constellation ? (constellationCounts.get(data.constellation) ?? 1) : 1;
      if (constellationSize <= 12) {
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({
          map: getGlowTexture(data.color),
          blending: THREE.AdditiveBlending,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }));
        glow.scale.set(0.18, 0.18, 1);
        mesh.add(glow);
      }
      scene.add(mesh);

      // Large constellations: 1 orbit line per orbital plane (not per satellite)
      const isLargeConst = data.constellation !== undefined && constellationSize > 12;
      const planeKey = isLargeConst ? `${data.constellation}::${data.raan.toFixed(1)}` : null;
      const isPlaneRepresentative = planeKey !== null && !drawnOrbitPlanes.has(planeKey);
      if (isPlaneRepresentative && planeKey) drawnOrbitPlanes.add(planeKey);

      let orbitLine: THREE.Line | null = null;
      if (!isLargeConst || isPlaneRepresentative) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 128; k++) pts.push(orbitalPos(r, i, Ω, (k / 128) * 2 * Math.PI));
        orbitLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: col, opacity: isLargeConst ? 0.18 : 0.30, transparent: true }),
        );
        orbitLine.visible = false; // driven by selection or showPaths toggle
        scene.add(orbitLine);
      }

      // Coverage ring — always created, visibility driven by selection
      const ringPts = new Float32Array((96 + 1) * 3);
      const ringGeo = new THREE.BufferGeometry();
      ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPts, 3));
      const coverageLine = new THREE.Line(
        ringGeo,
        new THREE.LineBasicMaterial({ color: col, opacity: 0.65, transparent: true }),
      );
      coverageLine.visible = false;
      scene.add(coverageLine);

      // Coverage cap — filled spherical footprint, additive blending creates heat map on overlap
      const capVerts = new Float32Array((CAP_N + 2) * 3);
      const capIndices: number[] = [];
      for (let k = 0; k < CAP_N; k++) capIndices.push(0, k + 1, k + 2);
      const capGeo = new THREE.BufferGeometry();
      capGeo.setAttribute('position', new THREE.BufferAttribute(capVerts, 3));
      capGeo.setIndex(capIndices);
      const coverageCap = new THREE.Mesh(capGeo, new THREE.MeshBasicMaterial({
        color: col,
        transparent: true,
        opacity: 0.18,
        side: THREE.FrontSide,
        depthWrite: false,
        depthTest: false,  // cap sits on Earth surface — skip depth test to avoid z-fighting
        blending: THREE.AdditiveBlending,
      }));
      coverageCap.visible = false;
      scene.add(coverageCap);

      const θ0 = data.initialTheta ?? 0;
      let satrec: ReturnType<typeof twoline2satrec> | undefined;
      if (data.tle) {
        const parsed = twoline2satrec(data.tle.line1, data.tle.line2);
        if (!parsed.error) satrec = parsed;
      }
      s.satRefs.set(data.id, {
        mesh, orbitLine, coverageLine, coverageCap, selectionSprite: null,
        _pos: new THREE.Vector3(),
        ω, r, i, Ω, θ0, θ: θ0, satrec,
        constellation: data.constellation,
        isPlaneRepresentative,
      });
    });
  }, [satellites]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
