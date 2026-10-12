'use client';

import { useMemo, useState } from 'react';

interface OneNoteItem {
  externalId: string;
  title: string;
  sourceUrl: string;
  parentLabel: string;
  modifiedAt: string;
}

interface Props {
  isDarkMode: boolean;
  isOpen: boolean;
  loading: boolean;
  items: OneNoteItem[];
  importing: boolean;
  onImport: (selected: OneNoteItem[]) => void;
  onClose: () => void;
}

export default function OneNoteSelectionModal({ isDarkMode: d, isOpen, loading, items, importing, onImport, onClose }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const groups = useMemo(() => {
    const byLabel = new Map<string, OneNoteItem[]>();
    for (const item of items) {
      const list = byLabel.get(item.parentLabel) ?? [];
      list.push(item);
      byLabel.set(item.parentLabel, list);
    }
    return Array.from(byLabel.entries());
  }, [items]);

  if (!isOpen) return null;

  const toggle = (externalId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(externalId)) next.delete(externalId); else next.add(externalId);
      return next;
    });
  };

  const toggleGroup = (groupItems: OneNoteItem[]) => {
    const allChecked = groupItems.every(i => selected.has(i.externalId));
    setSelected(prev => {
      const next = new Set(prev);
      for (const item of groupItems) {
        if (allChecked) next.delete(item.externalId); else next.add(item.externalId);
      }
      return next;
    });
  };

  const handleImport = () => {
    onImport(items.filter(i => selected.has(i.externalId)));
  };

  const border = d ? 'border-gray-700' : 'border-gray-200';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`rounded-xl shadow-xl w-full max-w-lg max-h-[85dvh] flex flex-col ${d ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className={`px-5 py-4 border-b ${border}`}>
          <div className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Selecionar páginas do OneNote</div>
          <p className={`text-xs mt-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
            Marque as páginas que você quer importar pro vault. Agrupadas por notebook / seção.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className={`text-xs text-center py-8 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Carregando notebooks…</div>
          ) : groups.length === 0 ? (
            <div className={`text-xs text-center py-8 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Nenhuma página encontrada.</div>
          ) : groups.map(([label, groupItems]) => {
            const allChecked = groupItems.every(i => selected.has(i.externalId));
            return (
              <div key={label}>
                <label className={`flex items-center gap-2 text-xs font-semibold mb-1.5 cursor-pointer ${d ? 'text-gray-300' : 'text-gray-700'}`}>
                  <input type="checkbox" checked={allChecked} onChange={() => toggleGroup(groupItems)} />
                  {label}
                </label>
                <div className="space-y-1 ml-1">
                  {groupItems.map(item => (
                    <label key={item.externalId} className={`flex items-center gap-2 text-xs pl-4 py-0.5 cursor-pointer ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-900'}`}>
                      <input type="checkbox" checked={selected.has(item.externalId)} onChange={() => toggle(item.externalId)} />
                      <span className="truncate">{item.title}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <div className={`px-5 py-3 border-t flex items-center justify-between gap-3 ${border}`}>
          <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{selected.size} selecionada(s)</span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className={`text-xs px-3 py-1.5 rounded transition-colors ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Cancelar
            </button>
            <button
              onClick={handleImport}
              disabled={selected.size === 0 || importing}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 ${d ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
            >
              {importing ? 'Importando…' : 'Importar selecionadas'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
