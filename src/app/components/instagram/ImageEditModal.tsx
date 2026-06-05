'use client';

import { useState } from 'react';
import { editProductImage, type ImageEditOperation } from '@/app/actions/image-edit';

interface ImageEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageBase64: string;
  imagePreview: string;
  userId: string;
  isDarkMode: boolean;
  onApply: (resultBase64: string, resultPreview: string) => void;
}

type OperationType = ImageEditOperation['type'];

const OPERATIONS: Array<{ type: OperationType; label: string; description: string; icon: string }> = [
  { type: 'remove-background', label: 'Remover fundo',      description: 'Fundo transparente', icon: '✂️' },
  { type: 'white-background',  label: 'Fundo branco',       description: 'Estúdio infinito',   icon: '⬜' },
  { type: 'lifestyle-scene',   label: 'Cena de lifestyle',  description: 'Prompt personalizado', icon: '🎨' },
  { type: 'enhance',           label: 'Melhorar qualidade', description: 'Upscaling ESRGAN',   icon: '✨' },
];

export default function ImageEditModal({
  isOpen,
  onClose,
  imageBase64,
  imagePreview,
  userId,
  isDarkMode,
  onApply,
}: ImageEditModalProps) {
  const [selectedOp, setSelectedOp] = useState<OperationType>('white-background');
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ base64: string; preview: string } | null>(null);

  const d = isDarkMode;
  const bg      = d ? 'bg-gray-900'  : 'bg-white';
  const bgCard  = d ? 'bg-gray-800'  : 'bg-gray-50';
  const bgInput = d ? 'bg-gray-700'  : 'bg-gray-100';
  const border  = d ? 'border-gray-700' : 'border-gray-200';
  const borderIn = d ? 'border-gray-600' : 'border-gray-300';
  const txt     = d ? 'text-white'   : 'text-gray-900';
  const txtSub  = d ? 'text-gray-300': 'text-gray-700';
  const txtMuted = d ? 'text-gray-400': 'text-gray-500';

  if (!isOpen) return null;

  const handleApply = async () => {
    setIsProcessing(true);
    setError('');
    setResult(null);
    try {
      const operation: ImageEditOperation =
        selectedOp === 'lifestyle-scene'
          ? { type: 'lifestyle-scene', prompt }
          : { type: selectedOp };

      const res = await editProductImage(userId, imageBase64, operation);
      if (!res.success) { setError(res.error); return; }

      const preview = `data:${res.mimeType};base64,${res.resultBase64}`;
      setResult({ base64: res.resultBase64, preview });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUseThis = () => {
    if (!result) return;
    onApply(result.base64, result.preview);
  };

  const handleTryAgain = () => {
    setResult(null);
    setError('');
  };

  const handleClose = () => {
    setResult(null);
    setError('');
    setIsProcessing(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`${bg} rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border ${border}`}>

        {/* Header */}
        <div className={`flex-shrink-0 flex items-center justify-between px-5 py-4 border-b ${border}`}>
          <h2 className={`text-sm font-semibold ${txt}`}>✨ Editar com IA</h2>
          <button onClick={handleClose} className={`${txtMuted} hover:${txt} text-xl font-light leading-none`}>×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">

          {/* Operation selector */}
          {!result && (
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${txtMuted} mb-3`}>Operação</p>
              <div className="grid grid-cols-2 gap-2">
                {OPERATIONS.map(op => (
                  <button
                    key={op.type}
                    onClick={() => setSelectedOp(op.type)}
                    className={`flex items-start gap-3 px-4 py-3 rounded-lg border text-left transition ${
                      selectedOp === op.type
                        ? 'border-brand-500 bg-brand-500/10'
                        : `${bgCard} border-transparent hover:border-gray-600`
                    }`}
                  >
                    <span className="text-xl flex-shrink-0">{op.icon}</span>
                    <div>
                      <p className={`text-sm font-medium ${txt}`}>{op.label}</p>
                      <p className={`text-xs ${txtMuted}`}>{op.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Prompt input — only for lifestyle-scene */}
              {selectedOp === 'lifestyle-scene' && (
                <div className="mt-3">
                  <label className={`block text-xs ${txtMuted} mb-1.5`}>Prompt (deixa vazio para padrão)</label>
                  <input
                    type="text"
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    placeholder="ex: earrings on a tree branch, soft bokeh, golden hour"
                    className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-500 focus:outline-none focus:border-brand-500 text-sm`}
                  />
                </div>
              )}
            </div>
          )}

          {/* Before / After */}
          <div className={`grid ${result ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
            <div>
              <p className={`text-xs ${txtMuted} mb-1.5`}>{result ? 'Original' : 'Imagem'}</p>
              <div className={`rounded-lg overflow-hidden border ${borderIn} aspect-square`}>
                <img src={imagePreview} alt="original" className="w-full h-full object-cover" />
              </div>
            </div>
            {result && (
              <div>
                <p className={`text-xs ${txtMuted} mb-1.5`}>Resultado</p>
                <div className={`rounded-lg overflow-hidden border ${borderIn} aspect-square ${d ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <img src={result.preview} alt="result" className="w-full h-full object-contain" />
                </div>
              </div>
            )}
          </div>

          {/* Processing state */}
          {isProcessing && (
            <div className="flex items-center gap-3 py-2">
              <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              <span className={`text-sm ${txtSub}`}>A processar imagem…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/50 text-red-300 border border-red-700 text-sm">{error}</div>
          )}
        </div>

        {/* Footer actions */}
        <div className={`flex-shrink-0 flex gap-2 px-5 py-4 border-t ${border}`}>
          {!result ? (
            <>
              <button
                onClick={handleClose}
                className={`flex-1 px-4 py-2 rounded-lg text-sm ${d ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} transition`}
              >Cancelar</button>
              <button
                onClick={handleApply}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
              >{isProcessing ? 'A processar…' : 'Aplicar'}</button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                className={`px-4 py-2 rounded-lg text-sm ${d ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} transition`}
              >Cancelar</button>
              <button
                onClick={handleTryAgain}
                className={`flex-1 px-4 py-2 rounded-lg text-sm ${d ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-900'} transition`}
              >Tentar novamente</button>
              <button
                onClick={handleUseThis}
                className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition"
              >Usar esta</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
