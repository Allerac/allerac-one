'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SatelliteData {
  id: string;
  name: string;
  altitude: number;   // km above surface
  inclination: number; // degrees
  raan: number;       // Right Ascension of Ascending Node, degrees
  color: string;      // hex
  showCoverage: boolean;
  initialTheta?: number;  // radians — starting position in orbit (default 0)
  constellation?: string; // group name (e.g. 'GPS Walker 24/6/2')
}

export interface PreviewOrbit {
  altitude: number;
  inclination: number;
  raan: number;
}

interface Props {
  satellites: SatelliteData[];
  timeSpeed: number;
  showPaths: boolean;
  showCoverage: boolean;
  previewOrbit?: PreviewOrbit | null;
  selectedIds?: string[];
}

const GM          = 3.986004418e14; // m³/s²
const R_EARTH_M   = 6.371e6;        // m (scene radius = 1)
const EARTH_SPIN  = (2 * Math.PI) / 86164; // rad/s (sidereal day)

function sceneRadius(altKm: number) {
  return (R_EARTH_M + altKm * 1000) / R_EARTH_M;
}

function angularVelocity(altKm: number) {
  const a = R_EARTH_M + altKm * 1000;
  return (2 * Math.PI) / (2 * Math.PI * Math.sqrt(a ** 3 / GM));
}

// ECI → Three.js  (Y = North Pole, X = vernal equinox, Z = −Y_eci)
function orbitalPos(r: number, i: number, Ω: number, θ: number): THREE.Vector3 {
  const cosΩ = Math.cos(Ω), sinΩ = Math.sin(Ω);
  const cosi  = Math.cos(i),  sini  = Math.sin(i);
  const cosθ  = Math.cos(θ),  sinθ  = Math.sin(θ);
  const ex = r * (cosΩ * cosθ - sinΩ * sinθ * cosi);
  const ey = r * (sinΩ * cosθ + cosΩ * sinθ * cosi);
  const ez = r * sinθ * sini;
  return new THREE.Vector3(ex, ez, ey); // ECI Z → ThreeJS Y
}

function createEarthTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Ocean gradient
  const bg = ctx.createLinearGradient(0, 0, 0, 512);
  bg.addColorStop(0, '#0a1e40');
  bg.addColorStop(0.5, '#0d2a5e');
  bg.addColorStop(1, '#061428');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 512);

  // Grid lines 30° intervals
  ctx.strokeStyle = 'rgba(0,160,255,0.16)';
  ctx.lineWidth = 0.8;
  for (let lon = -180; lon <= 180; lon += 30) {
    const x = ((lon + 180) / 360) * 1024;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 512); ctx.stroke();
  }
  for (let lat = -90; lat <= 90; lat += 30) {
    const y = ((90 - lat) / 180) * 512;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }

  // Equator highlight
  ctx.strokeStyle = 'rgba(0,210,255,0.40)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(1024, 256); ctx.stroke();

  // Tropics (23.5°)
  ctx.strokeStyle = 'rgba(255,210,60,0.18)';
  ctx.lineWidth = 0.8;
  for (const lat of [23.5, -23.5]) {
    const y = ((90 - lat) / 180) * 512;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
  }

  // Polar ice glow
  const ng = ctx.createLinearGradient(0, 0, 0, 80);
  ng.addColorStop(0, 'rgba(180,220,255,0.30)');
  ng.addColorStop(1, 'rgba(180,220,255,0)');
  ctx.fillStyle = ng; ctx.fillRect(0, 0, 1024, 80);

  const sg = ctx.createLinearGradient(0, 432, 0, 512);
  sg.addColorStop(0, 'rgba(180,220,255,0)');
  sg.addColorStop(1, 'rgba(180,220,255,0.30)');
  ctx.fillStyle = sg; ctx.fillRect(0, 432, 1024, 80);

  return new THREE.CanvasTexture(canvas);
}

function createStarField(): THREE.Points {
  const n = 3500;
  const pos = new Float32Array(n * 3);
  const sizes = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const theta = Math.random() * 2 * Math.PI;
    const phi   = Math.acos(2 * Math.random() - 1);
    const d = 120 + Math.random() * 80;
    pos[k*3]   = d * Math.sin(phi) * Math.cos(theta);
    pos[k*3+1] = d * Math.cos(phi);
    pos[k*3+2] = d * Math.sin(phi) * Math.sin(theta);
    sizes[k] = Math.random() < 0.03 ? 2.5 : Math.random() < 0.15 ? 1.5 : 0.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.25, sizeAttenuation: true });
  return new THREE.Points(geo, mat);
}

// Cached ring sprite texture for selection highlight
let _selTex: THREE.Texture | null = null;
function getSelectionTexture(): THREE.Texture {
  if (_selTex) return _selTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 5;
  ctx.shadowColor = '#88ddff';
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.arc(32, 32, 27, 0, Math.PI * 2); ctx.stroke();
  _selTex = new THREE.CanvasTexture(c);
  return _selTex;
}

type SatRef = {
  mesh:            THREE.Mesh;
  orbitLine:       THREE.Line | null;
  coverageLine:    THREE.Line | null;
  selectionSprite: THREE.Sprite | null;
  ω: number;    // angular velocity rad/s
  r: number;    // orbital radius (scene units)
  i: number;    // inclination rad
  Ω: number;    // RAAN rad
  θ0: number;   // initial true anomaly (fixed offset)
  θ: number;    // current true anomaly (updated each frame)
};

