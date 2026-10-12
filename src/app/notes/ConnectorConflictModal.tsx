'use client';

interface ConflictItem {
  externalId: string;
  noteId: string;
  sourceUrl: string;
  title: string | null;
}

interface Props {
  isDarkMode: boolean;
  isOpen: boolean;
  providerLabel: string;
  conflicts: ConflictItem[];
  resolvingId: string | null;
  message: string | null;
  onResolve: (externalId: string, resolution: 'keep_local' | 'use_source') => void;
  onClose: () => void;
}

export default function ConnectorConflictModal({ isDarkMode: d, isOpen, providerLabel, conflicts, resolvingId, message, onResolve, onClose }: Props) {
  if (!isOpen || conflicts.length === 0) return null;

  const linkClass = d ? 'text-indigo-400 hover:text-indigo-300' : 'text-indigo-600 hover:text-indigo-500';

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`rounded-xl shadow-xl w-full max-w-lg max-h-[85dvh] flex flex-col ${d ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
        <div className={`px-5 py-4 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className={`text-sm font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
            ⚠ Atualizações pendentes do {providerLabel}
          </div>
          <p className={`text-xs mt-1 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
            Estas notas foram editadas aqui no Allerac e também mudaram na fonte.
            Escolha qual versão manter para cada uma — nada é sobrescrito automaticamente.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {conflicts.map(c => (
            <div key={c.externalId} className={`rounded-lg border px-3 py-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`text-sm font-medium mb-2 truncate ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                {c.title || c.externalId}
              </div>
              <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer" className={`text-xs underline ${linkClass}`}>
                Abrir na fonte
              </a>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onResolve(c.externalId, 'keep_local')}
                  disabled={resolvingId !== null}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg border transition-colors disabled:opacity-40 ${d ? 'border-gray-600 text-gray-200 hover:bg-gray-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
                >
                  Manter minha versão
                </button>
                <button
                  onClick={() => onResolve(c.externalId, 'use_source')}
                  disabled={resolvingId !== null}
                  className={`flex-1 text-xs px-3 py-2 rounded-lg transition-colors disabled:opacity-40 ${d ? 'bg-indigo-700 hover:bg-indigo-600 text-white' : 'bg-indigo-600 hover:bg-indigo-500 text-white'}`}
                >
                  {resolvingId === c.externalId ? 'Aplicando…' : 'Usar versão da fonte'}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className={`px-5 py-3 border-t flex items-center justify-between gap-3 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          {message && <span className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{message}</span>}
          <button
            onClick={onClose}
            className={`text-xs px-3 py-1.5 rounded transition-colors ml-auto ${d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Revisar depois
          </button>
        </div>
      </div>
    </div>
  );
}
