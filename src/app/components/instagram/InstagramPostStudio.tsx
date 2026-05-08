'use client';

import { useState, useRef, useEffect } from 'react';
import { generateCaption, generateTags, publishInstagramPost } from '@/app/actions/instagram';

interface PostState {
  caption: string;
  tags: string;
  price: string;
  isProduct: boolean;
  imageBase64?: string | null;
  imagePreview?: string | null;
  imageUrl?: string | null;
  imageName?: string | null;
  aspectRatio?: '1/1' | '4/5' | '1.91/1';
}

interface Props {
  userId: string;
  conversationId?: string | null;
  mobileView?: 'editor' | 'preview';
  externalUpdate?: { caption?: string; tags?: string; price?: string; isProduct?: boolean; timestamp: number } | null;
  onClose?: () => void;
  onSuccess?: (postId: string) => void;
  onPostStateChange?: (state: PostState) => void;
  initialCaption?: string;
  initialTags?: string;
  initialImageBase64?: string | null;
  initialImagePreview?: string | null;
  initialImageUrl?: string | null;
}

// Module-level cache: persists state per conversation across re-renders/navigation
const studioStateCache = new Map<string, PostState>();

export default function InstagramPostStudio({
  userId,
  conversationId,
  mobileView = 'editor',
  externalUpdate,
  onClose,
  onSuccess,
  onPostStateChange,
  initialCaption,
  initialTags,
  initialImageBase64,
  initialImagePreview,
  initialImageUrl,
}: Props) {
  const [imageBase64, setImageBase64] = useState<string | null>(initialImageBase64 ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImagePreview ?? null);
  const [imageName, setImageName] = useState<string | null>(initialImageBase64 || initialImagePreview ? 'imagem carregada' : null);
  const [aspectRatio, setAspectRatio] = useState<'1/1' | '4/5' | '1.91/1'>('1/1');
  const [caption, setCaption] = useState(initialCaption ?? '');
  const [tags, setTags] = useState(initialTags ?? '');
  const [isProduct, setIsProduct] = useState(false);
  const [price, setPrice] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Image size must be less than 10MB'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageBase64(result.split(',')[1] || result);
      setImagePreview(result);
      setImageName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateCaption = async () => {
    const imageInput = imageBase64 || imageUrl;
    if (!imageInput) { setError('Please select an image first'); return; }
    setIsGeneratingCaption(true);
    setError('');
    try {
      const result = await generateCaption(imageInput, userId);
      if (result.success) setCaption(result.caption);
      else setError(result.error);
    } catch (err: any) { setError(err.message); }
    finally { setIsGeneratingCaption(false); }
  };

  const handleGenerateTags = async () => {
    setIsGeneratingTags(true);
    setError('');
    try {
      const result = await generateTags(userId, caption);
      if (result.success) setTags(result.tags);
      else setError(result.error);
    } catch (err: any) { setError(err.message); }
    finally { setIsGeneratingTags(false); }
  };

  // Save current state to cache and restore state for new conversation when conversationId changes
  const prevConvIdRef = useRef<string | null | undefined>(conversationId);
  useEffect(() => {
    const prevId = prevConvIdRef.current;
    if (prevId === conversationId) return;

    // Save state under the previous conversation
    studioStateCache.set(prevId ?? 'new', { caption, tags, price, isProduct, imageBase64, imagePreview, imageUrl, imageName, aspectRatio });

    // Restore state for the new conversation
    const saved = studioStateCache.get(conversationId ?? 'new');
    if (saved) {
      setCaption(saved.caption);
      setTags(saved.tags);
      setPrice(saved.price);
      setIsProduct(saved.isProduct);
      setImageBase64(saved.imageBase64 ?? null);
      setImagePreview(saved.imagePreview ?? null);
      setImageUrl(saved.imageUrl ?? null);
      setImageName(saved.imageName ?? null);
      setAspectRatio(saved.aspectRatio ?? '1/1');
    } else if (prevId == null) {
      // null → real ID: first message created a new conversation — keep current state
      studioStateCache.set(conversationId ?? 'new', { caption, tags, price, isProduct, imageBase64, imagePreview, imageUrl, imageName, aspectRatio });
    } else {
      // real ID → different ID with no saved state — reset
      setCaption(''); setTags(''); setPrice(''); setIsProduct(false);
      setImageBase64(null); setImagePreview(null); setImageUrl(null);
      setImageName(null); setAspectRatio('1/1');
    }

    prevConvIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    onPostStateChange?.({ caption, tags, price, isProduct });
  }, [caption, tags, price, isProduct]);

  useEffect(() => {
    if (!externalUpdate) return;
    if (externalUpdate.caption !== undefined) setCaption(externalUpdate.caption);
    if (externalUpdate.tags !== undefined) setTags(externalUpdate.tags);
    if (externalUpdate.price !== undefined) setPrice(externalUpdate.price);
    if (externalUpdate.isProduct !== undefined) setIsProduct(externalUpdate.isProduct);
  }, [externalUpdate?.timestamp]);

  const buildFullCaption = () => {
    const priceText = isProduct && price.trim() ? `\n\n💰 €${price.trim()}` : '';
    return tags ? `${caption}${priceText}\n\n${tags}` : `${caption}${priceText}`;
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(buildFullCaption());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch { setError('Failed to copy to clipboard'); }
  };

  const handlePublish = async () => {
    if (!imageBase64 && !imageUrl) { setError('Please select an image'); return; }
    if (!caption.trim()) { setError('Please add a caption'); return; }
    setIsLoading(true);
    setError('');
    setSuccess('');
    try {
      let base64ToPublish = imageBase64;
      if (!base64ToPublish && imageUrl) {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          base64ToPublish = await new Promise((resolve, reject) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1] || (reader.result as string));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { /* fall through to imageUrl path */ }
      }
      const fullCaption = buildFullCaption();
      const result = base64ToPublish
        ? await publishInstagramPost(userId, base64ToPublish as string, fullCaption)
        : await fetch('/api/instagram/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption: fullCaption, image_url: imageUrl }),
          }).then(r => r.json());

      if (result.success) {
        setSuccess(result.message);
        setTimeout(() => { onSuccess?.(result.postId); onClose?.(); }, 2000);
      } else {
        setError(result.error);
      }
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const previewCaption = caption || 'A sua caption vai aparecer aqui...';
  const previewTags = tags ? tags.split(' ').filter(Boolean) : [];

  return (
    <div className="flex-1 flex h-full min-w-0 bg-gray-900">

      {/* ── Center: Editor ── */}
      <div className={`${mobileView === 'preview' ? 'hidden lg:flex' : 'flex'} flex-[4] flex-col min-w-0 overflow-hidden border-r border-gray-700`}>
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-700 px-5 py-4 flex justify-between items-center bg-gray-900">
          <h2 className="text-base font-semibold text-white">Post to Instagram</h2>
          {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl font-light leading-none">×</button>}
        </div>

        {/* Editor Fields */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">

          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Image</label>
            {imagePreview || imageUrl ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-gray-700 border border-gray-600 min-w-0">
                <span className="text-green-400 text-lg">✓</span>
                <span className="flex-1 text-sm text-gray-200 truncate">{imageName ?? (imageUrl ? imageUrl.split('/').pop() : 'imagem')}</span>
                <button
                  onClick={() => { setImageBase64(null); setImageUrl(null); setImagePreview(null); setImageName(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="text-gray-400 hover:text-red-400 text-xs transition"
                >remover</button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-600 rounded-lg p-6 text-center hover:border-brand-500 hover:bg-brand-500/5 transition"
              >
                <div className="text-gray-400">
                  <div className="text-3xl mb-1">📸</div>
                  <p className="text-sm">Clique para selecionar</p>
                  <p className="text-xs text-gray-500 mt-1">Max 10MB · JPG, PNG, GIF</p>
                </div>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />

            {/* Aspect ratio dropdown — only when image loaded */}
            {(imagePreview || imageUrl) && (
              <div className="mt-3">
                <label className="block text-xs text-gray-400 mb-1.5">Proporção</label>
                <select
                  value={aspectRatio}
                  onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white text-sm focus:outline-none focus:border-brand-500"
                >
                  <option value="1/1">1:1 — Quadrado</option>
                  <option value="4/5">4:5 — Retrato</option>
                  <option value="1.91/1">1.91:1 — Paisagem</option>
                </select>
              </div>
            )}
          </div>

          {/* Caption */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-300">Caption</label>
              <button
                onClick={handleGenerateCaption}
                disabled={isGeneratingCaption || (!imageBase64 && !imageUrl)}
                className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition"
              >
                {isGeneratingCaption ? 'A gerar...' : '✨ Gerar com IA'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Escreva a sua caption..."
              rows={4}
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-brand-500 resize-none text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">{caption.length} caracteres</p>
          </div>

          {/* Hashtags */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-gray-300">Hashtags</label>
              <button
                onClick={handleGenerateTags}
                disabled={isGeneratingTags}
                className="text-xs px-2 py-1 rounded bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition"
              >
                {isGeneratingTags ? 'A gerar...' : '✨ Gerar com IA'}
              </button>
            </div>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#hashtag1 #hashtag2..."
              className="w-full px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-brand-500 text-sm"
            />
          </div>

          {/* Product toggle + price */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => { setIsProduct(v => !v); if (isProduct) setPrice(''); }}
                className={`relative w-9 h-5 rounded-full transition-colors ${isProduct ? 'bg-brand-600' : 'bg-gray-600'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isProduct ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm font-medium text-gray-300">É um produto?</span>
            </label>
            {isProduct && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-gray-400 text-sm font-medium">€</span>
                <input
                  type="text"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 px-3 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-brand-500 text-sm"
                />
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {error && <div className="p-3 rounded-lg bg-red-900/50 text-red-300 border border-red-700 text-sm">{error}</div>}
          {success && <div className="p-3 rounded-lg bg-green-900/50 text-green-300 border border-green-700 text-sm">{success}</div>}
          {copySuccess && <div className="p-3 rounded-lg bg-blue-900/50 text-blue-300 border border-blue-700 text-sm">Copiado! 📋</div>}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCopyToClipboard}
              disabled={!caption.trim()}
              className="flex-1 px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white transition text-sm"
            >📋 Copiar</button>
            <button
              onClick={handlePublish}
              disabled={isLoading || (!imageBase64 && !imageUrl) || !caption.trim()}
              className="flex-1 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium transition text-sm"
            >{isLoading ? 'A publicar...' : 'Publicar'}</button>
          </div>
        </div>
      </div>

      {/* ── Right: Live Preview ── */}
      <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} lg:flex flex-[3] flex-col min-w-0 bg-gray-900`}>
        <div className="flex-shrink-0 border-b border-gray-700 px-4 py-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Preview</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* IG post card — full width */}
          <div className="bg-black">
            {/* Post header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-white text-sm font-semibold leading-tight">você</p>
                <p className="text-gray-400 text-xs">Agora</p>
              </div>
              <span className="ml-auto text-gray-400 text-xl leading-none">···</span>
            </div>

            <div className="w-full overflow-hidden" style={{ aspectRatio }}>
              {imagePreview || imageUrl ? (
                <img src={imagePreview || imageUrl || ''} alt="Post" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <span className="text-6xl opacity-20">📸</span>
                </div>
              )}
            </div>

            {/* Action icons */}
            <div className="flex items-center gap-4 px-4 py-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              <svg className="w-6 h-6 text-white ml-auto" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </div>

            {/* Caption + price + tags */}
            <div className="px-4 pb-5 space-y-2">
              <p className="text-white text-sm leading-relaxed">
                <span className="font-semibold">você </span>
                {previewCaption}
              </p>
              {isProduct && price.trim() && (
                <p className="text-white text-sm font-semibold">💰 €{price.trim()}</p>
              )}
              {previewTags.length > 0 && (
                <p className="text-blue-400 text-sm leading-snug">
                  {previewTags.join(' ')}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
