'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as documentActions from '@/app/actions/documents';
import * as knowledgeActions from '@/app/actions/knowledge';
import * as memoryActions from '@/app/actions/memory';
import { useDomainContext } from '@/app/context/DomainContext';
import {
  KnowledgeEdge,
  KnowledgeGraph as KnowledgeGraphData,
  KnowledgeNode,
  KnowledgeNodeType,
} from '@/app/services/knowledge/knowledge-graph.types';

const EMPTY_GRAPH: KnowledgeGraphData = { nodes: [], edges: [] };
const PALETTE = ['#8b5cf6', '#06b6d4', '#22c55e', '#f59e0b', '#ec4899', '#3b82f6', '#ef4444', '#14b8a6'];

function hash(value: string) {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
}

function domainColor(domain: string) {
  return PALETTE[hash(domain) % PALETTE.length];
}

function positions(nodes: KnowledgeNode[]) {
  const domains = [...new Set(nodes.map(node => node.domainSlug || 'general'))];
  const centers = new Map<string, readonly [number, number, number]>(domains.map((domain, index) => {
    const angle = (index / Math.max(domains.length, 1)) * Math.PI * 2;
    const radius = domains.length === 1 ? 0 : 11;
    return [domain, [Math.cos(angle) * radius, Math.sin(angle) * radius * 0.55, Math.sin(angle * 1.7) * 4] as const];
  }));
  return new Map(nodes.map((node, index) => {
    const center = centers.get(node.domainSlug || 'general')!;
    const seed = hash(node.id);
    const angle = seed * 0.017 + index * 2.399;
    const spread = 2.3 + (seed % 40) / 10;
    return [node.id, [
      center[0] + Math.cos(angle) * spread,
      center[1] + Math.sin(angle) * spread,
      center[2] + Math.sin(angle * 1.31) * spread * 0.7,
    ] as const] as const;
  }));
}

function GraphCanvas({
  nodes, edges, selectedId, hoveredId, onSelect, isDark,
}: {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (node: KnowledgeNode | null) => void;
  isDark: boolean;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraStateRef = useRef<{
    position: [number, number, number];
    target: [number, number, number];
  } | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
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
    controls.minDistance = 7;
    controls.maxDistance = 70;
    const group = new THREE.Group();
    scene.add(group);
    const nodePositions = positions(nodes);
    const selectedPosition = selectedId ? nodePositions.get(selectedId) : null;
    const selectionChanged = lastSelectedIdRef.current !== selectedId;
    lastSelectedIdRef.current = selectedId;
    if (!selectionChanged && cameraStateRef.current) {
      camera.position.set(...cameraStateRef.current.position);
      controls.target.set(...cameraStateRef.current.target);
      controls.update();
    } else if (selectedPosition) {
      controls.target.set(...selectedPosition);
      camera.position.set(
        selectedPosition[0],
        selectedPosition[1] + 1.5,
        selectedPosition[2] + 18,
      );
      controls.update();
    }
    const meshes: THREE.Mesh[] = [];
    const connectedIds = new Set<string>();
    if (selectedId) {
      connectedIds.add(selectedId);
      edges.forEach(edge => {
        if (edge.sourceNodeId === selectedId) connectedIds.add(edge.targetNodeId);
        if (edge.targetNodeId === selectedId) connectedIds.add(edge.sourceNodeId);
      });
    }

    nodes.forEach(node => {
      const size = 0.16 + Math.max(1, node.importance) * 0.024;
      const geometry = node.type === 'document'
        ? new THREE.BoxGeometry(size * 1.45, size * 1.45, size * 1.45)
        : new THREE.SphereGeometry(size, 32, 32);
      const isHovered = node.id === hoveredId;
      const color = isHovered ? '#facc15' : domainColor(node.domainSlug || 'general');
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: isHovered ? 0.98
          : (!selectedId || connectedIds.has(node.id) ? (node.id === selectedId ? 0.95 : 0.72) : 0.08),
      }));
      if (node.type === 'memory') {
        const halo = new THREE.Mesh(
          new THREE.SphereGeometry(size * 1.28, 32, 32),
          new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity: isHovered ? 0.2 : node.id === selectedId ? 0.16 : 0.07,
            side: THREE.BackSide,
            depthWrite: false,
          }),
        );
        mesh.add(halo);
      } else {
        const outline = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({
            color: isHovered ? 0xfacc15 : 0xffffff,
            transparent: true,
            opacity: isHovered ? 0.9 : node.id === selectedId ? 0.65 : 0.3,
          }),
        );
        outline.scale.setScalar(1.035);
        mesh.add(outline);
      }
      mesh.position.set(...nodePositions.get(node.id)!);
      mesh.userData.node = node;
      if (node.id === selectedId) mesh.scale.setScalar(1.32);
      else if (isHovered) mesh.scale.setScalar(1.4);
      else if (selectedId && connectedIds.has(node.id)) mesh.scale.setScalar(1.08);
      meshes.push(mesh);
      group.add(mesh);
    });

    edges.forEach(edge => {
      const start = nodePositions.get(edge.sourceNodeId);
      const end = nodePositions.get(edge.targetNodeId);
      if (!start || !end) return;
      const isConnected = selectedId === edge.sourceNodeId || selectedId === edge.targetNodeId;
      const isHoveredConnection = Boolean(
        hoveredId
        && isConnected
        && (hoveredId === edge.sourceNodeId || hoveredId === edge.targetNodeId),
      );
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...start, ...end], 3));
      group.add(new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
        color: isHoveredConnection ? 0xfacc15
          : (isConnected ? 0x22d3ee : (isDark ? 0x64748b : 0x94a3b8)),
        transparent: true,
        opacity: isHoveredConnection ? 1 : (selectedId ? (isConnected ? 0.95 : 0.04) : 0.3),
      })));
    });

    const resize = () => {
      camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerStart: { x: number; y: number } | null = null;
    const pointerDown = (event: PointerEvent) => {
      pointerStart = { x: event.clientX, y: event.clientY };
    };
    const click = (event: PointerEvent) => {
      const start = pointerStart;
      pointerStart = null;
      if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) {
        return;
      }
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(meshes, false)[0];
      onSelect(hit ? hit.object.userData.node : null);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', click);
    let animationId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationId = requestAnimationFrame(animate);
    };
    animate();
    return () => {
      cameraStateRef.current = {
        position: camera.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
      };
      cancelAnimationFrame(animationId);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', click);
      controls.dispose();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach(material => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [nodes, edges, selectedId, hoveredId, onSelect, isDark]);
  return <div ref={mountRef} className="absolute inset-0" />;
}

