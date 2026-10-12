'use client';

import { useState } from 'react';
import type { TreeNode } from './note-tree';

interface RowProps {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  d: boolean;
}

function TreeRow({ node, depth, selectedId, expanded, onToggle, onSelect, onAddChild, onArchive, d }: RowProps) {
  const isOpen = expanded.has(node.id);
  const selected = node.id === selectedId;
  const archived = !!node.archived_at;
  return (
    <>
      <div
        role="treeitem"
        aria-selected={selected}
        aria-expanded={node.children.length > 0 ? isOpen : undefined}
        className={`group flex items-center gap-1 pr-2 py-1 text-xs cursor-pointer ${
          selected
            ? d ? 'bg-indigo-950/50 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
            : d ? 'text-gray-300 hover:bg-gray-800/60' : 'text-gray-700 hover:bg-gray-100'
        } ${archived ? 'opacity-50' : ''}`}
        style={{ paddingLeft: 6 + depth * 12 }}
        onClick={() => onSelect(node.id)}
      >
        <button
          type="button"
          aria-label={isOpen ? 'Collapse' : 'Expand'}
          onClick={e => { e.stopPropagation(); onToggle(node.id); }}
          className={`w-4 flex-shrink-0 text-center ${node.children.length ? '' : 'invisible'} ${d ? 'text-gray-500' : 'text-gray-400'}`}
        >
          {isOpen ? '▾' : '▸'}
        </button>
        {node.icon && <span className="flex-shrink-0">{node.icon}</span>}
        <span className="truncate flex-1">{node.title || 'Untitled'}</span>
        <button
          type="button"
          title="Add sub-page"
          onClick={e => { e.stopPropagation(); onAddChild(node.id); }}
          className={`opacity-0 group-hover:opacity-100 px-1 ${d ? 'text-gray-500 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
        >
          +
        </button>
        <button
          type="button"
          title={archived ? 'Unarchive' : 'Archive'}
          onClick={e => { e.stopPropagation(); onArchive(node.id, !archived); }}
          className={`opacity-0 group-hover:opacity-100 px-1 ${d ? 'text-gray-500 hover:text-gray-200' : 'text-gray-400 hover:text-gray-700'}`}
        >
          {archived ? '↺' : '⌫'}
        </button>
      </div>
      {isOpen && node.children.map(child => (
        <TreeRow key={child.id} node={child} depth={depth + 1} selectedId={selectedId} expanded={expanded}
          onToggle={onToggle} onSelect={onSelect} onAddChild={onAddChild} onArchive={onArchive} d={d} />
      ))}
    </>
  );
}

export function NoteTree({ roots, selectedId, onSelect, onAddChild, onArchive, d }: {
  roots: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild: (parentId: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  d: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const addChild = (parentId: string) => {
    setExpanded(prev => new Set(prev).add(parentId));
    onAddChild(parentId);
  };
  return (
    <div role="tree" className="py-1">
      {roots.map(node => (
        <TreeRow key={node.id} node={node} depth={0} selectedId={selectedId} expanded={expanded}
          onToggle={toggle} onSelect={onSelect} onAddChild={addChild} onArchive={onArchive} d={d} />
      ))}
    </div>
  );
}

export function Breadcrumbs({ items, onSelect, d }: {
  items: Array<{ id: string; title: string | null; icon: string | null }>;
  onSelect: (id: string) => void;
  d: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={`flex items-center gap-1 text-xs mb-1.5 overflow-hidden ${d ? 'text-gray-500' : 'text-gray-400'}`}>
      {items.map((crumb, i) => (
        <span key={crumb.id} className="flex items-center gap-1 min-w-0">
          {i > 0 && <span>/</span>}
          <button type="button" onClick={() => onSelect(crumb.id)} className={`truncate max-w-[10rem] ${d ? 'hover:text-gray-300' : 'hover:text-gray-600'}`}>
            {crumb.icon ? `${crumb.icon} ` : ''}{crumb.title || 'Untitled'}
          </button>
        </span>
      ))}
    </nav>
  );
}
