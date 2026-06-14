'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface Props {
  timeSpeed: number;
}

// Visual distances (log-compressed, not to scale)
const PLANETS = [
  { name: 'Mercury', period: 88,     distance: 9,  radius: 0.22, axialTilt: 0.03  },
  { name: 'Venus',   period: 225,    distance: 13, radius: 0.52, axialTilt: 177   },
  { name: 'Earth',   period: 365.25, distance: 18, radius: 0.55, axialTilt: 23.4  },
  { name: 'Mars',    period: 687,    distance: 25, radius: 0.32, axialTilt: 25.2  },
  { name: 'Jupiter', period: 4333,   distance: 44, radius: 1.7,  axialTilt: 3.1   },
  { name: 'Saturn',  period: 10759,  distance: 60, radius: 1.4,  axialTilt: 26.7, rings: true },
  { name: 'Uranus',  period: 30687,  distance: 76, radius: 0.9,  axialTilt: 97.8, rings: true, uranus: true },
  { name: 'Neptune', period: 60190,  distance: 92, radius: 0.85, axialTilt: 28.3  },
] as const;

const DAY_S = 86400;

// ── Procedural textures ────────────────────────────────────────────────────────

function mkCanvas(w = 512, h = 256) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d')! };
}

function sunTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0,   '#ffffff');
  g.addColorStop(0.2, '#fffde0');
  g.addColorStop(0.5, '#ffe066');
  g.addColorStop(0.8, '#ff9900');
  g.addColorStop(1,   '#cc4400');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  // granules
  for (let i = 0; i < 120; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, r = Math.random() * 6 + 2;
    const bright = ctx.createRadialGradient(x, y, 0, x, y, r);
    bright.addColorStop(0, 'rgba(255,255,220,0.18)');
    bright.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = bright; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function mercuryTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  ctx.fillStyle = '#8c8c8c'; ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 80; i++) {
    const x = Math.random() * 512, y = Math.random() * 256, r = Math.random() * 10 + 2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.35})`; ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1, y - 1, r * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(180,180,180,${Math.random() * 0.25})`; ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function venusTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0,   '#d4a050'); g.addColorStop(0.3, '#e8c070');
  g.addColorStop(0.5, '#f0d090'); g.addColorStop(0.7, '#e8c070');
  g.addColorStop(1,   '#c89040');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  // cloud streaks
  for (let i = 0; i < 18; i++) {
    const y = Math.random() * 256;
    const g2 = ctx.createLinearGradient(0, y - 8, 0, y + 8);
    g2.addColorStop(0, 'rgba(255,240,180,0)');
    g2.addColorStop(0.5, `rgba(255,240,180,${Math.random() * 0.25 + 0.05})`);
    g2.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g2; ctx.fillRect(0, y - 8, 512, 16);
  }
  return new THREE.CanvasTexture(c);
}

function earthTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  ctx.fillStyle = '#1a55aa'; ctx.fillRect(0, 0, 512, 256);
  // continents (simplified blobs)
  const land: [number, number, number, number][] = [
    [130, 80, 60, 45], [140, 140, 40, 55], [200, 100, 35, 30],
    [230, 90, 50, 40],  [310, 110, 55, 35], [330, 160, 40, 30],
    [400, 100, 45, 40], [60, 90, 35, 25],   [80, 130, 30, 20],
  ];
  for (const [x, y, rx, ry] of land) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, Math.random(), 0, Math.PI * 2);
    ctx.fillStyle = `hsl(${115 + Math.random() * 20},${40 + Math.random() * 20}%,${28 + Math.random() * 10}%)`; ctx.fill();
  }
  // polar caps
  ctx.fillStyle = 'rgba(240,248,255,0.85)'; ctx.fillRect(0, 0, 512, 22);
  ctx.fillRect(0, 234, 512, 22);
  // cloud wisps
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * 512, y = Math.random() * 256;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 30 + Math.random() * 40);
    g.addColorStop(0, `rgba(255,255,255,${Math.random() * 0.4 + 0.1})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 70, y - 40, 140, 80);
  }
  return new THREE.CanvasTexture(c);
}

function marsTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  ctx.fillStyle = '#c1440e'; ctx.fillRect(0, 0, 512, 256);
  // terrain variation
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * 512, y = Math.random() * 256;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 40 + Math.random() * 60);
    g.addColorStop(0, `rgba(${Math.random() > 0.5 ? '90,25,5' : '180,80,40'},${Math.random() * 0.3})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 100, y - 100, 200, 200);
  }
  // polar ice
  ctx.fillStyle = 'rgba(240,240,255,0.8)'; ctx.fillRect(0, 0, 512, 16);
  ctx.fillRect(0, 240, 512, 16);
  return new THREE.CanvasTexture(c);
}

function jupiterTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  const bands = [
    '#c4864a','#e8cc88','#a06028','#dba858','#8c5420',
    '#d4a060','#c08040','#e8c870','#a87038','#d4a060',
    '#c4864a','#e8cc88','#a86030','#e0b868','#c4864a',
  ];
  const bh = 256 / bands.length;
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * bh, 512, bh + 1); });
  // Great Red Spot
  ctx.save(); ctx.translate(350, 148);
  const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, 28);
  rg.addColorStop(0, '#c83010'); rg.addColorStop(0.6, '#a02808'); rg.addColorStop(1, 'rgba(160,60,20,0)');
  ctx.fillStyle = rg;
  ctx.scale(1.8, 1); ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  return new THREE.CanvasTexture(c);
}

function saturnTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  const bands = ['#e8d890','#d4c070','#e0cc80','#c8b060','#dcc878','#d0bc70','#e4d090'];
  const bh = 256 / bands.length;
  bands.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(0, i * bh, 512, bh + 1); });
  return new THREE.CanvasTexture(c);
}

function uranusTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  const g = ctx.createRadialGradient(256, 128, 10, 256, 128, 180);
  g.addColorStop(0, '#aaf0f0'); g.addColorStop(0.5, '#50d0d8'); g.addColorStop(1, '#208898');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  return new THREE.CanvasTexture(c);
}

function neptuneTexture(): THREE.CanvasTexture {
  const { c, ctx } = mkCanvas();
  const g = ctx.createRadialGradient(256, 128, 10, 256, 128, 180);
  g.addColorStop(0, '#4466ff'); g.addColorStop(0.4, '#2244cc'); g.addColorStop(1, '#0a1566');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 256);
  // storm
  const sg = ctx.createRadialGradient(200, 100, 0, 200, 100, 30);
  sg.addColorStop(0, 'rgba(20,20,160,0.7)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.fillRect(160, 60, 100, 80);
  return new THREE.CanvasTexture(c);
}

const PLANET_TEXTURES: Record<string, () => THREE.CanvasTexture> = {
  Mercury: mercuryTexture, Venus: venusTexture, Earth: earthTexture,
  Mars: marsTexture, Jupiter: jupiterTexture, Saturn: saturnTexture,
  Uranus: uranusTexture, Neptune: neptuneTexture,
};

interface PlanetRef {
  mesh: THREE.Mesh;
  pivot: THREE.Object3D;
  angle: number;
  distance: number;
  periodDays: number;
  labelEl: HTMLDivElement;
  radius: number;
}

