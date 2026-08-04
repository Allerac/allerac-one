'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as memoryActions from '@/app/actions/memory';
import { useDomainContext } from '@/app/context/DomainContext';

interface Memory {
  id: string;
  conversation_id: string | null;
  summary: string;
  key_topics: string[];
  importance_score: number;
  domain_slug?: string | null;
  emotion?: string | null;
  created_at: string;
}

const PALETTE = ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6', '#ef4444', '#14b8a6'];

function hash(value: string) {
  let result = 0;
  for (let i = 0; i < value.length; i++) result = ((result << 5) - result + value.charCodeAt(i)) | 0;
  return Math.abs(result);
}

function domainColor(domain: string) {
  return PALETTE[hash(domain) % PALETTE.length];
}

function positions(memories: Memory[]) {
  const domains = [...new Set(memories.map(memory => memory.domain_slug || 'general'))];
  const domainCenters = new Map<string, readonly [number, number, number]>(domains.map((domain, index) => {
    const angle = (index / Math.max(domains.length, 1)) * Math.PI * 2;
    const radius = domains.length === 1 ? 0 : 11;
    return [domain, [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55, Math.sin(angle * 1.7) * 4] as const] as const;
  }));

  return new Map<string, readonly [number, number, number]>(memories.map((memory, index) => {
    const center = domainCenters.get(memory.domain_slug || 'general')!;
    const seed = hash(memory.id);
    const angle = seed * 0.017 + index * 2.399;
    const spread = 2.3 + (seed % 40) / 10;
    return [memory.id, [
        center[0] + Math.cos(angle) * spread,
        center[1] + Math.sin(angle) * spread,
        center[2] + Math.sin(angle * 1.31) * spread * 0.7,
      ] as const] as const;
  }));
}

function sharedTopics(left: Memory, right: Memory) {
  const rightTopics = new Set(right.key_topics || []);
  return (left.key_topics || []).filter(topic => rightTopics.has(topic));
}

interface GraphProps {
  memories: Memory[];
  selectedId: string | null;
  onSelect: (memory: Memory | null) => void;
  isDark: boolean;
}

function MemoryGraph({ memories, selectedId, onSelect, isDark }: GraphProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(isDark ? 0x080b12 : 0xf8fafc, 0.018);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
    camera.position.set(0, 2, 31);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(isDark ? 0x080b12 : 0xf8fafc, 1);
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 7;
    controls.maxDistance = 70;

    const group = new THREE.Group();
    scene.add(group);
    const nodePositions = positions(memories);
    const meshes: THREE.Mesh[] = [];

    memories.forEach(memory => {
      const radius = 0.28 + Math.max(1, memory.importance_score) * 0.055;
      const geometry = new THREE.SphereGeometry(radius, 24, 24);
      const color = domainColor(memory.domain_slug || 'general');
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: memory.id === selectedId ? 1 : 0.86,
      });
      const mesh = new THREE.Mesh(geometry, material);
      const position = nodePositions.get(memory.id)!;
      mesh.position.set(...position);
      mesh.userData.memory = memory;
      if (memory.id === selectedId) {
        mesh.scale.setScalar(1.45);
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(radius * 1.75, 20, 20),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.BackSide }),
        );
        mesh.add(halo);
      }
      meshes.push(mesh);
      group.add(mesh);
    });

    const linePositions: number[] = [];
    const lineColors: number[] = [];
    for (let i = 0; i < memories.length; i++) {
      const candidates: { index: number; weight: number }[] = [];
      for (let j = i + 1; j < memories.length; j++) {
        const topics = sharedTopics(memories[i], memories[j]);
        const sameDomain = memories[i].domain_slug === memories[j].domain_slug;
        const weight = topics.length * 3 + (sameDomain ? 1 : 0);
        if (weight > 0) candidates.push({ index: j, weight });
      }
      candidates.sort((a, b) => b.weight - a.weight).slice(0, 5).forEach(({ index, weight }) => {
        const start = nodePositions.get(memories[i].id)!;
        const end = nodePositions.get(memories[index].id)!;
        linePositions.push(...start, ...end);
        const color = new THREE.Color(domainColor(memories[i].domain_slug || 'general'));
        const strength = Math.min(0.9, 0.35 + weight * 0.08);
        lineColors.push(color.r * strength, color.g * strength, color.b * strength);
        lineColors.push(color.r * strength, color.g * strength, color.b * strength);
      });
    }
    if (linePositions.length) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
      geometry.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
      group.add(new THREE.LineSegments(
        geometry,
        new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: isDark ? 0.34 : 0.24 }),
      ));
    }

    const starsGeometry = new THREE.BufferGeometry();
    const stars: number[] = [];
    for (let i = 0; i < 450; i++) {
      stars.push((Math.random() - 0.5) * 90, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60);
    }
    starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(stars, 3));
    scene.add(new THREE.Points(
      starsGeometry,
      new THREE.PointsMaterial({ color: isDark ? 0x64748b : 0x94a3b8, size: 0.035, transparent: true, opacity: 0.55 }),
    ));

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const click = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      onSelect(hit ? hit.object.userData.memory : null);
    };
    renderer.domElement.addEventListener('pointerup', click);

    let frame = 0;
    let animationId = 0;
    const animate = () => {
      frame += 0.006;
      group.rotation.y = Math.sin(frame * 0.25) * 0.035;
      controls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerup', click);
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments || object instanceof THREE.Points) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [memories, selectedId, onSelect, isDark]);

  return <div ref={mountRef} className="absolute inset-0" />;
}

