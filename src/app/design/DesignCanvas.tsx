'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode, type CSSProperties } from 'react';
import { useDomainContext } from '@/app/context/DomainContext';

// ─── types ────────────────────────────────────────────────────────────────────

type ElementType = 'rect' | 'circle' | 'arrow' | 'text' | 'line' | 'diamond';
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2';
type Tool = 'select' | 'rect' | 'circle' | 'diamond' | 'text' | 'arrow' | 'line';
type ViewMode = 'preview' | 'code' | 'html';

interface CanvasElement {
  id: string; type: ElementType;
  x?: number; y?: number; width?: number; height?: number;
  cx?: number; cy?: number; r?: number;
  x1?: number; y1?: number; x2?: number; y2?: number;
  label?: string; fill?: string; stroke?: string; strokeWidth?: number;
  fontSize?: number; bold?: boolean; color?: string;
  visible?: boolean; locked?: boolean;
}

// ─── pure helpers ─────────────────────────────────────────────────────────────

function arrowPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = x2 - x1; const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return '';
  const ux = dx / len; const uy = dy / len;
  const ax = x2 - ux * 12; const ay = y2 - uy * 12;
  const px = -uy * 5; const py = ux * 5;
  return `M${x1},${y1} L${x2},${y2} M${ax + px},${ay + py} L${x2},${y2} L${ax - px},${ay - py}`;
}

function applyResize(el: CanvasElement, handle: ResizeHandle, dx: number, dy: number, o: CanvasElement): CanvasElement {
  const MIN = 10;
  if (el.type === 'rect' || el.type === 'diamond') {
    let x = o.x ?? 0, y = o.y ?? 0, w = o.width ?? 120, h = o.height ?? 60;
    if (handle.includes('e')) w = Math.max(MIN, (o.width ?? 120) + dx);
    if (handle.includes('s')) h = Math.max(MIN, (o.height ?? 60) + dy);
    if (handle.includes('w')) { x = (o.x ?? 0) + dx; w = Math.max(MIN, (o.width ?? 120) - dx); }
    if (handle.includes('n')) { y = (o.y ?? 0) + dy; h = Math.max(MIN, (o.height ?? 60) - dy); }
    return { ...el, x, y, width: w, height: h };
  }
  if (el.type === 'circle') {
    const r = o.r ?? 50;
    return { ...el, r: Math.max(10, r + (handle === 'e' || handle === 's' ? Math.max(dx, dy) : -Math.min(dx, dy))) };
  }
  if (el.type === 'arrow' || el.type === 'line') {
    if (handle === 'p1') return { ...el, x1: (o.x1 ?? 0) + dx, y1: (o.y1 ?? 0) + dy };
    return { ...el, x2: (o.x2 ?? 100) + dx, y2: (o.y2 ?? 0) + dy };
  }
  return el;
}

function applyDraw(el: CanvasElement, ssx: number, ssy: number, scx: number, scy: number): CanvasElement {
  const dx = scx - ssx; const dy = scy - ssy;
  if (el.type === 'rect' || el.type === 'diamond')
    return { ...el, x: dx >= 0 ? ssx : scx, y: dy >= 0 ? ssy : scy, width: Math.max(1, Math.abs(dx)), height: Math.max(1, Math.abs(dy)) };
  if (el.type === 'circle') return { ...el, cx: ssx, cy: ssy, r: Math.max(1, Math.sqrt(dx * dx + dy * dy)) };
  if (el.type === 'arrow' || el.type === 'line') return { ...el, x1: ssx, y1: ssy, x2: scx, y2: scy };
  return el;
}

function applyMinSize(el: CanvasElement): CanvasElement {
  if ((el.type === 'rect' || el.type === 'diamond') && (el.width ?? 0) < 5 && (el.height ?? 0) < 5)
    return { ...el, x: (el.x ?? 0) - 60, y: (el.y ?? 0) - 30, width: 120, height: 60 };
  if (el.type === 'circle' && (el.r ?? 0) < 5) return { ...el, r: 50 };
  if ((el.type === 'arrow' || el.type === 'line') &&
      Math.sqrt(((el.x2 ?? 0) - (el.x1 ?? 0)) ** 2 + ((el.y2 ?? 0) - (el.y1 ?? 0)) ** 2) < 5)
    return { ...el, x2: (el.x1 ?? 0) + 100, y2: el.y1 ?? 0 };
  return el;
}

function sv(v: number, snap: boolean, g: number) { return snap ? Math.round(v / g) * g : v; }
function safeId(id: string) { return id.replace(/[^a-zA-Z0-9_-]/g, '-'); }

// ─── HTML/CSS export ──────────────────────────────────────────────────────────

