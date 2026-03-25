'use client';

import { useState, useEffect } from 'react';
import type { TreeNode } from '@/app/api/workspace/tree/route';

interface FileTreeProps {
  rootPath: string;
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
  isDarkMode: boolean;
}

const EXT_ICON: Record<string, string> = {
  ts: '🔷', tsx: '🔷', js: '🟨', jsx: '🟨',
  py: '🐍', sh: '⚙️', bash: '⚙️',
  json: '📋', md: '📝', html: '🌐', css: '🎨',
  sql: '🗄️', yaml: '⚙️', yml: '⚙️',
  rs: '🦀', go: '🐹', dockerfile: '🐳',
};

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  return EXT_ICON[ext] || '📄';
}

function TreeNodeItem({
  node,
  depth,
  selectedPath,
  onFileSelect,
  isDarkMode,
}: {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  onFileSelect: (path: string) => void;
  isDarkMode: boolean;
}) {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = node.path === selectedPath;
  const isDir = node.type === 'dir';

  const baseClass = `flex items-center gap-1.5 w-full text-left px-2 py-[3px] rounded text-sm cursor-pointer transition-colors truncate`;
  const colorClass = isSelected
    ? 'bg-indigo-500/20 text-indigo-300'
    : isDarkMode
    ? 'text-gray-300 hover:bg-white/5 hover:text-white'
    : 'text-gray-700 hover:bg-black/5 hover:text-gray-900';

  return (
    <div>
      <button
        className={`${baseClass} ${colorClass}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (isDir) setOpen(o => !o);
          else onFileSelect(node.path);
        }}
        title={node.path}
      >
        <span className="shrink-0 text-xs">
          {isDir ? (open ? '📂' : '📁') : fileIcon(node.name)}
        </span>
        <span className="truncate">{node.name}</span>
        {isDir && node.children && node.children.length > 0 && (
          <span className={`ml-auto shrink-0 text-xs transition-transform ${open ? 'rotate-90' : ''} ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            ›
          </span>
        )}
      </button>

      {isDir && open && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNodeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onFileSelect={onFileSelect}
              isDarkMode={isDarkMode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function FileTree({ rootPath, selectedPath, onFileSelect, isDarkMode }: FileTreeProps) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/workspace/tree?path=${encodeURIComponent(rootPath)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setTree(data.tree);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [rootPath]);

  if (loading) {
    return (
      <div className="p-4 space-y-1.5">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`h-5 rounded animate-pulse ${isDarkMode ? 'bg-white/10' : 'bg-black/10'}`} style={{ width: `${60 + (i % 3) * 15}%`, marginLeft: `${(i % 2) * 14}px` }} />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="p-4 text-sm text-red-400">{error}</p>;
  }

  if (!tree) return null;

  return (
    <div className="py-2 px-1">
      {tree.children?.map(child => (
        <TreeNodeItem
          key={child.path}
          node={child}
          depth={0}
          selectedPath={selectedPath}
          onFileSelect={onFileSelect}
          isDarkMode={isDarkMode}
        />
      ))}
    </div>
  );
}