function updateCoverageCircle(
  geo: THREE.BufferGeometry,
  satPos: THREE.Vector3,
  r: number,
) {
  const ρ = Math.acos(1 / r); // coverage half-angle from Earth center
  const nadir = satPos.clone().normalize();

  const up = Math.abs(nadir.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const t = up.clone().addScaledVector(nadir, -up.dot(nadir)).normalize();
  const b = nadir.clone().cross(t).normalize();

  const attr = geo.attributes.position as THREE.BufferAttribute;
  const cosρ = Math.cos(ρ), sinρ = Math.sin(ρ);
  for (let k = 0; k <= 96; k++) {
    const phi = (k / 96) * 2 * Math.PI;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    attr.setXYZ(
      k,
      cosρ * nadir.x + sinρ * (cp * t.x + sp * b.x),
      cosρ * nadir.y + sinρ * (cp * t.y + sp * b.y),
      cosρ * nadir.z + sinρ * (cp * t.z + sp * b.z),
    );
  }
  attr.needsUpdate = true;
}

export default function SatelliteSimulator({ satellites, timeSpeed, showPaths, showCoverage, previewOrbit, selectedIds }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const stateRef  = useRef({
    renderer:    null as THREE.WebGLRenderer | null,
    scene:       null as THREE.Scene | null,
    camera:      null as THREE.PerspectiveCamera | null,
    controls:    null as OrbitControls | null,
    earth:       null as THREE.Mesh | null,
    previewLine: null as THREE.Line | null,
    frame:       0,
    clock:       new THREE.Clock(),
    simTime:     0,
    satRefs:     new Map<string, SatRef>(),
    timeSpeed,
    showPaths,
    showCoverage,
  });

  // Sync reactive props into the ref (no re-render needed)
  useEffect(() => {
    stateRef.current.timeSpeed = timeSpeed;
  }, [timeSpeed]);

  useEffect(() => {
    stateRef.current.showPaths = showPaths;
    stateRef.current.satRefs.forEach(s => { if (s.orbitLine) s.orbitLine.visible = showPaths; });
  }, [showPaths]);

  useEffect(() => {
    stateRef.current.showCoverage = showCoverage;
    stateRef.current.satRefs.forEach(s => { if (s.coverageLine) s.coverageLine.visible = showCoverage; });
  }, [showCoverage]);

  // Scene initialisation (runs once)
  useEffect(() => {
    const mount = mountRef.current!;
    const s = stateRef.current;

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
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 1.4;
    controls.maxDistance = 40;
    s.controls = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0x223366, 1.2));
    const sun = new THREE.DirectionalLight(0xfff0e0, 2.8);
    sun.position.set(12, 6, 8);
    scene.add(sun);

    // Stars
    scene.add(createStarField());

    // Earth
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 64),
      new THREE.MeshPhongMaterial({
        map: createEarthTexture(),
        emissive: new THREE.Color(0x061228),
        emissiveIntensity: 0.5,
        specular: new THREE.Color(0x1a4488),
        shininess: 50,
      }),
    );
    scene.add(earth);
    s.earth = earth;

    // Atmosphere inner
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.022, 48, 48),
      new THREE.MeshPhongMaterial({ color: 0x3366ff, transparent: true, opacity: 0.06, side: THREE.FrontSide }),
    ));
    // Atmosphere outer rim
    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(1.065, 48, 48),
      new THREE.MeshPhongMaterial({ color: 0x2244cc, transparent: true, opacity: 0.035, side: THREE.BackSide }),
    ));

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    // ResizeObserver catches container changes (panel open/close, isMobile transitions)
    // in addition to window resize events
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    const animate = () => {
      s.frame = requestAnimationFrame(animate);
      const delta = s.clock.getDelta();
      s.simTime += delta * s.timeSpeed;

      controls.update();
      earth.rotation.y = EARTH_SPIN * s.simTime;

      s.satRefs.forEach(sat => {
        sat.θ = sat.ω * s.simTime + sat.θ0;
        const pos = orbitalPos(sat.r, sat.i, sat.Ω, sat.θ);
        sat.mesh.position.copy(pos);
        if (sat.coverageLine && s.showCoverage) {
          updateCoverageCircle(sat.coverageLine.geometry, pos, sat.r);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(s.frame);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Preview orbit (live update while user adjusts form sliders)
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

  // Selection highlight
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

  // Satellite reconciliation
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

      const r   = sceneRadius(data.altitude);
      const ω   = angularVelocity(data.altitude);
      const i   = THREE.MathUtils.degToRad(data.inclination);
      const Ω   = THREE.MathUtils.degToRad(data.raan);
      const col = new THREE.Color(data.color);

      // Satellite sphere + glow
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.022, 8, 8),
        new THREE.MeshBasicMaterial({ color: col }),
      );
      const glow = new THREE.PointLight(col, 1.2, 0.8);
      mesh.add(glow);
      scene.add(mesh);

      // Orbit path (static geometry for this inclination/raan)
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

      // Coverage circle (dynamic, updated every frame)
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
      s.satRefs.set(data.id, { mesh, orbitLine, coverageLine, selectionSprite: null, ω, r, i, Ω, θ0, θ: θ0 });
    });
  }, [satellites]);

  return <div ref={mountRef} style={{ width: '100%', height: '100%' }} />;
}