type TypeFilter = 'all' | KnowledgeNodeType | 'crawler';

export default function MemoryGraphPanel() {
  const { isDark, lastToolCall } = useDomainContext();
  const [graph, setGraph] = useState<KnowledgeGraphData>(EMPTY_GRAPH);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('all');
  const [type, setType] = useState<TypeFilter>('all');
  const [selected, setSelected] = useState<KnowledgeNode | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setGraph(await knowledgeActions.getKnowledgeGraph(200));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (lastToolCall && ['create_memory', 'delete_memory'].includes(lastToolCall.name)) {
      const timer = window.setTimeout(load, 500);
      return () => window.clearTimeout(timer);
    }
  }, [lastToolCall, load]);

  const domains = useMemo(
    () => [...new Set(graph.nodes.map(node => node.domainSlug || 'general'))].sort(),
    [graph.nodes],
  );
  const nodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return graph.nodes.filter(node => (
      (domain === 'all' || (node.domainSlug || 'general') === domain)
      && (type === 'all' || node.type === type || (type === 'crawler' && node.sourceType === 'crawler'))
      && (!needle || node.label.toLowerCase().includes(needle)
        || node.summary?.toLowerCase().includes(needle)
        || node.topics.some(topic => topic.toLowerCase().includes(needle)))
    ));
  }, [graph.nodes, domain, type, query]);
  const visibleIds = useMemo(() => new Set(nodes.map(node => node.id)), [nodes]);
  const edges = useMemo(
    () => graph.edges.filter(edge => visibleIds.has(edge.sourceNodeId) && visibleIds.has(edge.targetNodeId)),
    [graph.edges, visibleIds],
  );
  const selectedConnections = useMemo(() => {
    if (!selected) return [];
    return edges
      .filter(edge => edge.sourceNodeId === selected.id || edge.targetNodeId === selected.id)
      .map(edge => ({
        edge,
        node: nodes.find(node => node.id === (
          edge.sourceNodeId === selected.id ? edge.targetNodeId : edge.sourceNodeId
        )),
      }))
      .filter(connection => connection.node);
  }, [selected, edges, nodes]);
  const select = useCallback((node: KnowledgeNode | null) => setSelected(node), []);
  const deleteSelected = async () => {
    if (!selected || !window.confirm(`Delete this ${selected.type} permanently?`)) return;
    if (selected.type === 'document') await documentActions.deleteDocument(selected.sourceId);
    else await memoryActions.deleteSummary(selected.sourceId);
    setSelected(null);
    await load();
  };

  return (
    <section className={`relative flex-1 overflow-hidden ${isDark ? 'bg-[#080b12]' : 'bg-slate-50'}`}>
      <div className={`absolute z-10 top-0 inset-x-0 min-h-16 flex flex-wrap items-center gap-3 px-5 py-2 border-b backdrop-blur-xl ${
        isDark ? 'border-white/10 bg-[#080b12]/75' : 'border-slate-200 bg-white/75'
      }`}>
        <div>
          <h1 className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-slate-900'}`}>Knowledge</h1>
          <p className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {nodes.length} nodes · {edges.length} explained connections
          </p>
        </div>
        <div className="flex-1" />
        <input value={query} onChange={event => setQuery(event.target.value)}
          placeholder="Search your knowledge…"
          className={`w-40 xl:w-56 rounded-lg border px-3 py-1.5 text-xs outline-none ${
            isDark ? 'border-white/10 bg-white/5 text-slate-200' : 'border-slate-200 bg-white text-slate-700'
          }`} />
        <select value={type} onChange={event => setType(event.target.value as TypeFilter)}
          className={`rounded-lg border px-2 py-1.5 text-xs ${isDark ? 'border-white/10 bg-[#111827]' : 'border-slate-200 bg-white'}`}>
          <option value="all">All types</option>
          <option value="memory">Memories</option>
          <option value="document">Documents</option>
          <option value="crawler">Crawler documents</option>
        </select>
        <select value={domain} onChange={event => setDomain(event.target.value)}
          className={`rounded-lg border px-2 py-1.5 text-xs ${isDark ? 'border-white/10 bg-[#111827]' : 'border-slate-200 bg-white'}`}>
          <option value="all">All domains</option>
          {domains.map(item => <option key={item} value={item}>{item}</option>)}
        </select>
        <a href="/memory/crawlers"
          className="rounded-lg border border-cyan-500/30 px-3 py-1.5 text-xs text-cyan-500 hover:bg-cyan-500/10">
          Crawlers
        </a>
        <button onClick={load} className="rounded-lg border border-slate-500/20 px-3 py-1.5 text-xs">Refresh</button>
      </div>
      <div className="absolute inset-0 top-16">
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">Building your knowledge graph…</div>
        ) : nodes.length ? (
          <GraphCanvas
            nodes={nodes}
            edges={edges}
            selectedId={selected?.id ?? null}
            hoveredId={hoveredConnectionId}
            onSelect={select}
            isDark={isDark}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-slate-500">No knowledge matches these filters.</div>
        )}
      </div>
      <div className="absolute z-10 bottom-4 left-4 flex gap-3 text-[10px] text-slate-500">
        <span>● Conversation memory — remembered from a chat</span>
        <span>■ Document — uploaded or collected by the crawler</span>
      </div>
      {selected && (
        <aside className={`absolute z-20 top-20 right-4 w-[min(350px,calc(100%-2rem))] rounded-2xl border p-4 shadow-2xl backdrop-blur-xl ${
          isDark ? 'border-white/10 bg-[#111827]/90 text-slate-200' : 'border-slate-200 bg-white/90 text-slate-700'
        }`}>
          <button onClick={() => setSelected(null)} className="float-right text-slate-400">×</button>
          <div className="text-[10px] uppercase tracking-widest text-slate-500">
            {selected.sourceType === 'conversation' ? 'Conversation memory'
              : selected.sourceType === 'crawler' ? 'Crawler document'
                : selected.sourceType === 'upload' ? 'Uploaded document' : 'Manual memory'}
            {' · '}{selected.domainSlug || 'general'}
          </div>
          <h2 className="mt-2 text-sm font-semibold">{selected.label}</h2>
          {selected.summary && <p className="mt-2 text-xs leading-relaxed text-slate-400">{selected.summary}</p>}
          {selected.type === 'document' && (
            <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              <div><dt className="text-slate-500">Chunks</dt><dd>{selected.chunkCount}</dd></div>
              <div><dt className="text-slate-500">Embeddings</dt><dd>{selected.hasEmbeddings ? 'Ready' : 'Unavailable'}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd>{selected.status}</dd></div>
            </dl>
          )}
          {selected.canonicalUrl && (
            <a href={selected.canonicalUrl} target="_blank" rel="noreferrer"
              className="mt-3 block text-xs text-cyan-500 hover:underline">Open original source ↗</a>
          )}
          {selected.type === 'document' && (
            <a href={`/memory/documents?document=${encodeURIComponent(selected.sourceId)}`}
              className="mt-2 block text-xs text-violet-500 hover:underline">
              Open document in Allerac →
            </a>
          )}
          {selectedConnections.length > 0 && (
            <div className="mt-4 border-t border-slate-500/20 pt-3">
              <h3 className="text-[10px] uppercase tracking-widest text-slate-500">
                Connections ({selectedConnections.length})
              </h3>
              <ul className="mt-2 space-y-2">
                {selectedConnections.map(({ edge, node }) => node && (
                  <li key={edge.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setHoveredConnectionId(node.id)}
                      onMouseLeave={() => setHoveredConnectionId(null)}
                      onFocus={() => setHoveredConnectionId(node.id)}
                      onBlur={() => setHoveredConnectionId(null)}
                      onClick={() => {
                        setHoveredConnectionId(null);
                        setSelected(node);
                      }}
                      className={`w-full rounded-lg border px-2.5 py-2 text-left text-[11px] transition ${
                        hoveredConnectionId === node.id
                          ? 'border-yellow-400/70 bg-yellow-400/10'
                          : 'border-transparent hover:border-cyan-400/40 hover:bg-cyan-400/5'
                      }`}
                    >
                      <span className="font-medium text-cyan-500">{node.label} →</span>
                      <span className="block text-slate-500">{edge.reason}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500">
            <span>{new Date(selected.createdAt).toLocaleDateString()}</span>
            <button onClick={deleteSelected} className="text-red-400">Delete {selected.type}</button>
          </div>
        </aside>
      )}
    </section>
  );
}