export default function MemoryGraphPanel() {
  const { isDark, lastToolCall } = useDomainContext();
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [selected, setSelected] = useState<Memory | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMemories(await memoryActions.getRecentSummaries(200, 1));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (lastToolCall && ['create_memory', 'delete_memory'].includes(lastToolCall.name)) {
      const timer = window.setTimeout(load, 500);
      return () => window.clearTimeout(timer);
    }
  }, [lastToolCall, load]);

  const domains = useMemo(
    () => [...new Set(memories.map(memory => memory.domain_slug || 'general'))].sort(),
    [memories],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return memories.filter(memory => {
      const memoryDomain = memory.domain_slug || 'general';
      return (domain === 'all' || memoryDomain === domain)
        && (!needle || memory.summary.toLowerCase().includes(needle)
          || memory.key_topics?.some(topic => topic.toLowerCase().includes(needle)));
    });
  }, [memories, domain, query]);

  const select = useCallback((memory: Memory | null) => setSelected(memory), []);
  const deleteSelected = async () => {
    if (!selected || !window.confirm('Delete this memory permanently?')) return;
    await memoryActions.deleteSummary(selected.id);
    setSelected(null);
    await load();
  };

  return (
    <section className={`relative flex-1 overflow-hidden ${isDark ? 'bg-[#080b12]' : 'bg-slate-50'}`}>
      <div className={`absolute z-10 top-0 inset-x-0 h-16 flex items-center gap-3 px-5 border-b backdrop-blur-xl ${
        isDark ? 'border-white/10 bg-[#080b12]/75' : 'border-slate-200 bg-white/75'
      }`}>
        <div className="min-w-0">
          <h1 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Knowledge</h1>
          <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Your personal knowledge graph · {filtered.length} memories connected
          </p>
        </div>
        <div className="flex-1" />
        <input
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search your knowledge…"
          className={`w-40 xl:w-56 rounded-lg border px-3 py-1.5 text-xs outline-none ${
            isDark ? 'border-white/10 bg-white/5 text-slate-200 placeholder:text-slate-600 focus:border-violet-500/60'
              : 'border-slate-200 bg-white/80 text-slate-700 placeholder:text-slate-400 focus:border-violet-400'
          }`}
        />
        <select
          value={domain}
          onChange={event => setDomain(event.target.value)}
          className={`rounded-lg border px-2 py-1.5 text-xs outline-none ${
            isDark ? 'border-white/10 bg-[#111827] text-slate-300' : 'border-slate-200 bg-white text-slate-600'
          }`}
        >
          <option value="all">All domains</option>
          {domains.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <button
          onClick={load}
          className={`rounded-lg border px-3 py-1.5 text-xs ${
            isDark ? 'border-white/10 text-slate-400 hover:bg-white/5' : 'border-slate-200 text-slate-500 hover:bg-white'
          }`}
        >
          Refresh
        </button>
      </div>

      <div className="absolute inset-0 top-16">
        {loading ? (
          <div className={`h-full flex items-center justify-center text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Building your knowledge graph…
          </div>
        ) : filtered.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-8">
            <div className="h-16 w-16 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-2xl mb-4">✦</div>
            <h2 className={`font-medium ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Your knowledge graph is ready</h2>
            <p className={`text-sm mt-1 max-w-sm ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
              Ask Allerac to remember durable context and its first knowledge node will appear here.
            </p>
          </div>
        ) : (
          <MemoryGraph memories={filtered} selectedId={selected?.id || null} onSelect={select} isDark={isDark} />
        )}
      </div>

      <div className={`absolute z-10 bottom-4 left-4 flex flex-wrap gap-2 max-w-[70%]`}>
        {domains.map(item => (
          <button
            key={item}
            onClick={() => setDomain(domain === item ? 'all' : item)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] backdrop-blur-md ${
              domain === item
                ? isDark ? 'border-white/25 bg-white/10 text-white' : 'border-slate-300 bg-white text-slate-800'
                : isDark ? 'border-white/10 bg-black/20 text-slate-400' : 'border-slate-200 bg-white/70 text-slate-500'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: domainColor(item) }} />
            {item}
          </button>
        ))}
      </div>

      {selected && (
        <aside className={`absolute z-20 top-20 right-4 w-[min(320px,calc(100%-2rem))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${
          isDark ? 'border-white/10 bg-[#111827]/90 text-slate-200' : 'border-slate-200 bg-white/90 text-slate-700'
        }`}>
          <div className="flex items-start gap-3">
            <span
              className="mt-1 h-3 w-3 flex-shrink-0 rounded-full shadow-[0_0_14px_currentColor]"
              style={{ color: domainColor(selected.domain_slug || 'general'), backgroundColor: 'currentColor' }}
            />
            <div className="min-w-0 flex-1">
              <div className={`text-[10px] uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {selected.domain_slug || 'general'} · importance {selected.importance_score}/10
              </div>
              <p className="mt-2 text-sm leading-relaxed">{selected.summary}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {selected.key_topics?.map(topic => (
                  <span key={topic} className={`rounded-md px-2 py-1 text-[10px] ${
                    isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-100 text-slate-500'
                  }`}>{topic}</span>
                ))}
              </div>
              <div className={`mt-4 flex items-center justify-between text-[10px] ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                <span>{new Date(selected.created_at).toLocaleDateString()}</span>
                <button onClick={deleteSelected} className="text-red-400 hover:text-red-300">Delete memory</button>
              </div>
            </div>
            <button onClick={() => setSelected(null)} className={isDark ? 'text-slate-600 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'}>×</button>
          </div>
        </aside>
      )}
    </section>
  );
}