export default function SolarSystemSimulator({ timeSpeed }: Props) {
  const mountRef  = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const speedRef  = useRef(timeSpeed);

  useEffect(() => { speedRef.current = timeSpeed; }, [timeSpeed]);

  useEffect(() => {
    const el = mountRef.current;
    const labelsEl = labelsRef.current;
    if (!el || !labelsEl) return;

    const W = el.clientWidth, H = el.clientHeight;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000510);
    el.appendChild(renderer.domElement);

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 2000);
    camera.position.set(0, 70, 130);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.05;
    controls.minDistance = 5; controls.maxDistance = 600;

    // Stars
    const starPos = new Float32Array(3000 * 3);
    for (let i = 0; i < starPos.length; i++) starPos[i] = (Math.random() - 0.5) * 1800;
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35 })));

    // ── Sun ─────────────────────────────────────────────────────────────────────
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3, 48, 48),
      new THREE.MeshBasicMaterial({ map: sunTexture() }),
    );
    scene.add(sunMesh);

    // Glow layers (additive blending)
    for (const [r, color, opacity] of [
      [3.8,  0xffcc44, 0.35],
      [5.0,  0xff8800, 0.18],
      [7.0,  0xff4400, 0.09],
      [10.0, 0xff2200, 0.04],
    ] as [number, number, number][]) {
      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(r, 32, 32),
        new THREE.MeshBasicMaterial({
          color, transparent: true, opacity,
          side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false,
        }),
      ));
    }

    scene.add(new THREE.PointLight(0xfff4d0, 4, 500, 0.5));
    scene.add(new THREE.AmbientLight(0x112244, 0.5));

    // ── Planets ─────────────────────────────────────────────────────────────────
    const _proj = new THREE.Vector3();
    const planetRefs: PlanetRef[] = [];

    for (const p of PLANETS) {
      // Orbit path ring
      const orbitMesh = new THREE.Mesh(
        new THREE.RingGeometry(p.distance - 0.04, p.distance + 0.04, 128),
        new THREE.MeshBasicMaterial({ color: 0x1a3060, side: THREE.DoubleSide, transparent: true, opacity: 0.4 }),
      );
      orbitMesh.rotation.x = Math.PI / 2;
      scene.add(orbitMesh);

      // Pivot for orbital motion (child: planet mesh)
      const pivot = new THREE.Object3D();
      pivot.rotation.y = Math.random() * Math.PI * 2;
      scene.add(pivot);

      // Planet
      const tex = PLANET_TEXTURES[p.name]?.();
      const mat = tex
        ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.0 })
        : new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.85 });

      const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.radius, 48, 48), mat);
      mesh.position.x = p.distance;
      mesh.rotation.z = (p.axialTilt * Math.PI) / 180;
      pivot.add(mesh);

      // Saturn rings
      if ('rings' in p && p.rings) {
        const ringMat = new THREE.MeshBasicMaterial({
          color: 'uranus' in p && p.uranus ? 0x88dddd : 0xc8a96e,
          side: THREE.DoubleSide, transparent: true, opacity: 'uranus' in p && p.uranus ? 0.4 : 0.72,
        });
        const inner = p.radius * 1.55, outer = p.radius * 2.6;
        const ringMesh = new THREE.Mesh(new THREE.RingGeometry(inner, outer, 80), ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        mesh.add(ringMesh);
      }

      // Label
      const label = document.createElement('div');
      label.textContent = p.name.toUpperCase();
      label.style.cssText = [
        'position:absolute',
        'pointer-events:none',
        'font-size:8px',
        'font-family:"Courier New",monospace',
        'color:#4a6888',
        'letter-spacing:1.5px',
        'white-space:nowrap',
        'transform:translateX(-50%)',
      ].join(';');
      labelsEl.appendChild(label);

      planetRefs.push({
        mesh, pivot, angle: pivot.rotation.y,
        distance: p.distance, periodDays: p.period,
        labelEl: label, radius: p.radius,
      });
    }

    // ── Animate ──────────────────────────────────────────────────────────────────
    let animId = 0;
    let lastT  = performance.now();
    let simDays = 0;

    function animate() {
      animId = requestAnimationFrame(animate);
      controls.update();

      const now = performance.now();
      const dt  = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;
      simDays += (speedRef.current * dt) / DAY_S;

      sunMesh.rotation.y += 0.002;

      for (const ref of planetRefs) {
        ref.angle = (2 * Math.PI * simDays) / ref.periodDays;
        ref.pivot.rotation.y = ref.angle;
        ref.mesh.rotation.y  += 0.007;

        // World position of planet for label projection
        ref.mesh.getWorldPosition(_proj);
        _proj.project(camera);
        const lx = (_proj.x * 0.5 + 0.5) * (el?.clientWidth  ?? 0);
        const ly = (1 - (_proj.y * 0.5 + 0.5)) * (el?.clientHeight ?? 0);
        if (_proj.z < 1) {
          ref.labelEl.style.left    = `${lx}px`;
          ref.labelEl.style.top     = `${ly + ref.radius * 16 + 6}px`;
          ref.labelEl.style.display = 'block';
        } else {
          ref.labelEl.style.display = 'none';
        }
      }

      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const W = el.clientWidth, H = el.clientHeight;
      camera.aspect = W / H; camera.updateProjectionMatrix();
      renderer.setSize(W, H);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(animId);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      labelsEl.innerHTML = '';
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />
      <div ref={labelsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </div>
  );
}
