'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

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
// ECI → Three.js (Y = North Pole)
function orbitalPos(r: number, i: number, Ω: number, θ: number): THREE.Vector3 {
  const cosΩ = Math.cos(Ω), sinΩ = Math.sin(Ω);
  const cosi = Math.cos(i), sini = Math.sin(i);
  const cosθ = Math.cos(θ), sinθ = Math.sin(θ);
  const ex = r * (cosΩ * cosθ - sinΩ * sinθ * cosi);
  const ey = r * (sinΩ * cosθ + cosΩ * sinθ * cosi);
  const ez = r * sinθ * sini;
  return new THREE.Vector3(ex, ez, ey);
}

function updateCoverageCircle(geo: THREE.BufferGeometry, satPos: THREE.Vector3, r: number) {
  const ρ = Math.acos(1 / r);
  const nadir = satPos.clone().normalize();
  const up = Math.abs(nadir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t = up.clone().addScaledVector(nadir, -up.dot(nadir)).normalize();
  const b = nadir.clone().cross(t).normalize();
  const attr = geo.attributes.position as THREE.BufferAttribute;
  const cosρ = Math.cos(ρ), sinρ = Math.sin(ρ);
  for (let k = 0; k <= 96; k++) {
    const phi = (k / 96) * 2 * Math.PI;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    attr.setXYZ(k,
      cosρ * nadir.x + sinρ * (cp * t.x + sp * b.x),
      cosρ * nadir.y + sinρ * (cp * t.y + sp * b.y),
      cosρ * nadir.z + sinρ * (cp * t.z + sp * b.z),
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

// ═══════════════ Internal ref types ══════════════════════════════════════════

type SatRef = {
  mesh: THREE.Mesh;
  orbitLine: THREE.Line | null;
  coverageLine: THREE.Line | null;
  selectionSprite: THREE.Sprite | null;
  ω: number; r: number; i: number; Ω: number; θ0: number; θ: number;
};

// ═══════════════ Component ════════════════════════════════════════════════════

export default function SatelliteSimulator({
  satellites, timeSpeed, showPaths, showCoverage, showDayNight,
  previewOrbit, selectedIds, groundStations,
  onSatelliteClick, onEarthClick, onVisibilityUpdate,
}: Props) {
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
    stationRefs: new Map<string, { mesh: THREE.Mesh; localPos: THREE.Vector3; worldPos: THREE.Vector3 | null }>(),
    triLines:    [] as THREE.Line[],
    frame: 0,
    clock: new THREE.Clock(),
    simTime: 0,
    sunAngle: 0,
    lastVisibleJoined: '',
    satRefs: new Map<string, SatRef>(),
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
  useEffect(() => { stateRef.current.timeSpeed = timeSpeed; }, [timeSpeed]);
  useEffect(() => { stateRef.current.onSatelliteClick = onSatelliteClick ?? null; }, [onSatelliteClick]);
  useEffect(() => { stateRef.current.onEarthClick = onEarthClick ?? null; }, [onEarthClick]);
  useEffect(() => { stateRef.current.onVisibilityUpdate = onVisibilityUpdate ?? null; }, [onVisibilityUpdate]);

  useEffect(() => {
    stateRef.current.showPaths = showPaths;
    stateRef.current.satRefs.forEach(s => { if (s.orbitLine) s.orbitLine.visible = showPaths; });
  }, [showPaths]);

  useEffect(() => {
    stateRef.current.showCoverage = showCoverage;
    stateRef.current.satRefs.forEach(s => { if (s.coverageLine) s.coverageLine.visible = showCoverage; });
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

    // Add new stations + update active colour
    for (const gs of (groundStations ?? [])) {
      let ref = s.stationRefs.get(gs.id);
      if (!ref) {
        const mesh = new THREE.Mesh(
          new THREE.ConeGeometry(0.018, 0.075, 6),
          new THREE.MeshBasicMaterial({ color: gs.active ? 0xffdd00 : 0xaaaaaa }),
        );
        s.scene.add(mesh);
        const worldPt = new THREE.Vector3(gs.x, gs.y, gs.z).normalize();
        const localPos = s.earth.worldToLocal(worldPt.clone()).normalize();
        ref = { mesh, localPos, worldPos: null };
        s.stationRefs.set(gs.id, ref);
      } else {
        // Update colour if active changed
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

      // Check Earth
      const earthHits = s.earth ? raycaster.intersectObject(s.earth, false) : [];
      if (earthHits.length > 0) {
        const pt = earthHits[0].point;
        s.onEarthClick?.({ x: pt.x, y: pt.y, z: pt.z });
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
    const animate = () => {
      s.frame = requestAnimationFrame(animate);
      const delta = s.clock.getDelta();
      s.simTime += delta * s.timeSpeed;

      controls.update();
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

      // Update satellite positions
      s.satRefs.forEach(sat => {
        sat.θ = sat.ω * s.simTime + sat.θ0;
        const pos = orbitalPos(sat.r, sat.i, sat.Ω, sat.θ);
        sat.mesh.position.copy(pos);
        if (sat.coverageLine && s.showCoverage) {
          updateCoverageCircle(sat.coverageLine.geometry, pos, sat.r);
        }
      });

      // All stations: update world pos + orient cones
      let activeWorldPos: THREE.Vector3 | null = null;
      s.stationRefs.forEach((ref, id) => {
        if (!s.earth) return;
        const wp = s.earth.localToWorld(ref.localPos.clone());
        ref.worldPos = wp;
        ref.mesh.position.copy(wp);
        ref.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wp.clone().normalize());
        // Is this the active station?
        const gsData = (groundStations ?? []).find(g => g.id === id);
        if (gsData?.active) activeWorldPos = wp.clone();
      });

      // Visibility + triangulation from the active station only
      s.triLines.forEach(l => { l.visible = false; });
      if (activeWorldPos) {
        const stationDir = (activeWorldPos as THREE.Vector3).clone().normalize();
        const visibleIds: string[] = [];
        s.satRefs.forEach((satRef, id) => {
          if (satRef.mesh.position.dot(stationDir) > 1.05) visibleIds.push(id);
        });
        const joined = [...visibleIds].sort().join(',');
        if (joined !== s.lastVisibleJoined) {
          s.lastVisibleJoined = joined;
          s.onVisibilityUpdate?.(visibleIds);
        }
        if (visibleIds.length >= 3) {
          visibleIds.slice(0, MAX_TRI).forEach((id, k) => {
            const satRef = s.satRefs.get(id);
            if (!satRef || k >= s.triLines.length) return;
            const line = s.triLines[k];
            const attr = line.geometry.attributes.position as THREE.BufferAttribute;
            attr.setXYZ(0, (activeWorldPos as THREE.Vector3).x, (activeWorldPos as THREE.Vector3).y, (activeWorldPos as THREE.Vector3).z);
            attr.setXYZ(1, satRef.mesh.position.x, satRef.mesh.position.y, satRef.mesh.position.z);
            attr.needsUpdate = true;
            line.visible = true;
          });
        }
      }

      renderer.render(scene, camera);
    };
    animate();

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

  // ── Selection highlight ───────────────────────────────────────────────────────
  useEffect(() => {
    const s = stateRef.current;
    if (!s.scene) return;
    const sel = new Set(selectedIds ?? []);
    s.satRefs.forEach((satRef, id) => {
      const isSelected = sel.has(id);
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
        satRef.mesh.geometry.dispose();
        s.satRefs.delete(id);
      }
    });

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
      mesh.add(new THREE.PointLight(col, 1.2, 0.8));
      scene.add(mesh);

      let orbitLine: THREE.Line | null = null;
      if (s.showPaths) {
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 128; k++) pts.push(orbitalPos(r, i, Ω, (k / 128) * 2 * Math.PI));
        orbitLine = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: col, opacity: 0.30, transparent: true }),
        );
        scene.add(orbitLine);
      }

      let coverageLine: THREE.Line | null = null;
      if (data.showCoverage) {
        const pts = new Float32Array((96 + 1) * 3);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
        coverageLine = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: col, opacity: 0.50, transparent: true }),
        );
        coverageLine.visible = s.showCoverage;
        scene.add(coverageLine);
      }

      const θ0 = data.initialTheta ?? 0;
      s.satRefs.set(data.id, {
        mesh, orbitLine, coverageLine, selectionSprite: null,
        ω, r, i, Ω, θ0, θ: θ0,
      });
    });
  }, [satellites]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