function generateHtmlExport(elements: CanvasElement[]): { html: string; css: string } {
  if (!elements.length) {
    return {
      html: '<div class="canvas">\n\n</div>',
      css: '.canvas {\n  position: relative;\n  width: 800px;\n  height: 600px;\n  background: #ffffff;\n}',
    };
  }

  // compute bounding box to offset positions
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const el of elements) {
    if (el.type === 'rect' || el.type === 'diamond') {
      minX = Math.min(minX, el.x ?? 0); minY = Math.min(minY, el.y ?? 0);
      maxX = Math.max(maxX, (el.x ?? 0) + (el.width ?? 120)); maxY = Math.max(maxY, (el.y ?? 0) + (el.height ?? 60));
    } else if (el.type === 'circle') {
      const r = el.r ?? 50;
      minX = Math.min(minX, (el.cx ?? 0) - r); minY = Math.min(minY, (el.cy ?? 0) - r);
      maxX = Math.max(maxX, (el.cx ?? 0) + r); maxY = Math.max(maxY, (el.cy ?? 0) + r);
    } else if (el.type === 'text') {
      minX = Math.min(minX, el.x ?? 0); minY = Math.min(minY, (el.y ?? 0) - (el.fontSize ?? 16));
      maxX = Math.max(maxX, (el.x ?? 0) + 200); maxY = Math.max(maxY, el.y ?? 0);
    } else {
      minX = Math.min(minX, el.x1 ?? 0, el.x2 ?? 0); minY = Math.min(minY, el.y1 ?? 0, el.y2 ?? 0);
      maxX = Math.max(maxX, el.x1 ?? 0, el.x2 ?? 0); maxY = Math.max(maxY, el.y1 ?? 0, el.y2 ?? 0);
    }
  }

  const PAD = 32;
  const ox = Math.round(-minX + PAD);
  const oy = Math.round(-minY + PAD);
  const W  = Math.round(maxX - minX + PAD * 2);
  const H  = Math.round(maxY - minY + PAD * 2);

  // HTML lines
  const lines: string[] = [];
  for (const el of elements) {
    if (el.type === 'arrow' || el.type === 'line') continue;
    const sid = safeId(el.id);
    if (el.type === 'text') {
      lines.push(`  <p id="${sid}" class="el">${el.label ?? ''}</p>`);
    } else {
      lines.push(`  <div id="${sid}" class="el">${el.label ? `<span>${el.label}</span>` : ''}</div>`);
    }
  }

  // SVG layer for arrows and lines
  const svgEls = elements.filter(e => e.type === 'arrow' || e.type === 'line');
  if (svgEls.length) {
    const paths = svgEls.map(el => {
      const sid = safeId(el.id);
      const sc = el.stroke || el.color || '#4f46e5';
      const sw = el.strokeWidth ?? 1.5;
      const x1 = Math.round((el.x1 ?? 0) + ox); const y1 = Math.round((el.y1 ?? 0) + oy);
      const x2 = Math.round((el.x2 ?? 100) + ox); const y2 = Math.round((el.y2 ?? 0) + oy);
      if (el.type === 'arrow')
        return `    <path id="${sid}" d="${arrowPath(x1,y1,x2,y2)}" stroke="${sc}" stroke-width="${sw}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
      return `    <line id="${sid}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${sc}" stroke-width="${sw}" stroke-linecap="round"/>`;
    }).join('\n');
    lines.push(`  <svg class="svg-layer" xmlns="http://www.w3.org/2000/svg">\n${paths}\n  </svg>`);
  }

  const html = `<div class="canvas">\n${lines.join('\n')}\n</div>`;

  // CSS rules
  const rules: string[] = [
    `/* generated by Allerac Canvas */`,
    `.canvas {\n  position: relative;\n  width: ${W}px;\n  height: ${H}px;\n  background: #ffffff;\n}`,
    `.el {\n  position: absolute;\n  box-sizing: border-box;\n  margin: 0;\n}`,
    `.svg-layer {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  pointer-events: none;\n  overflow: visible;\n}`,
  ];

  for (const el of elements) {
    if (el.type === 'arrow' || el.type === 'line') continue;
    const sid = safeId(el.id);
    const fc = el.fill || (el.type === 'text' ? 'transparent' : '#f0f0f8');
    const sc = el.stroke || '#4f46e5';
    const sw = el.strokeWidth ?? 1.5;
    const fs = el.fontSize ?? 13;
    const fw = el.bold ? 'bold' : 'normal';
    const flex = `  display: flex;\n  align-items: center;\n  justify-content: center;`;

    if (el.type === 'rect') {
      rules.push(`#${sid} {\n  left: ${Math.round((el.x ?? 0) + ox)}px;\n  top: ${Math.round((el.y ?? 0) + oy)}px;\n  width: ${Math.round(el.width ?? 120)}px;\n  height: ${Math.round(el.height ?? 60)}px;\n  background: ${fc};\n  border: ${sw}px solid ${sc};\n  border-radius: 6px;\n${flex}\n  font-size: ${fs}px;\n  font-weight: ${fw};\n}`);
    } else if (el.type === 'circle') {
      const r = el.r ?? 50;
      rules.push(`#${sid} {\n  left: ${Math.round((el.cx ?? 0) + ox - r)}px;\n  top: ${Math.round((el.cy ?? 0) + oy - r)}px;\n  width: ${Math.round(r * 2)}px;\n  height: ${Math.round(r * 2)}px;\n  background: ${fc};\n  border: ${sw}px solid ${sc};\n  border-radius: 50%;\n${flex}\n  font-size: ${fs}px;\n  font-weight: ${fw};\n}`);
    } else if (el.type === 'diamond') {
      rules.push(`#${sid} {\n  left: ${Math.round((el.x ?? 0) + ox)}px;\n  top: ${Math.round((el.y ?? 0) + oy)}px;\n  width: ${Math.round(el.width ?? 120)}px;\n  height: ${Math.round(el.height ?? 60)}px;\n  background: ${fc};\n  border: ${sw}px solid ${sc};\n  clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);\n${flex}\n  font-size: ${fs}px;\n  font-weight: ${fw};\n}`);
    } else if (el.type === 'text') {
      rules.push(`#${sid} {\n  left: ${Math.round((el.x ?? 0) + ox)}px;\n  top: ${Math.round((el.y ?? 0) + oy)}px;\n  font-size: ${el.fontSize ?? 16}px;\n  font-weight: ${fw};\n  color: ${el.color ?? '#1e1e2e'};\n  white-space: nowrap;\n}`);
    }
  }

  return { html, css: rules.join('\n\n') };
}

function downloadHtml(html: string, css: string) {
  const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canvas Export</title>
  <style>
${css.split('\n').map(l => '    ' + l).join('\n')}
  </style>
</head>
<body style="margin: 0; padding: 32px; font-family: sans-serif;">
${html}
</body>
</html>`;
  const blob = new Blob([full], { type: 'text/html' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'canvas-export.html'; a.click();
  URL.revokeObjectURL(url);
}

const GRID = 24; const MIN_SCALE = 0.05; const MAX_SCALE = 8; const HSIZE = 8;
const TOOL_KEYS: Record<Tool, string> = { select:'V', rect:'R', circle:'C', diamond:'D', text:'T', arrow:'A', line:'L' };

// ─── component ────────────────────────────────────────────────────────────────

export default function DesignCanvas() {
  const { isDark, lastToolCall, setPostContext } = useDomainContext();

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('select');
  const [snapToGrid, setSnapToGrid] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [codeValue, setCodeValue] = useState('[]');
  const [htmlCode, setHtmlCode] = useState('');
  const [cssCode, setCssCode]   = useState('');

  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [scale, setScale]         = useState(1);
  const [cursor, setCursor]       = useState('default');

  const isPanningRef = useRef(false);
  const panLastRef   = useRef({ x: 0, y: 0 });
  const translateRef = useRef({ x: 0, y: 0 });
  const scaleRef     = useRef(1);
  const svgRef       = useRef<SVGSVGElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  const dragRef    = useRef<{ elIds: string[]; sx: number; sy: number; origEls: CanvasElement[] } | null>(null);
  const resizeRef  = useRef<{ elId: string; handle: ResizeHandle; sx: number; sy: number; origEl: CanvasElement } | null>(null);
  const drawingRef = useRef<{ startCX: number; startCY: number; elId: string } | null>(null);

  const live = useRef({ elements, selected, activeTool, snapToGrid });
  useEffect(() => { live.current = { elements, selected, activeTool, snapToGrid }; });

  const elRef  = useRef<CanvasElement[]>([]);
  const past   = useRef<CanvasElement[][]>([]);
  const future = useRef<CanvasElement[][]>([]);
  const clipRef = useRef<CanvasElement[]>([]);
  useEffect(() => { elRef.current = elements; }, [elements]);

  const checkpoint = useCallback(() => {
    past.current = [...past.current, elRef.current.map(e => ({ ...e }))];
    future.current = [];
  }, []);

  const undo = useCallback(() => {
    if (!past.current.length) return;
    future.current = [elRef.current.map(e => ({ ...e })), ...future.current];
    setElements(past.current[past.current.length - 1]);
    past.current = past.current.slice(0, -1);
    setSelected([]);
  }, []);

  const redo = useCallback(() => {
    if (!future.current.length) return;
    past.current = [...past.current, elRef.current.map(e => ({ ...e }))];
    setElements(future.current[0]);
    future.current = future.current.slice(1);
    setSelected([]);
  }, []);

  useEffect(() => { translateRef.current = translate; }, [translate]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);

  useEffect(() => {
    const update = () => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPostContext(`Canvas: ${Math.round(rect.width / scaleRef.current)}×${Math.round(rect.height / scaleRef.current)} units (zoom ${Math.round(scaleRef.current * 100)}%). x:0,y:0 is the canvas origin.`);
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [setPostContext]);

  useEffect(() => {
    if (!lastToolCall || lastToolCall.name !== 'draw_canvas') return;
    const { elements: newEls, mode } = lastToolCall.args ?? {};
    if (!Array.isArray(newEls)) return;
    checkpoint();
    const tagged = newEls.map((el: any, i: number) => ({ id: el.id || `el-${lastToolCall.ts}-${i}`, ...el }));
    setElements(prev => mode === 'append' ? [...prev, ...tagged] : tagged);
  }, [lastToolCall, checkpoint]);

  useEffect(() => {
    if (viewMode !== 'code') return;
    setCodeValue(JSON.stringify(elements, null, 2));
  }, [elements]); // eslint-disable-line

  const switchToPreview = () => {
    if (viewMode === 'code') {
      try {
        const arr = JSON.parse(codeValue);
        checkpoint();
        setElements((Array.isArray(arr) ? arr : (arr.elements ?? [])).map((el: any, i: number) => ({ id: el.id || `el-${Date.now()}-${i}`, ...el })));
      } catch { /* invalid json */ }
    }
    setViewMode('preview');
  };
  const switchToCode = () => { setCodeValue(JSON.stringify(elements, null, 2)); setViewMode('code'); };
  const switchToHtml = () => {
    const { html, css } = generateHtmlExport(elements);
    setHtmlCode(html); setCssCode(css);
    setViewMode('html');
  };

  const deleteSelected = useCallback(() => {
    const sel = live.current.selected;
    if (!sel.length) return;
    checkpoint();
    setElements(prev => prev.filter(e => !sel.includes(e.id)));
    setSelected([]);
  }, [checkpoint]);

  const moveLayerUp = useCallback((id: string) => {
    checkpoint();
    setElements(prev => {
      const i = prev.findIndex(e => e.id === id);
      if (i >= prev.length - 1) return prev;
      const n = [...prev]; [n[i], n[i+1]] = [n[i+1], n[i]]; return n;
    });
  }, [checkpoint]);

  const moveLayerDown = useCallback((id: string) => {
    checkpoint();
    setElements(prev => {
      const i = prev.findIndex(e => e.id === id);
      if (i <= 0) return prev;
      const n = [...prev]; [n[i], n[i-1]] = [n[i-1], n[i]]; return n;
    });
  }, [checkpoint]);

  const toggleLayerVisibility = useCallback((id: string) => {
    setElements(prev => prev.map(e => e.id !== id ? e : { ...e, visible: e.visible === false ? undefined : false }));
  }, []);

  const toggleLayerLock = useCallback((id: string) => {
    setElements(prev => prev.map(e => e.id !== id ? e : { ...e, locked: !e.locked }));
  }, []);

  const renameLayer = useCallback((id: string, label: string) => {
    setElements(prev => prev.map(e => e.id !== id ? e : { ...e, label }));
  }, []);

  const copy = useCallback(() => {
    clipRef.current = live.current.elements.filter(e => live.current.selected.includes(e.id)).map(e => ({ ...e }));
  }, []);

  const paste = useCallback(() => {
    if (!clipRef.current.length) return;
    checkpoint();
    const off = GRID * 2;
    const pasted = clipRef.current.map(el => {
      const id = `el-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (el.type === 'circle')                      return { ...el, id, cx: (el.cx ?? 0) + off, cy: (el.cy ?? 0) + off };
      if (el.type === 'arrow' || el.type === 'line') return { ...el, id, x1: (el.x1 ?? 0) + off, y1: (el.y1 ?? 0) + off, x2: (el.x2 ?? 0) + off, y2: (el.y2 ?? 0) + off };
      return { ...el, id, x: (el.x ?? 0) + off, y: (el.y ?? 0) + off };
    });
    clipRef.current = pasted;
    setElements(prev => [...prev, ...pasted]);
    setSelected(pasted.map(e => e.id));
  }, [checkpoint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      const mod = e.ctrlKey || e.metaKey;
      if (mod) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
        if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }
        if (!inInput && e.key === 'c') { e.preventDefault(); copy(); return; }
        if (!inInput && e.key === 'v') { e.preventDefault(); paste(); return; }
        return;
      }
      if (inInput) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { deleteSelected(); return; }
      if (e.key === 'Escape') { setActiveTool('select'); setSelected([]); return; }
      const map: Record<string, Tool> = { v:'select',V:'select',r:'rect',R:'rect',c:'circle',C:'circle',d:'diamond',D:'diamond',t:'text',T:'text',a:'arrow',A:'arrow',l:'line',L:'line' };
      if (map[e.key]) setActiveTool(map[e.key] as Tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, copy, paste, deleteSelected]);

  const handleElementMouseDown = useCallback((el: CanvasElement, e: React.MouseEvent) => {
    e.stopPropagation();
    if (el.locked) return;
    const { selected: sel, elements: els } = live.current;
    if (e.shiftKey) { setSelected(sel.includes(el.id) ? sel.filter(id => id !== el.id) : [...sel, el.id]); return; }
    const ids = sel.includes(el.id) ? sel : [el.id];
    if (!sel.includes(el.id)) setSelected(ids);
    checkpoint();
    dragRef.current = { elIds: ids, sx: e.clientX, sy: e.clientY, origEls: els.filter(e2 => ids.includes(e2.id)).map(e2 => ({ ...e2 })) };
    setCursor('move');
  }, [checkpoint]);

  const handleHandleMouseDown = useCallback((el: CanvasElement, handle: ResizeHandle, e: React.MouseEvent) => {
    e.stopPropagation();
    checkpoint();
    resizeRef.current = { elId: el.id, handle, sx: e.clientX, sy: e.clientY, origEl: { ...el } };
    setCursor('nwse-resize');
  }, [checkpoint]);

  const handleBgMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const { activeTool: t, snapToGrid: sg } = live.current;
    if (t !== 'select') {
      const rect = svgRef.current!.getBoundingClientRect();
      const cx = (e.clientX - rect.left - translateRef.current.x) / scaleRef.current;
      const cy = (e.clientY - rect.top  - translateRef.current.y) / scaleRef.current;
      const sx = sv(cx, sg, GRID); const sy = sv(cy, sg, GRID);
      const id = `el-${Date.now()}`;
      const seed: CanvasElement =
        t === 'rect'    ? { id, type:'rect',    x:sx, y:sy, width:0, height:0, label:'Rect' } :
        t === 'circle'  ? { id, type:'circle',  cx:sx, cy:sy, r:0 } :
        t === 'diamond' ? { id, type:'diamond', x:sx, y:sy, width:0, height:0, label:'Diamond' } :
        t === 'text'    ? { id, type:'text',    x:sx, y:sy, label:'Text', fontSize:16 } :
        t === 'arrow'   ? { id, type:'arrow',   x1:sx, y1:sy, x2:sx, y2:sy } :
                          { id, type:'line',    x1:sx, y1:sy, x2:sx, y2:sy };
      checkpoint();
      setElements(prev => [...prev, seed]);
      setSelected([id]);
      drawingRef.current = { startCX: cx, startCY: cy, elId: id };
      e.preventDefault();
      return;
    }
    isPanningRef.current = true;
    panLastRef.current = { x: e.clientX, y: e.clientY };
    setSelected([]);
    setCursor('grabbing');
    e.preventDefault();
  }, [checkpoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (drawingRef.current) {
      const { startCX, startCY, elId } = drawingRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const curCX = (e.clientX - rect.left - translateRef.current.x) / scaleRef.current;
      const curCY = (e.clientY - rect.top  - translateRef.current.y) / scaleRef.current;
      const sg = live.current.snapToGrid;
      setElements(prev => prev.map(el => el.id !== elId ? el : applyDraw(el, sv(startCX,sg,GRID), sv(startCY,sg,GRID), sv(curCX,sg,GRID), sv(curCY,sg,GRID))));
      return;
    }
    if (dragRef.current) {
      const { elIds, sx, sy, origEls } = dragRef.current;
      const dx = (e.clientX - sx) / scaleRef.current;
      const dy = (e.clientY - sy) / scaleRef.current;
      const sg = live.current.snapToGrid;
      setElements(prev => prev.map(el => {
        if (!elIds.includes(el.id)) return el;
        const o = origEls.find(x => x.id === el.id)!;
        if (el.type === 'circle')                      return { ...el, cx: sv((o.cx??0)+dx,sg,GRID), cy: sv((o.cy??0)+dy,sg,GRID) };
        if (el.type === 'arrow' || el.type === 'line') return { ...el, x1:sv((o.x1??0)+dx,sg,GRID), y1:sv((o.y1??0)+dy,sg,GRID), x2:sv((o.x2??100)+dx,sg,GRID), y2:sv((o.y2??0)+dy,sg,GRID) };
        return { ...el, x: sv((o.x??0)+dx,sg,GRID), y: sv((o.y??0)+dy,sg,GRID) };
      }));
      return;
    }
    if (resizeRef.current) {
      const { elId, handle, sx, sy, origEl } = resizeRef.current;
      setElements(prev => prev.map(el => el.id !== elId ? el : applyResize(el, handle, (e.clientX-sx)/scaleRef.current, (e.clientY-sy)/scaleRef.current, origEl)));
      return;
    }
    if (!isPanningRef.current) return;
    const dx = e.clientX - panLastRef.current.x; const dy = e.clientY - panLastRef.current.y;
    panLastRef.current = { x: e.clientX, y: e.clientY };
    setTranslate(prev => { const n = { x:prev.x+dx, y:prev.y+dy }; translateRef.current = n; return n; });
  }, []);

  const handleMouseUp = useCallback(() => {
    if (drawingRef.current) {
      const { elId } = drawingRef.current;
      setElements(prev => prev.map(el => el.id === elId ? applyMinSize(el) : el));
      setActiveTool('select');
      drawingRef.current = null;
      setCursor('default');
      return;
    }
    dragRef.current = null; resizeRef.current = null; isPanningRef.current = false; setCursor('default');
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const ns = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scaleRef.current * (e.deltaY < 0 ? 1.1 : 0.9)));
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;
    setTranslate(prev => ({ x: mx-(mx-prev.x)*(ns/scaleRef.current), y: my-(my-prev.y)*(ns/scaleRef.current) }));
    setScale(ns);
  }, []);

  const resetView = () => { setScale(1); setTranslate({ x:0, y:0 }); };

  const jumpToCode = useCallback((elId: string) => {
    const json = JSON.stringify(elements, null, 2);
    setCodeValue(json); setViewMode('code');
    setTimeout(() => {
      const ta = textareaRef.current; if (!ta) return;
      const idx = json.indexOf(`"id": "${elId}"`); if (idx === -1) return;
      let s = idx; while (s > 0 && json[s] !== '{') s--;
      let e2 = s; let depth = 0;
      while (e2 < json.length) { if (json[e2]==='{') depth++; else if (json[e2]==='}') { depth--; if (!depth) { e2++; break; } } e2++; }
      ta.focus(); ta.setSelectionRange(s, e2);
      ta.scrollTop = (json.slice(0,s).split('\n').length-1) * 20.4 - 40;
    }, 30);
  }, [elements]);

  const updateSelected = useCallback((patch: Partial<CanvasElement>) => {
    const sel = live.current.selected;
    setElements(prev => prev.map(el => sel.includes(el.id) ? { ...el, ...patch } : el));
  }, []);

  // theme
  const d = isDark;
  const stroke     = d ? '#89b4fa' : '#4f46e5';
  const fill       = d ? '#313244' : '#f0f0f8';
  const textClr    = d ? '#cdd6f4' : '#1e1e2e';
  const canvasBg   = d ? '#181825' : '#ffffff';
  const canvasGrid = d ? '#2a2a3e' : '#e8e8f0';
  const surfaceBg  = d ? '#2a2a3e' : '#ffffff';
  const borderClr  = d ? '#3a3a5c' : '#e0e0ef';
  const mutedClr   = d ? '#a6adc8' : '#5c5f77';
  const btnPrimary = d ? '#89b4fa' : '#4f46e5';
  const btnTextClr = d ? '#1e1e2e' : '#ffffff';
  const panelBg    = d ? '#1e1e2e' : '#f8f8fc';
  const inputBg    = d ? '#313244' : '#ffffff';

  const renderHandles = (el: CanvasElement) => {
    const hs = HSIZE / scale;
    const H = ({ x, y, dir }: { x:number; y:number; dir:ResizeHandle }) => (
      <rect x={x-hs/2} y={y-hs/2} width={hs} height={hs}
        fill="#fff" stroke={btnPrimary} strokeWidth={1.5/scale} style={{ cursor:'nwse-resize' }}
        onMouseDown={e => { e.stopPropagation(); handleHandleMouseDown(el, dir, e); }}/>
    );
    if (el.type === 'rect' || el.type === 'diamond') {
      const bx = el.x ?? ((el.cx??0)-(el.width??120)/2);
      const by = el.y ?? ((el.cy??0)-(el.height??60)/2);
      const w = el.width??120; const h = el.height??60;
      return <><H x={bx} y={by} dir="nw"/><H x={bx+w/2} y={by} dir="n"/><H x={bx+w} y={by} dir="ne"/>
        <H x={bx+w} y={by+h/2} dir="e"/><H x={bx+w} y={by+h} dir="se"/><H x={bx+w/2} y={by+h} dir="s"/>
        <H x={bx} y={by+h} dir="sw"/><H x={bx} y={by+h/2} dir="w"/></>;
    }
    if (el.type === 'circle') {
      const cx=el.cx??0; const cy=el.cy??0; const r=el.r??50;
      return <><H x={cx} y={cy-r} dir="n"/><H x={cx+r} y={cy} dir="e"/><H x={cx} y={cy+r} dir="s"/><H x={cx-r} y={cy} dir="w"/></>;
    }
    if (el.type === 'arrow' || el.type === 'line')
      return <><H x={el.x1??0} y={el.y1??0} dir="p1"/><H x={el.x2??100} y={el.y2??0} dir="p2"/></>;
    if (el.type === 'text') return <H x={el.x??0} y={el.y??0} dir="se"/>;
    return null;
  };

  const renderElement = (el: CanvasElement) => {
    if (el.visible === false) return null;
    const isSel = selected.includes(el.id);
    const elS = el.stroke||stroke; const elF = el.fill||(el.type==='text'?'transparent':fill);
    const sw = el.strokeWidth??1.5;
    const glow = isSel ? { filter:'drop-shadow(0 0 4px #89b4fa)' } : {};
    const onMD  = (e: React.MouseEvent) => handleElementMouseDown(el, e);
    const onDbl = (e: React.MouseEvent) => { e.stopPropagation(); jumpToCode(el.id); };
    const lbl = el.label ? (
      <text x={el.type==='circle'?el.cx:(el.x??0)+(el.width??0)/2} y={el.type==='circle'?(el.cy??0)+5:(el.y??0)+(el.height??0)/2+5}
        textAnchor="middle" fontSize={el.fontSize??13} fill={textClr} fontWeight={el.bold?'bold':'normal'}
        style={{pointerEvents:'none',userSelect:'none'}}>{el.label}</text>
    ) : null;
    switch (el.type) {
      case 'rect': return <g key={el.id} style={glow} onMouseDown={onMD} onDoubleClick={onDbl}>
        <rect x={el.x} y={el.y} width={el.width??120} height={el.height??60} rx={6} fill={elF} stroke={elS} strokeWidth={sw} style={{cursor:'move'}}/>{lbl}{isSel&&renderHandles(el)}</g>;
      case 'circle': return <g key={el.id} style={glow} onMouseDown={onMD} onDoubleClick={onDbl}>
        <circle cx={el.cx} cy={el.cy} r={el.r??50} fill={elF} stroke={elS} strokeWidth={sw} style={{cursor:'move'}}/>{lbl}{isSel&&renderHandles(el)}</g>;
      case 'diamond': {
        const dcx=(el.cx??el.x??0)+(el.width?el.width/2:0); const dcy=(el.cy??el.y??0)+(el.height?el.height/2:0);
        const hw=(el.width??100)/2; const hh=(el.height??60)/2;
        return <g key={el.id} style={glow} onMouseDown={onMD} onDoubleClick={onDbl}>
          <polygon points={`${dcx},${dcy-hh} ${dcx+hw},${dcy} ${dcx},${dcy+hh} ${dcx-hw},${dcy}`} fill={elF} stroke={elS} strokeWidth={sw} style={{cursor:'move'}}/>
          {el.label&&<text x={dcx} y={dcy+5} textAnchor="middle" fontSize={el.fontSize??13} fill={textClr} style={{pointerEvents:'none',userSelect:'none'}}>{el.label}</text>}
          {isSel&&renderHandles(el)}</g>;
      }
      case 'arrow': return <g key={el.id} style={glow} onMouseDown={onMD} onDoubleClick={onDbl}>
        <path d={arrowPath(el.x1??0,el.y1??0,el.x2??100,el.y2??0)} stroke={el.color||elS} strokeWidth={sw} fill="none" strokeLinecap="round" strokeLinejoin="round" style={{cursor:'move'}}/>
        {el.label&&<text x={((el.x1??0)+(el.x2??100))/2} y={((el.y1??0)+(el.y2??0))/2-8} textAnchor="middle" fontSize={11} fill={mutedClr} style={{pointerEvents:'none',userSelect:'none'}}>{el.label}</text>}
        {isSel&&renderHandles(el)}</g>;
      case 'line': return <g key={el.id} style={glow} onMouseDown={onMD} onDoubleClick={onDbl}>
        <line x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} stroke={el.color||elS} strokeWidth={sw} strokeLinecap="round" style={{cursor:'move'}}/>{isSel&&renderHandles(el)}</g>;
      case 'text': return <g key={el.id} style={glow} onMouseDown={onMD} onDoubleClick={onDbl}>
        <text x={el.x??100} y={el.y??100} fontSize={el.fontSize??14} fill={el.color||textClr} fontWeight={el.bold?'bold':'normal'} style={{cursor:'move',userSelect:'none'}}>{el.label}</text>
        {isSel&&renderHandles(el)}</g>;
      default: return null;
    }
  };

  const selEl   = selected.length === 1 ? (elements.find(e => e.id === selected[0]) ?? null) : null;
  const zoomPct = Math.round(scale * 100);
  const toolCursor = activeTool !== 'select' ? 'crosshair' : cursor;

  const tbtn = (active: boolean): CSSProperties => ({
    padding:'3px 8px', fontSize:11, border:`1px solid ${active?btnPrimary:borderClr}`,
    borderRadius:4, cursor:'pointer', lineHeight:1,
    background: active?(d?'#1a1a3a':'#eef2ff'):'transparent',
    color: active?btnPrimary:mutedClr, fontWeight: active?700:400,
  });
  const monoArea: CSSProperties = { flex:1, resize:'none', background:canvasBg, color:textClr, border:'none', outline:'none', padding:16, fontFamily:'"JetBrains Mono","Fira Code",monospace', fontSize:12, lineHeight:1.7, tabSize:2 };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:surfaceBg, position:'relative' }}>

      {/* ── toolbar ── */}
      <div style={{ height:44, borderBottom:`1px solid ${borderClr}`, display:'flex', alignItems:'center', gap:4, padding:'0 10px', background:surfaceBg, flexShrink:0 }}>
        <span style={{ fontSize:11, fontWeight:600, color:mutedClr, textTransform:'uppercase', letterSpacing:1, marginRight:4, flexShrink:0 }}>Canvas</span>

        {/* view mode */}
        <div style={{ display:'flex', border:`1px solid ${borderClr}`, borderRadius:6, overflow:'hidden', flexShrink:0 }}>
          {([['preview','Preview'],['code','Code'],['html','HTML']] as [ViewMode,string][]).map(([m,lbl]) => (
            <button key={m} onClick={m==='preview'?switchToPreview:m==='code'?switchToCode:switchToHtml} style={{ padding:'3px 10px', fontSize:11, border:'none', cursor:'pointer', background:viewMode===m?btnPrimary:'transparent', color:viewMode===m?btnTextClr:mutedClr, fontWeight:viewMode===m?600:400 }}>{lbl}</button>
          ))}
        </div>

        <div style={{ width:1, height:18, background:borderClr, margin:'0 2px', flexShrink:0 }}/>

        {(['select','rect','circle','diamond','text','arrow','line'] as Tool[]).map(t => (
          <button key={t} onClick={() => setActiveTool(t)} title={`${t} (${TOOL_KEYS[t]})`} style={tbtn(activeTool===t)}>{TOOL_KEYS[t]}</button>
        ))}

        <div style={{ width:1, height:18, background:borderClr, margin:'0 2px', flexShrink:0 }}/>
        <button onClick={() => setSnapToGrid(v=>!v)} title="Snap to grid" style={tbtn(snapToGrid)}>⊞</button>
        <button onClick={() => setShowLayers(v=>!v)} title="Toggle layers panel" style={tbtn(showLayers)}>≡</button>
        <button onClick={undo} title="Undo (Ctrl+Z)" style={{ padding:'3px 7px', fontSize:14, border:`1px solid ${borderClr}`, borderRadius:4, background:'transparent', color:mutedClr, cursor:'pointer', lineHeight:1, flexShrink:0 }}>↩</button>
        <button onClick={redo} title="Redo (Ctrl+Y)" style={{ padding:'3px 7px', fontSize:14, border:`1px solid ${borderClr}`, borderRadius:4, background:'transparent', color:mutedClr, cursor:'pointer', lineHeight:1, flexShrink:0 }}>↪</button>

        <div style={{ flex:1 }}/>

        <div style={{ display:'flex', alignItems:'center', gap:3, flexShrink:0 }}>
          <button onClick={() => setScale(s=>Math.max(MIN_SCALE,s/1.25))} style={{ padding:'3px 7px', fontSize:13, border:`1px solid ${borderClr}`, borderRadius:4, background:'transparent', color:mutedClr, cursor:'pointer', lineHeight:1 }}>−</button>
          <button onClick={resetView} style={{ padding:'3px 7px', fontSize:11, border:`1px solid ${borderClr}`, borderRadius:4, background:'transparent', color:mutedClr, cursor:'pointer', minWidth:42, textAlign:'center' }}>{zoomPct}%</button>
          <button onClick={() => setScale(s=>Math.min(MAX_SCALE,s*1.25))} style={{ padding:'3px 7px', fontSize:13, border:`1px solid ${borderClr}`, borderRadius:4, background:'transparent', color:mutedClr, cursor:'pointer', lineHeight:1 }}>+</button>
        </div>
        <button onClick={() => { checkpoint(); setElements([]); setSelected([]); setCodeValue('[]'); }} style={{ padding:'4px 9px', fontSize:11, borderRadius:5, border:`1px solid ${borderClr}`, background:'transparent', color:mutedClr, cursor:'pointer', flexShrink:0 }}>Clear</button>
      </div>

      {/* ── canvas (preview) ── */}
      <div style={{ flex:1, overflow:'hidden', display:viewMode==='preview'?'flex':'none', flexDirection:'row' }}>
        {showLayers && (
          <LayersPanel
            elements={elements} selected={selected}
            onSelect={(id, multi) => setSelected(multi ? (selected.includes(id) ? selected.filter(x=>x!==id) : [...selected,id]) : [id])}
            onMoveUp={moveLayerUp} onMoveDown={moveLayerDown}
            onToggleVisibility={toggleLayerVisibility} onToggleLock={toggleLayerLock}
            onRename={renameLayer}
            isDark={d} panelBg={panelBg} borderClr={borderClr} textClr={textClr} mutedClr={mutedClr} btnPrimary={btnPrimary}
          />
        )}
        <div style={{ flex:1, position:'relative', overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <svg ref={svgRef} style={{ flex:1, background:canvasBg, cursor:toolCursor, userSelect:'none' }}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} onWheel={handleWheel}>
            <defs>
              <pattern id="dcanvas-grid" width={GRID} height={GRID} patternUnits="userSpaceOnUse">
                <path d={`M ${GRID} 0 L 0 0 0 ${GRID}`} fill="none" stroke={canvasGrid} strokeWidth="0.5"/>
              </pattern>
            </defs>
            <g transform={`translate(${translate.x},${translate.y}) scale(${scale})`}>
              <rect x={-50000} y={-50000} width={100000} height={100000} fill="url(#dcanvas-grid)"
                onMouseDown={handleBgMouseDown} style={{ cursor:activeTool!=='select'?'crosshair':'grab' }}/>
              {elements.map(renderElement)}
            </g>
          </svg>
          {selEl && (
            <PropertiesPanel el={selEl} update={updateSelected} onDelete={deleteSelected} onClose={() => setSelected([])}
              isDark={d} panelBg={panelBg} borderClr={borderClr} inputBg={inputBg}
              textClr={textClr} mutedClr={mutedClr} btnPrimary={btnPrimary}/>
          )}
          {selected.length > 1 && (
            <div style={{ position:'absolute', top:8, right:8, background:panelBg, border:`1px solid ${borderClr}`, borderRadius:8, padding:'8px 12px', fontSize:11, color:textClr, boxShadow:d?'0 4px 20px rgba(0,0,0,0.5)':'0 4px 20px rgba(0,0,0,0.1)', display:'flex', flexDirection:'column', gap:5 }}>
              <span style={{ fontWeight:600, color:btnPrimary }}>{selected.length} selected</span>
              <button onClick={deleteSelected} style={{ fontSize:10, background:'none', border:`1px solid ${borderClr}`, borderRadius:4, padding:'2px 8px', color:mutedClr, cursor:'pointer' }}>Delete all</button>
            </div>
          )}
        </div>
      </div>

      {/* ── code editor ── */}
      {viewMode === 'code' && (
        <textarea ref={textareaRef} value={codeValue} onChange={e => setCodeValue(e.target.value)} spellCheck={false} style={{ ...monoArea, padding:20 }}/>
      )}

      {/* ── html export ── */}
      {viewMode === 'html' && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          {/* split editor */}
          <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
            {/* HTML pane */}
            <div style={{ flex:1, display:'flex', flexDirection:'column', borderRight:`1px solid ${borderClr}` }}>
              <div style={{ padding:'4px 12px', background:surfaceBg, borderBottom:`1px solid ${borderClr}`, fontSize:10, fontWeight:700, color:mutedClr, textTransform:'uppercase', letterSpacing:0.8, flexShrink:0 }}>HTML</div>
              <textarea value={htmlCode} onChange={e => setHtmlCode(e.target.value)} spellCheck={false} style={monoArea}/>
            </div>
            {/* CSS pane */}
            <div style={{ flex:1, display:'flex', flexDirection:'column' }}>
              <div style={{ padding:'4px 12px', background:surfaceBg, borderBottom:`1px solid ${borderClr}`, fontSize:10, fontWeight:700, color:mutedClr, textTransform:'uppercase', letterSpacing:0.8, flexShrink:0 }}>CSS</div>
              <textarea value={cssCode} onChange={e => setCssCode(e.target.value)} spellCheck={false} style={monoArea}/>
            </div>
          </div>
          {/* bottom bar */}
          <div style={{ height:40, borderTop:`1px solid ${borderClr}`, display:'flex', alignItems:'center', gap:8, padding:'0 12px', background:surfaceBg, flexShrink:0 }}>
            <button
              onClick={() => { const {html,css} = generateHtmlExport(elements); setHtmlCode(html); setCssCode(css); }}
              style={{ padding:'4px 10px', fontSize:11, borderRadius:5, border:`1px solid ${borderClr}`, background:'transparent', color:mutedClr, cursor:'pointer' }}>
              ↺ Regenerate from canvas
            </button>
            <div style={{ flex:1 }}/>
            <button
              onClick={() => downloadHtml(htmlCode, cssCode)}
              style={{ padding:'4px 12px', fontSize:11, borderRadius:5, border:'none', background:btnPrimary, color:btnTextClr, cursor:'pointer', fontWeight:600 }}>
              ↓ Download .html
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── properties panel ─────────────────────────────────────────────────────────

interface PPProps { el:CanvasElement; update:(p:Partial<CanvasElement>)=>void; onDelete:()=>void; onClose:()=>void; isDark:boolean; panelBg:string; borderClr:string; inputBg:string; textClr:string; mutedClr:string; btnPrimary:string; }

function PropertiesPanel({ el, update, onDelete, onClose, isDark, panelBg, borderClr, inputBg, textClr, mutedClr, btnPrimary }: PPProps) {
  const p = { inputBg, borderClr, textClr, mutedClr };
  return (
    <div style={{ position:'absolute', top:8, right:8, width:196, background:panelBg, border:`1px solid ${borderClr}`, borderRadius:10, padding:'10px 12px', display:'flex', flexDirection:'column', gap:8, boxShadow:isDark?'0 4px 24px rgba(0,0,0,0.5)':'0 4px 24px rgba(0,0,0,0.1)', fontSize:11, color:textClr }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <span style={{ fontWeight:700, fontSize:12, color:btnPrimary, textTransform:'capitalize' }}>{el.type}</span>
        <div style={{ display:'flex', gap:4 }}>
          <button onClick={onDelete} title="Delete (Del)" style={{ background:'none', border:'none', cursor:'pointer', color:'#f38ba8', fontSize:12, lineHeight:1, padding:'1px 4px', borderRadius:3 }}>🗑</button>
          <button onClick={onClose} title="Close (Esc)" style={{ background:'none', border:'none', cursor:'pointer', color:mutedClr, fontSize:16, lineHeight:1 }}>×</button>
        </div>
      </div>
      <PGroup label="Position & Size"><PosGrid el={el} update={update} {...p}/></PGroup>
      <PGroup label="Style">
        <ColorRow label="Fill"    value={el.fill   ??''} onChange={v=>update({fill:v})}   {...p}/>
        <ColorRow label="Stroke"  value={el.stroke ??''} onChange={v=>update({stroke:v})} {...p}/>
        <Row      label="S.Width" value={String(el.strokeWidth??1.5)} onChange={v=>update({strokeWidth:parseFloat(v)||1.5})} {...p}/>
      </PGroup>
      {el.type !== 'arrow' && el.type !== 'line' && (
        <PGroup label="Text">
          <Row label="Label" value={el.label??''} onChange={v=>update({label:v})} {...p}/>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span style={{ color:mutedClr, fontSize:10, minWidth:46, flexShrink:0 }}>Size</span>
            <input value={String(el.fontSize??13)} onChange={e=>update({fontSize:parseInt(e.target.value)||13})}
              style={{ flex:1, minWidth:0, fontSize:11, background:inputBg, border:`1px solid ${borderClr}`, borderRadius:4, padding:'2px 5px', color:textClr, outline:'none' }}/>
            <label style={{ display:'flex', alignItems:'center', gap:2, cursor:'pointer', color:mutedClr, flexShrink:0, userSelect:'none' }}>
              <input type="checkbox" checked={el.bold??false} onChange={e=>update({bold:e.target.checked})} style={{cursor:'pointer'}}/>B
            </label>
          </div>
        </PGroup>
      )}
    </div>
  );
}

function PGroup({ label, children }: { label:string; children:ReactNode }) {
  return <div>
    <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, color:'#6b7280', marginBottom:4 }}>{label}</div>
    <div style={{ display:'flex', flexDirection:'column', gap:3 }}>{children}</div>
  </div>;
}

const iBase = (inputBg:string, borderClr:string, textClr:string): CSSProperties =>
  ({ flex:1, minWidth:0, fontSize:11, background:inputBg, border:`1px solid ${borderClr}`, borderRadius:4, padding:'2px 5px', color:textClr, outline:'none' });

interface RP { label:string; value:string; onChange:(v:string)=>void; inputBg:string; borderClr:string; textClr:string; mutedClr:string; }

function Row({ label, value, onChange, inputBg, borderClr, textClr, mutedClr }: RP) {
  return <div style={{ display:'flex', alignItems:'center', gap:4 }}>
    <span style={{ color:mutedClr, fontSize:10, minWidth:46, flexShrink:0 }}>{label}</span>
    <input value={value} onChange={e=>onChange(e.target.value)} style={iBase(inputBg,borderClr,textClr)}/>
  </div>;
}

function ColorRow({ label, value, onChange, inputBg, borderClr, textClr, mutedClr }: RP) {
  return <div style={{ display:'flex', alignItems:'center', gap:4 }}>
    <span style={{ color:mutedClr, fontSize:10, minWidth:46, flexShrink:0 }}>{label}</span>
    <input type="color" value={value||'#89b4fa'} onChange={e=>onChange(e.target.value)}
      style={{ width:20, height:20, border:'none', background:'none', cursor:'pointer', padding:0, flexShrink:0 }}/>
    <input value={value} onChange={e=>onChange(e.target.value)} placeholder="#hex" style={iBase(inputBg,borderClr,textClr)}/>
  </div>;
}

// ─── layers panel ─────────────────────────────────────────────────────────────

const LAYER_ICONS: Record<ElementType, string> = { rect:'▭', circle:'○', diamond:'◇', text:'T', arrow:'↗', line:'╱' };

interface LPProps { elements:CanvasElement[]; selected:string[]; onSelect:(id:string,multi:boolean)=>void; onMoveUp:(id:string)=>void; onMoveDown:(id:string)=>void; onToggleVisibility:(id:string)=>void; onToggleLock:(id:string)=>void; onRename:(id:string,label:string)=>void; isDark:boolean; panelBg:string; borderClr:string; textClr:string; mutedClr:string; btnPrimary:string; }

function LayersPanel({ elements, selected, onSelect, onMoveUp, onMoveDown, onToggleVisibility, onToggleLock, onRename, isDark: d, panelBg, borderClr, textClr, mutedClr, btnPrimary }: LPProps) {
  const [editId, setEditId] = useState<string|null>(null);
  const [editVal, setEditVal] = useState('');

  const reversed = [...elements].reverse();

  return (
    <div style={{ width:172, flexShrink:0, borderRight:`1px solid ${borderClr}`, background:panelBg, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'5px 10px', borderBottom:`1px solid ${borderClr}`, fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:0.8, color:mutedClr, flexShrink:0 }}>Layers</div>
      <div style={{ flex:1, overflowY:'auto' }}>
        {reversed.length === 0 && (
          <div style={{ padding:'24px 10px', textAlign:'center', color:'#6b7280', fontSize:10 }}>No layers yet</div>
        )}
        {reversed.map((el) => {
          const realIdx = elements.findIndex(e => e.id === el.id);
          const isSel   = selected.includes(el.id);
          const isHidden = el.visible === false;
          const isLocked = !!el.locked;

          return (
            <div key={el.id}
              onClick={e => onSelect(el.id, e.shiftKey)}
              style={{ display:'flex', alignItems:'center', gap:3, padding:'3px 4px 3px 6px', cursor:'pointer', userSelect:'none', borderLeft:`2px solid ${isSel ? btnPrimary : 'transparent'}`, background: isSel ? (d?'rgba(137,180,250,0.12)':'rgba(79,70,229,0.07)') : 'transparent' }}
            >
              {/* type icon */}
              <span style={{ fontSize:11, color:isHidden?'#555':mutedClr, width:14, textAlign:'center', flexShrink:0 }}>{LAYER_ICONS[el.type]}</span>

              {/* label / inline edit */}
              {editId === el.id ? (
                <input autoFocus value={editVal}
                  onChange={e => setEditVal(e.target.value)}
                  onBlur={() => { onRename(el.id, editVal); setEditId(null); }}
                  onKeyDown={e => { if (e.key==='Enter'||e.key==='Escape') { if(e.key==='Enter') onRename(el.id, editVal); setEditId(null); } e.stopPropagation(); }}
                  onClick={e => e.stopPropagation()}
                  style={{ flex:1, minWidth:0, fontSize:11, background:'transparent', border:`1px solid ${btnPrimary}`, borderRadius:3, padding:'0 3px', color:textClr, outline:'none' }}
                />
              ) : (
                <span
                  onDoubleClick={e => { e.stopPropagation(); setEditId(el.id); setEditVal(el.label ?? ''); }}
                  title="Double-click to rename"
                  style={{ flex:1, minWidth:0, fontSize:11, color:isHidden?'#555':textClr, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
                >
                  {el.label || el.type}
                </span>
              )}

              {/* lock toggle */}
              <button onClick={e => { e.stopPropagation(); onToggleLock(el.id); }} title={isLocked?'Unlock':'Lock'}
                style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:isLocked?btnPrimary:mutedClr, fontSize:10, lineHeight:1, flexShrink:0, opacity:isLocked?1:0.4 }}>
                {isLocked ? '🔒' : '🔓'}
              </button>

              {/* visibility toggle */}
              <button onClick={e => { e.stopPropagation(); onToggleVisibility(el.id); }} title={isHidden?'Show':'Hide'}
                style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:isHidden?'#555':mutedClr, fontSize:11, lineHeight:1, flexShrink:0 }}>
                {isHidden ? '◌' : '◉'}
              </button>

              {/* z-order */}
              <div style={{ display:'flex', flexDirection:'column', flexShrink:0 }}>
                <button onClick={e => { e.stopPropagation(); onMoveUp(el.id); }} title="Bring forward"
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:mutedClr, fontSize:8, lineHeight:1, opacity:realIdx===elements.length-1?0.25:0.7 }}>▲</button>
                <button onClick={e => { e.stopPropagation(); onMoveDown(el.id); }} title="Send backward"
                  style={{ background:'none', border:'none', cursor:'pointer', padding:0, color:mutedClr, fontSize:8, lineHeight:1, opacity:realIdx===0?0.25:0.7 }}>▼</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PosGrid({ el, update, inputBg, borderClr, textClr, mutedClr }: { el:CanvasElement; update:(p:Partial<CanvasElement>)=>void; inputBg:string; borderClr:string; textClr:string; mutedClr:string }) {
  const is = iBase(inputBg,borderClr,textClr);
  const ls: CSSProperties = { color:mutedClr, fontSize:10, flexShrink:0 };
  const cell = (lbl:string, val:string, cb:(v:string)=>void) => (
    <div style={{ display:'flex', alignItems:'center', gap:3, flex:1, minWidth:0 }}>
      <span style={ls}>{lbl}</span><input value={val} onChange={e=>cb(e.target.value)} style={is}/>
    </div>
  );
  const row2 = (a:ReactNode, b:ReactNode) => <div style={{ display:'flex', gap:6 }}>{a}{b}</div>;
  const half = <div style={{ flex:1 }}/>;
  if (el.type==='circle') return <>
    {row2(cell('cx',String(Math.round(el.cx??0)),v=>update({cx:parseFloat(v)||0})),cell('cy',String(Math.round(el.cy??0)),v=>update({cy:parseFloat(v)||0})))}
    {row2(cell('r',String(Math.round(el.r??50)),v=>update({r:parseFloat(v)||10})),half)}
  </>;
  if (el.type==='arrow'||el.type==='line') return <>
    {row2(cell('x1',String(Math.round(el.x1??0)),v=>update({x1:parseFloat(v)||0})),cell('y1',String(Math.round(el.y1??0)),v=>update({y1:parseFloat(v)||0})))}
    {row2(cell('x2',String(Math.round(el.x2??100)),v=>update({x2:parseFloat(v)||0})),cell('y2',String(Math.round(el.y2??0)),v=>update({y2:parseFloat(v)||0})))}
  </>;
  return <>
    {row2(cell('x',String(Math.round(el.x??0)),v=>update({x:parseFloat(v)||0})),cell('y',String(Math.round(el.y??0)),v=>update({y:parseFloat(v)||0})))}
    {row2(cell('w',String(Math.round(el.width??120)),v=>update({width:parseFloat(v)||10})),cell('h',String(Math.round(el.height??60)),v=>update({height:parseFloat(v)||10})))}
  </>;
}
