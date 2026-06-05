'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { generateCaption, generateTags, publishInstagramPost, publishInstagramCarousel, getInstagramRefSettings, incrementRefCounter } from '@/app/actions/instagram';
import { MODELS } from '@/app/services/llm/models';

interface UploadedImage {
  base64: string;
  preview: string;
  name: string;
}

interface PostState {
  caption: string;
  tags: string;
  price: string;
  productRef: string;
  isProduct: boolean;
  images?: UploadedImage[];
  imageUrl?: string | null;
  aspectRatio?: '1/1' | '4/5' | '1.91/1';
}

interface Props {
  userId: string;
  conversationId?: string | null;
  mobileView?: 'editor' | 'preview';
  isDarkMode?: boolean;
  externalUpdate?: { caption?: string; tags?: string; price?: string; isProduct?: boolean; imageUrl?: string; timestamp: number } | null;
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
  isDarkMode = true,
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
  const [images, setImages] = useState<UploadedImage[]>(
    initialImageBase64 && initialImagePreview
      ? [{ base64: initialImageBase64, preview: initialImagePreview, name: 'imagem carregada' }]
      : []
  );
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [aspectRatio, setAspectRatio] = useState<'1/1' | '4/5' | '1.91/1'>('1/1');
  const [caption, setCaption] = useState(initialCaption ?? '');
  const [tags, setTags] = useState(initialTags ?? '');
  const [isProduct, setIsProduct] = useState(false);
  const [price, setPrice] = useState('');
  const [productRef, setProductRef] = useState('');
  const [purchaseInstructions, setPurchaseInstructions] = useState('');
  const [refManaged, setRefManaged] = useState(false);
  const [refPrefix,  setRefPrefix]  = useState('REF');
  const [refCounter, setRefCounter] = useState(0);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [selectedProvider, setSelectedProvider] = useState<'github' | 'gemini' | 'anthropic' | 'ollama'>('github');
  const t = useTranslations('instagramStudio');
  const locale = useLocale();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('selected_model');
    if (saved) {
      const model = MODELS.find(m => m.id === saved);
      if (model) {
        setSelectedModel(saved);
        setSelectedProvider(model.provider as 'github' | 'gemini' | 'anthropic' | 'ollama');
      }
    }
    const savedInstructions = localStorage.getItem('ig_purchase_instructions');
    if (savedInstructions !== null) setPurchaseInstructions(savedInstructions);
    getInstagramRefSettings(userId).then((r) => {
      setRefManaged(r.managed);
      setRefPrefix(r.prefix);
      setRefCounter(r.counter);
    });
  }, []);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    setImages(current => {
      const remaining = 10 - current.length;
      if (files.length > remaining) {
        setError(`Máximo 10 imagens por carrossel. ${files.length - remaining} ficheiro(s) ignorado(s).`);
      } else {
        setError('');
      }
      const toProcess = files.slice(0, remaining);
      toProcess.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        if (file.size > 10 * 1024 * 1024) { setError(t('errFileTooLarge')); return; }
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = ev.target?.result as string;
          setImages(prev => [...prev, {
            base64: result.split(',')[1] || result,
            preview: result,
            name: file.name,
          }]);
        };
        reader.readAsDataURL(file);
      });
      return current;
    });

    if (imageUrl) setImageUrl(null);
  };

  const handleGenerateAll = async () => {
    const imageInput = images[0]?.base64 || imageUrl;
    if (!imageInput) { setError(t('errNoImage')); return; }
    setIsGenerating(true);
    setError('');
    try {
      const captionResult = await generateCaption(imageInput, userId, undefined, locale, selectedModel, selectedProvider);
      if (!captionResult.success) { setError(captionResult.error); return; }
      setCaption(captionResult.caption);
      const tagsResult = await generateTags(userId, captionResult.caption, locale, selectedModel, selectedProvider);
      if (tagsResult.success) setTags(tagsResult.tags);
      else setError(tagsResult.error);
    } catch (err: any) { setError(err.message); }
    finally { setIsGenerating(false); }
  };

  // Save current state to cache and restore state for new conversation when conversationId changes
  const prevConvIdRef = useRef<string | null | undefined>(conversationId);
  useEffect(() => {
    const prevId = prevConvIdRef.current;
    if (prevId === conversationId) return;

    // Save state under the previous conversation
    studioStateCache.set(prevId ?? 'new', { caption, tags, price, productRef, isProduct, images, imageUrl, aspectRatio });

    // Restore state for the new conversation
    const saved = studioStateCache.get(conversationId ?? 'new');
    if (saved) {
      setCaption(saved.caption);
      setTags(saved.tags);
      setPrice(saved.price);
      setProductRef(saved.productRef ?? '');
      setIsProduct(saved.isProduct);
      setImages(saved.images ?? []);
      setImageUrl(saved.imageUrl ?? null);
      setAspectRatio(saved.aspectRatio ?? '1/1');
    } else if (prevId == null) {
      // null → real ID: first message created a new conversation — keep current state
      studioStateCache.set(conversationId ?? 'new', { caption, tags, price, productRef, isProduct, images, imageUrl, aspectRatio });
    } else {
      // real ID → different ID with no saved state — reset
      setCaption(''); setTags(''); setPrice(''); setProductRef(''); setIsProduct(false);
      setImages([]); setImageUrl(null); setAspectRatio('1/1');
    }

    prevConvIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    if (isProduct && refManaged && !productRef) {
      setProductRef(String(refCounter + 1).padStart(3, '0'));
    }
    if (!isProduct) setProductRef('');
  }, [isProduct]);

  useEffect(() => {
    if (previewIndex >= images.length && images.length > 0) {
      setPreviewIndex(images.length - 1);
    }
  }, [images.length]);

  useEffect(() => {
    onPostStateChange?.({ caption, tags, price, productRef, isProduct });
  }, [caption, tags, price, productRef, isProduct]);

  useEffect(() => {
    if (!externalUpdate) return;
    if (externalUpdate.caption !== undefined) setCaption(externalUpdate.caption);
    if (externalUpdate.tags !== undefined) setTags(externalUpdate.tags);
    if (externalUpdate.price !== undefined) setPrice(externalUpdate.price);
    if (externalUpdate.isProduct !== undefined) setIsProduct(externalUpdate.isProduct);
    if (externalUpdate.imageUrl !== undefined) {
      setImageUrl(externalUpdate.imageUrl);
      setImages([]);
    }
  }, [externalUpdate?.timestamp]);

  const buildFullCaption = () => {
    const parts: string[] = [caption];
    if (purchaseInstructions.trim()) parts.push(purchaseInstructions.trim());
    if (isProduct) {
      const lines: string[] = [];
      if (productRef.trim()) lines.push(`Ref: ${productRef.trim()}`);
      if (price.trim()) lines.push(`${t('priceLabel')} ${price.trim()}€`);
      if (lines.length) parts.push(lines.join('\n'));
    }
    if (tags.trim()) parts.push(tags.trim());
    return parts.join('\n\n');
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(buildFullCaption());
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch { setError(t('errCopyFailed')); }
  };

  const handlePublish = async () => {
    if (images.length === 0 && !imageUrl) { setError(t('errImageRequired')); return; }
    if (!caption.trim()) { setError(t('errCaptionRequired')); return; }
    setIsLoading(true);
    setError('');
    setSuccess('');
    try {
      const fullCaption = buildFullCaption();
      let result;

      if (images.length >= 2) {
        result = await publishInstagramCarousel(userId, images.map(i => i.base64), fullCaption);
      } else if (images.length === 1) {
        result = await publishInstagramPost(userId, images[0].base64, fullCaption);
      } else {
        // imageUrl path (image provided by AI tool)
        let base64ToPublish: string | null = null;
        try {
          const response = await fetch(imageUrl!);
          const blob = await response.blob();
          const reader = new FileReader();
          base64ToPublish = await new Promise((resolve, reject) => {
            reader.onload = () => resolve((reader.result as string).split(',')[1] || (reader.result as string));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch { /* fall through to imageUrl path */ }
        result = base64ToPublish
          ? await publishInstagramPost(userId, base64ToPublish, fullCaption)
          : await fetch('/api/instagram/publish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caption: fullCaption, image_url: imageUrl }),
            }).then(r => r.json());
      }

      if (result.success) {
        if (isProduct && refManaged) {
          const next = await incrementRefCounter(userId);
          if (next) setRefCounter(refCounter + 1);
        }
        setSuccess(result.message);
        setImages([]); setImageUrl(null);
        setCaption(''); setTags(''); setPrice(''); setProductRef(''); setIsProduct(false);
        setAspectRatio('1/1');
        if (fileInputRef.current) fileInputRef.current.value = '';
        studioStateCache.delete(conversationId ?? 'new');
        setTimeout(() => { onSuccess?.(result.postId); onClose?.(); }, 2000);
      } else {
        setError(result.error);
      }
    } catch (err: any) { setError(err.message); }
    finally { setIsLoading(false); }
  };

  const previewCaption = caption || t('previewCaptionPlaceholder');
  const previewTags = tags ? tags.split(' ').filter(Boolean) : [];
  const clampedPreviewIndex = Math.min(previewIndex, Math.max(0, images.length - 1));
  const previewImage = images.length > 0 ? images[clampedPreviewIndex].preview : (imageUrl ?? null);

  // Theme aliases
  const d = isDarkMode;
  const bg        = d ? 'bg-gray-900'  : 'bg-white';
  const bgInput   = d ? 'bg-gray-700'  : 'bg-gray-50';
  const border    = d ? 'border-gray-700' : 'border-gray-200';
  const borderIn  = d ? 'border-gray-600' : 'border-gray-300';
  const txt       = d ? 'text-white'   : 'text-gray-900';
  const txtSub    = d ? 'text-gray-300': 'text-gray-700';
  const txtMuted  = d ? 'text-gray-400': 'text-gray-500';
  const txtFaint  = d ? 'text-gray-500': 'text-gray-400';
  const toggleOff = d ? 'bg-gray-600'  : 'bg-gray-300';
  const btnSec    = d ? 'bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800' : 'bg-gray-200 hover:bg-gray-300 disabled:bg-gray-100';
  const btnSecDis = d ? 'disabled:bg-gray-700' : 'disabled:bg-gray-200';
  const btnDisTxt = d ? 'disabled:text-gray-500' : 'disabled:text-gray-400';

  return (
    <div className={`flex-1 flex h-full min-w-0 ${bg}`}>

      {/* ── Center: Editor ── */}
      <div className={`${mobileView === 'preview' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0 overflow-hidden border-r ${border}`}>
        {/* Header */}
        <div className={`flex-shrink-0 border-b ${border} px-5 py-[13px] flex justify-between items-center ${bg}`}>
          <p className={`text-xs font-semibold ${txtMuted} uppercase tracking-wider`}>{t('title')}</p>
          {onClose && <button onClick={onClose} className={`${txtMuted} hover:${txt} text-xl font-light leading-none`}>×</button>}
        </div>

        {/* Editor Fields */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">

          {/* Onboarding hint — visible only when no image is selected */}
          {images.length === 0 && !imageUrl && (
            <div className={`flex items-start gap-2.5 px-4 py-3 rounded-lg border ${d ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-blue-50 border-blue-100 text-blue-700'} text-sm`}>
              <span className="text-base leading-tight flex-shrink-0">📸</span>
              <span>{t('hint')}</span>
            </div>
          )}

          {/* Image */}
          <div>
            <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('imageLabel')}</label>

            {(images.length > 0 || imageUrl) ? (
              <div>
                {/* Thumbnail strip */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img, i) => (
                    <div key={i} className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border ${borderIn}`}>
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center leading-none"
                      >×</button>
                    </div>
                  ))}
                  {imageUrl && images.length === 0 && (
                    <div className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border ${borderIn}`}>
                      <img src={imageUrl} alt="external" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setImageUrl(null)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center leading-none"
                      >×</button>
                    </div>
                  )}
                  {images.length < 10 && images.length > 0 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-16 h-16 flex-shrink-0 rounded-lg border-2 border-dashed ${borderIn} hover:border-brand-500 flex items-center justify-center ${txtMuted} hover:text-brand-400 transition text-2xl font-light`}
                    >+</button>
                  )}
                </div>

                {/* Count + carousel badge */}
                {images.length > 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs ${txtFaint}`}>{images.length}/10</span>
                    {images.length >= 2 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded ${d ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>carrossel</span>
                    )}
                  </div>
                )}

                <button
                  onClick={handleGenerateAll}
                  disabled={isGenerating}
                  className="mt-3 w-full px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition"
                >
                  {isGenerating ? t('generating') : t('generateWithAI')}
                </button>

                <div className="mt-3">
                  <label className={`block text-xs ${txtMuted} mb-1.5`}>{t('aspectRatio')}</label>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as typeof aspectRatio)}
                    className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} text-sm focus:outline-none focus:border-brand-500`}
                  >
                    <option value="1/1">{t('square')}</option>
                    <option value="4/5">{t('portrait')}</option>
                    <option value="1.91/1">{t('landscape')}</option>
                  </select>
                </div>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed ${borderIn} rounded-lg p-6 text-center hover:border-brand-500 hover:bg-brand-500/5 transition`}
              >
                <div className={txtMuted}>
                  <div className="text-3xl mb-1">📸</div>
                  <p className="text-sm">{t('clickToSelect')}</p>
                  <p className={`text-xs ${txtFaint} mt-1`}>Até 10 imagens · Max 10MB cada · JPG, PNG</p>
                </div>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />
          </div>

          {/* Caption */}
          <div>
            <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('caption')}</label>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t('captionPlaceholder')}
              rows={4}
              className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-400 focus:outline-none focus:border-brand-500 resize-none text-sm`}
            />
            <p className={`text-xs ${txtFaint} mt-1`}>{caption.length} {t('characters')}</p>
          </div>

          {/* Hashtags */}
          <div>
            <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('hashtags')}</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder={t('hashtagsPlaceholder')}
              className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-400 focus:outline-none focus:border-brand-500 text-sm`}
            />
          </div>

          {/* Purchase instructions */}
          <div>
            <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('purchaseInstructions')}</label>
            <textarea
              value={purchaseInstructions}
              onChange={(e) => { setPurchaseInstructions(e.target.value); localStorage.setItem('ig_purchase_instructions', e.target.value); }}
              placeholder={t('purchaseInstructionsPlaceholder')}
              rows={2}
              className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-400 focus:outline-none focus:border-brand-500 resize-none text-sm`}
            />
          </div>

          {/* Product toggle + price */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => { setIsProduct(v => !v); if (isProduct) setPrice(''); }}
                className={`relative w-9 h-5 rounded-full transition-colors ${isProduct ? 'bg-brand-600' : toggleOff}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isProduct ? 'translate-x-4' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-sm font-medium ${txtSub}`}>{t('isProduct')}</span>
            </label>
            {isProduct && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs ${txtMuted} mb-1.5`}>{t('reference')}</label>
                  <input
                    type="text"
                    value={productRef}
                    onChange={(e) => setProductRef(e.target.value)}
                    placeholder={t('referencePlaceholder')}
                    className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-400 focus:outline-none focus:border-brand-500 text-sm`}
                  />
                </div>
                <div>
                  <label className={`block text-xs ${txtMuted} mb-1.5`}>{t('price')}</label>
                  <div className="flex items-center gap-1.5">
                    <span className={`${txtMuted} text-sm font-medium flex-shrink-0`}>€</span>
                    <input
                      type="text"
                      value={price}
                      onChange={(e) => setPrice(e.target.value)}
                      placeholder="0,00"
                      className={`flex-1 min-w-0 px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-400 focus:outline-none focus:border-brand-500 text-sm`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Feedback messages */}
          {error && <div className="p-3 rounded-lg bg-red-900/50 text-red-300 border border-red-700 text-sm">{error}</div>}
          {success && <div className="p-3 rounded-lg bg-green-900/50 text-green-300 border border-green-700 text-sm">{success}</div>}
          {copySuccess && <div className="p-3 rounded-lg bg-blue-900/50 text-blue-300 border border-blue-700 text-sm">{t('copied')}</div>}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleCopyToClipboard}
              disabled={!caption.trim()}
              className={`flex-1 px-3 py-2 rounded-lg ${btnSec} disabled:cursor-not-allowed ${txt} transition text-sm`}
            >{t('copy')}</button>
            <button
              onClick={handlePublish}
              disabled={isLoading || (images.length === 0 && !imageUrl) || !caption.trim()}
              className={`flex-1 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 ${btnSecDis} ${btnDisTxt} disabled:cursor-not-allowed text-white font-medium transition text-sm`}
            >{isLoading ? t('publishing') : t('publish')}</button>
          </div>
        </div>
      </div>

      {/* ── Right: Live Preview ── */}
      <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-w-0 ${bg}`}>
        <div className={`flex-shrink-0 border-b ${border} px-5 py-[13px]`}>
          <p className={`text-xs font-semibold ${txtMuted} uppercase tracking-wider`}>{t('preview')}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* IG post card */}
          <div className={d ? 'bg-black' : 'bg-white'}>
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400 flex-shrink-0" />
              <div>
                <p className={`${txt} text-sm font-semibold leading-tight`}>{t('previewYou')}</p>
                <p className={`${txtMuted} text-xs`}>{t('previewNow')}</p>
              </div>
              <span className={`ml-auto ${txtMuted} text-xl leading-none`}>···</span>
            </div>

            <div className="relative w-full overflow-hidden" style={{ aspectRatio }}>
              {previewImage ? (
                <img src={previewImage} alt="Post" className="w-full h-full object-cover" />
              ) : (
                <div className={`w-full h-full ${d ? 'bg-gray-800' : 'bg-gray-100'} flex items-center justify-center`}>
                  <span className="text-6xl opacity-20">📸</span>
                </div>
              )}

              {/* Carousel navigation — only when multiple uploaded images */}
              {images.length > 1 && (
                <>
                  {/* Prev arrow */}
                  {clampedPreviewIndex > 0 && (
                    <button
                      onClick={() => setPreviewIndex(i => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm transition"
                    >‹</button>
                  )}
                  {/* Next arrow */}
                  {clampedPreviewIndex < images.length - 1 && (
                    <button
                      onClick={() => setPreviewIndex(i => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center text-sm transition"
                    >›</button>
                  )}
                  {/* Image counter */}
                  <span className="absolute top-2 right-2 text-[10px] bg-black/50 text-white px-1.5 py-0.5 rounded-full">
                    {clampedPreviewIndex + 1}/{images.length}
                  </span>
                  {/* Dots */}
                  <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setPreviewIndex(i)}
                        className={`w-1.5 h-1.5 rounded-full transition-colors ${i === clampedPreviewIndex ? 'bg-white' : 'bg-white/40'}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center gap-4 px-4 py-3">
              <svg className={`w-6 h-6 ${txt}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
              <svg className={`w-6 h-6 ${txt}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <svg className={`w-6 h-6 ${txt}`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
              <svg className={`w-6 h-6 ${txt} ml-auto`} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </div>

            <div className="px-4 pb-5 space-y-2">
              <p className={`${txt} text-sm leading-relaxed`}>
                <span className="font-semibold">{t('previewYou')} </span>
                {previewCaption}
              </p>
              {purchaseInstructions.trim() && (
                <p className={`${txtSub} text-sm leading-relaxed whitespace-pre-wrap`}>{purchaseInstructions.trim()}</p>
              )}
              {isProduct && (productRef.trim() || price.trim()) && (
                <div className="space-y-0.5">
                  {productRef.trim() && <p className={`${txt} text-sm`}>Ref: {productRef.trim()}</p>}
                  {price.trim() && <p className={`${txt} text-sm font-semibold`}>{t('priceLabel')} {price.trim()}€</p>}
                </div>
              )}
              {previewTags.length > 0 && (
                <p className="text-blue-500 text-sm leading-snug">{previewTags.join(' ')}</p>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
