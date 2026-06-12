'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { generateCaption, generateTags, publishInstagramPost, publishInstagramCarousel, getInstagramRefSettings, incrementRefCounter } from '@/app/actions/instagram';
import {
  getTikTokCreatorInfo,
  getTikTokPublishStatus,
  getTikTokStatus,
  publishTikTokPhotos,
} from '@/app/actions/tiktok';
import type { TikTokCreatorInfo, TikTokPrivacyLevel } from '@/app/services/tiktok/tiktok-api.service';
import ImageEditModal from '@/app/components/instagram/ImageEditModal';
import { MODELS } from '@/app/services/llm/models';

export type SocialPlatform = 'instagram' | 'tiktok';
type TikTokPrivacy = '' | TikTokPrivacyLevel;

interface UploadedImage {
  base64: string;
  preview: string;
  name: string;
}

interface PostState {
  platform: SocialPlatform;
  caption: string;
  tags: string;
  price: string;
  productRef: string;
  isProduct: boolean;
  images?: UploadedImage[];
  imageUrl?: string | null;
  aspectRatio?: '1/1' | '4/5' | '1.91/1';
  tiktokTitle?: string;
  tiktokPrivacy?: TikTokPrivacy;
  tiktokAllowComment?: boolean;
  tiktokAllowDuet?: boolean;
  tiktokAllowStitch?: boolean;
  tiktokCommercialContent?: boolean;
  tiktokYourBrand?: boolean;
  tiktokBrandedContent?: boolean;
}

interface Props {
  userId: string;
  conversationId?: string | null;
  mobileView?: 'editor' | 'preview';
  isDarkMode?: boolean;
  externalUpdate?: { platform?: SocialPlatform; caption?: string; tags?: string; price?: string; isProduct?: boolean; imageUrl?: string; tiktokTitle?: string; timestamp: number } | null;
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

export default function SocialPostStudio({
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
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [images, setImages] = useState<UploadedImage[]>(
    initialImageBase64 && initialImagePreview
      ? [{ base64: initialImageBase64, preview: initialImagePreview, name: 'imagem carregada' }]
      : []
  );
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [aspectRatio, setAspectRatio] = useState<'1/1' | '4/5' | '1.91/1'>('1/1');
  const [tiktokTitle, setTikTokTitle] = useState('');
  const [tiktokPrivacy, setTikTokPrivacy] = useState<TikTokPrivacy>('');
  const [tiktokAllowComment, setTikTokAllowComment] = useState(false);
  const [tiktokAllowDuet, setTikTokAllowDuet] = useState(false);
  const [tiktokAllowStitch, setTikTokAllowStitch] = useState(false);
  const [tiktokCommercialContent, setTikTokCommercialContent] = useState(false);
  const [tiktokYourBrand, setTikTokYourBrand] = useState(false);
  const [tiktokBrandedContent, setTikTokBrandedContent] = useState(false);
  const [tiktokConsent, setTikTokConsent] = useState(false);
  const [tiktokAutoAddMusic, setTikTokAutoAddMusic] = useState(false);
  const [tiktokAccountName, setTikTokAccountName] = useState('');
  const [tiktokConnected, setTikTokConnected] = useState(false);
  const [tiktokCreatorInfo, setTikTokCreatorInfo] = useState<TikTokCreatorInfo | null>(null);
  const [tiktokCreatorLoading, setTikTokCreatorLoading] = useState(false);
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
  const [imageEditOpen, setImageEditOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [selectedProvider, setSelectedProvider] = useState<'github' | 'gemini' | 'anthropic' | 'ollama'>('github');
  const t = useTranslations('socialStudio');
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
    getInstagramRefSettings().then((r) => {
      setRefManaged(r.managed);
      setRefPrefix(r.prefix);
      setRefCounter(r.counter);
    });
    getTikTokStatus().then((status) => {
      setTikTokConnected(status.is_connected);
      setTikTokAccountName(status.display_name ?? '');
    }).catch(() => {
      setTikTokConnected(false);
    });
  }, []);

  useEffect(() => {
    if (platform !== 'tiktok' || !tiktokConnected || tiktokCreatorInfo || tiktokCreatorLoading) return;
    setTikTokCreatorLoading(true);
    getTikTokCreatorInfo()
      .then((result) => {
        if (result.success) {
          setTikTokCreatorInfo(result.creator);
          setTikTokAccountName(result.creator.creatorNickname);
          setTikTokPrivacy('');
          setTikTokAllowComment(false);
          setTikTokAllowDuet(false);
          setTikTokAllowStitch(false);
        } else {
          setError(result.error);
        }
      })
      .catch(() => setError(t('tiktokCreatorInfoFailed')))
      .finally(() => setTikTokCreatorLoading(false));
  }, [platform, tiktokConnected, tiktokCreatorInfo, tiktokCreatorLoading, t]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;

    setImages(current => {
      const maxImages = platform === 'tiktok' ? 35 : 10;
      const remaining = maxImages - current.length;
      if (files.length > remaining) {
        setError(t('errTooManyImages', { max: maxImages, ignored: files.length - remaining }));
      } else {
        setError('');
      }
      const toProcess = files.slice(0, remaining);
      toProcess.forEach(file => {
        if (!file.type.startsWith('image/')) return;
        const maxBytes = (platform === 'tiktok' ? 20 : 10) * 1024 * 1024;
        if (file.size > maxBytes) {
          setError(t('errFileTooLargeForPlatform', { max: platform === 'tiktok' ? 20 : 10 }));
          return;
        }
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
    const selectedImageIndex = Math.min(previewIndex, Math.max(0, images.length - 1));
    const imageInput = images[selectedImageIndex]?.base64 || imageUrl;
    if (!imageInput) { setError(t('errNoImage')); return; }
    setIsGenerating(true);
    setError('');
    try {
      const captionResult = await generateCaption(imageInput, undefined, locale, selectedModel, selectedProvider);
      if (!captionResult.success) { setError(captionResult.error); return; }
      setCaption(captionResult.caption);
      const tagsResult = await generateTags(captionResult.caption, locale, selectedModel, selectedProvider);
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
    studioStateCache.set(prevId ?? 'new', {
      platform, caption, tags, price, productRef, isProduct, images, imageUrl, aspectRatio,
      tiktokTitle, tiktokPrivacy, tiktokAllowComment, tiktokAllowDuet, tiktokAllowStitch,
      tiktokCommercialContent, tiktokYourBrand, tiktokBrandedContent,
    });

    // Restore state for the new conversation
    const saved = studioStateCache.get(conversationId ?? 'new');
    if (saved) {
      setPlatform(saved.platform ?? 'instagram');
      setCaption(saved.caption);
      setTags(saved.tags);
      setPrice(saved.price);
      setProductRef(saved.productRef ?? '');
      setIsProduct(saved.isProduct);
      setImages(saved.images ?? []);
      setImageUrl(saved.imageUrl ?? null);
      setAspectRatio(saved.aspectRatio ?? '1/1');
      setTikTokTitle(saved.tiktokTitle ?? '');
      setTikTokPrivacy(saved.tiktokPrivacy ?? '');
      setTikTokAllowComment(saved.tiktokAllowComment ?? false);
      setTikTokAllowDuet(saved.tiktokAllowDuet ?? false);
      setTikTokAllowStitch(saved.tiktokAllowStitch ?? false);
      setTikTokCommercialContent(saved.tiktokCommercialContent ?? false);
      setTikTokYourBrand(saved.tiktokYourBrand ?? false);
      setTikTokBrandedContent(saved.tiktokBrandedContent ?? false);
    } else if (prevId == null) {
      // null → real ID: first message created a new conversation — keep current state
      studioStateCache.set(conversationId ?? 'new', {
        platform, caption, tags, price, productRef, isProduct, images, imageUrl, aspectRatio,
        tiktokTitle, tiktokPrivacy, tiktokAllowComment, tiktokAllowDuet, tiktokAllowStitch,
        tiktokCommercialContent, tiktokYourBrand, tiktokBrandedContent,
      });
    } else {
      // real ID → different ID with no saved state — reset
      setCaption(''); setTags(''); setPrice(''); setProductRef(''); setIsProduct(false);
      setImages([]); setImageUrl(null); setAspectRatio('1/1');
      setPlatform('instagram'); setTikTokTitle(''); setTikTokPrivacy('');
      setTikTokAllowComment(false); setTikTokAllowDuet(false); setTikTokAllowStitch(false);
      setTikTokCommercialContent(false); setTikTokYourBrand(false); setTikTokBrandedContent(false);
      setTikTokConsent(false);
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
    onPostStateChange?.({
      platform, caption, tags, price, productRef, isProduct,
      tiktokTitle, tiktokPrivacy, tiktokAllowComment, tiktokAllowDuet, tiktokAllowStitch,
      tiktokCommercialContent, tiktokYourBrand, tiktokBrandedContent,
    });
  }, [
    platform, caption, tags, price, productRef, isProduct, tiktokTitle, tiktokPrivacy,
    tiktokAllowComment, tiktokAllowDuet, tiktokAllowStitch, tiktokCommercialContent,
    tiktokYourBrand, tiktokBrandedContent,
  ]);

  useEffect(() => {
    if (!externalUpdate) return;
    if (externalUpdate.platform !== undefined) setPlatform(externalUpdate.platform);
    if (externalUpdate.caption !== undefined) setCaption(externalUpdate.caption);
    if (externalUpdate.tags !== undefined) setTags(externalUpdate.tags);
    if (externalUpdate.price !== undefined) setPrice(externalUpdate.price);
    if (externalUpdate.isProduct !== undefined) setIsProduct(externalUpdate.isProduct);
    if (externalUpdate.imageUrl !== undefined) {
      setImageUrl(externalUpdate.imageUrl);
      setImages([]);
    }
    if (externalUpdate.tiktokTitle !== undefined) setTikTokTitle(externalUpdate.tiktokTitle);
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
    if (platform === 'tiktok') {
      if (!tiktokCreatorInfo || !tiktokPrivacy) {
        setError(t('tiktokCreatorInfoRequired'));
        return;
      }
      if (!tiktokConsent) {
        setError(t('tiktokConsentRequired'));
        return;
      }
      if (tiktokCommercialContent && !tiktokYourBrand && !tiktokBrandedContent) {
        setError(t('tiktokCommercialSelectionRequired'));
        return;
      }
      if (tiktokBrandedContent && tiktokPrivacy === 'SELF_ONLY') {
        setError(t('tiktokBrandedContentPrivate'));
        return;
      }
      if (images.length === 0 && !imageUrl) {
        setError(t('errImageRequired'));
        return;
      }
      if (!tiktokTitle.trim()) {
        setError(t('tiktokTitleRequired'));
        return;
      }

      setIsLoading(true);
      setError('');
      setSuccess(t('tiktokUploading'));
      try {
        let imagesBase64 = images.map((image) => image.base64);
        if (!imagesBase64.length && imageUrl) {
          const response = await fetch(imageUrl);
          if (!response.ok) throw new Error(t('tiktokImageFetchFailed'));
          const blob = await response.blob();
          imagesBase64 = [await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(',')[1] || String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          })];
        }

        const result = await publishTikTokPhotos({
          imagesBase64,
          title: tiktokTitle,
          description: [caption.trim(), tags.trim()].filter(Boolean).join('\n\n'),
          privacyLevel: tiktokPrivacy,
          allowComment: tiktokAllowComment,
          autoAddMusic: tiktokAutoAddMusic,
          yourBrand: tiktokYourBrand,
          brandedContent: tiktokBrandedContent,
          photoCoverIndex: clampedPreviewIndex,
        });
        if (!result.success) throw new Error(result.error);

        setSuccess(t('tiktokProcessing'));
        for (let attempt = 0; attempt < 20; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          const statusResult = await getTikTokPublishStatus(result.publishId);
          if (!statusResult.success) throw new Error(statusResult.error);
          if (statusResult.status.status === 'FAILED') {
            throw new Error(statusResult.status.failReason || 'tiktok_publish_failed');
          }
          if (statusResult.status.status === 'PUBLISH_COMPLETE') {
            setSuccess(t('tiktokPublished'));
            setImages([]); setImageUrl(null); setCaption(''); setTags(''); setTikTokTitle('');
            setTikTokPrivacy(''); setTikTokConsent(false); setTikTokCommercialContent(false);
            setTikTokYourBrand(false); setTikTokBrandedContent(false);
            studioStateCache.delete(conversationId ?? 'new');
            onSuccess?.(statusResult.status.postIds[0] || result.publishId);
            return;
          }
        }
        setSuccess(t('tiktokStillProcessing'));
      } catch (err) {
        setSuccess('');
        setError(err instanceof Error ? err.message : t('tiktokPublishFailed'));
      } finally {
        setIsLoading(false);
      }
      return;
    }
    if (images.length === 0 && !imageUrl) { setError(t('errImageRequired')); return; }
    if (!caption.trim()) { setError(t('errCaptionRequired')); return; }
    setIsLoading(true);
    setError('');
    setSuccess('');
    try {
      const fullCaption = buildFullCaption();
      let result;

      if (images.length >= 2) {
        result = await publishInstagramCarousel(images.map(i => i.base64), fullCaption);
      } else if (images.length === 1) {
        result = await publishInstagramPost(images[0].base64, fullCaption);
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
          ? await publishInstagramPost(base64ToPublish, fullCaption)
          : await fetch('/api/instagram/publish', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ caption: fullCaption, image_url: imageUrl }),
            }).then(r => r.json());
      }

      if (result.success) {
        if (isProduct && refManaged) {
          const next = await incrementRefCounter();
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
    <>
    <div className={`flex-1 flex h-full min-w-0 ${bg}`}>

      {/* ── Center: Editor ── */}
      <div className={`${mobileView === 'preview' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0 overflow-hidden border-r ${border}`}>
        {/* Header */}
        <div className={`flex-shrink-0 border-b ${border} px-5 h-12 flex justify-between items-center ${bg}`}>
          <p className={`text-xs font-semibold ${txtMuted} uppercase tracking-wider`}>{t('title')}</p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('openInstagramDM'))}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md transition-colors ${d ? 'text-gray-400 hover:bg-gray-700 hover:text-gray-200' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
              title="DM Inbox"
            >
              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              DM
            </button>
            {onClose && <button onClick={onClose} className={`${txtMuted} hover:${txt} text-xl font-light leading-none`}>×</button>}
          </div>
        </div>

        {/* Editor Fields */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">
          <div>
            <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('platform')}</label>
            <div className={`grid grid-cols-2 gap-1 p-1 rounded-lg ${d ? 'bg-gray-800' : 'bg-gray-100'}`}>
              {(['instagram', 'tiktok'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setPlatform(item);
                    setError('');
                    setSuccess('');
                  }}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition ${
                    platform === item
                      ? item === 'instagram'
                        ? 'bg-gradient-to-r from-purple-600 to-pink-500 text-white shadow'
                        : 'bg-black text-white shadow'
                      : `${txtMuted} hover:${txt}`
                  }`}
                >
                  {item === 'instagram' ? 'Instagram' : 'TikTok'}
                </button>
              ))}
            </div>
          </div>

          {platform === 'tiktok' && (
            <div className={`rounded-lg border p-3 ${d ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-sm font-medium ${txt}`}>
                {tiktokConnected
                  ? t('tiktokPostingAs', { name: tiktokAccountName || 'TikTok' })
                  : t('tiktokNotConnected')}
              </p>
              <p className={`text-xs mt-1 ${txtMuted}`}>
                {tiktokCreatorLoading ? t('tiktokLoadingCreator') : t('tiktokCreatorInfoNotice')}
              </p>
            </div>
          )}

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
                    <div
                      key={`${img.name}-${i}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setPreviewIndex(i)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setPreviewIndex(i);
                        }
                      }}
                      aria-label={t('selectImage', { number: i + 1 })}
                      aria-pressed={i === clampedPreviewIndex}
                      className={`relative w-16 h-16 flex-shrink-0 rounded-lg overflow-hidden border-2 transition ${
                        i === clampedPreviewIndex
                          ? 'border-brand-500 ring-2 ring-brand-500/30'
                          : borderIn
                      }`}
                    >
                      <img src={img.preview} alt={img.name} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setImages(prev => prev.filter((_, j) => j !== i));
                          setPreviewIndex(current => {
                            if (current > i) return current - 1;
                            if (current === i) return Math.max(0, current - 1);
                            return current;
                          });
                        }}
                        aria-label={t('removeImage', { number: i + 1 })}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/70 hover:bg-red-600 text-white text-[10px] rounded-full flex items-center justify-center leading-none"
                      >×</button>
                      {i === clampedPreviewIndex && images.length > 1 && (
                        <span className="absolute bottom-0.5 left-0.5 px-1 py-0.5 rounded bg-brand-600 text-white text-[9px] leading-none">
                          {t('selected')}
                        </span>
                      )}
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
                  {images.length < (platform === 'tiktok' ? 35 : 10) && images.length > 0 && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className={`w-16 h-16 flex-shrink-0 rounded-lg border-2 border-dashed ${borderIn} hover:border-brand-500 flex items-center justify-center ${txtMuted} hover:text-brand-400 transition text-2xl font-light`}
                    >+</button>
                  )}
                </div>

                {/* Count + carousel badge */}
                {images.length > 0 && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-xs ${txtFaint}`}>{images.length}/{platform === 'tiktok' ? 35 : 10}</span>
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
                  {isGenerating ? t('generating') : t('generateCaptionWithAI')}
                </button>

                {platform === 'instagram' && <div className="mt-3">
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
                </div>}
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border-2 border-dashed ${borderIn} rounded-lg p-6 text-center hover:border-brand-500 hover:bg-brand-500/5 transition`}
              >
                <div className={txtMuted}>
                  <div className="text-3xl mb-1">📸</div>
                  <p className="text-sm">{t('clickToSelect')}</p>
                  <p className={`text-xs ${txtFaint} mt-1`}>
                    {t('imageCountHint', { max: platform === 'tiktok' ? 35 : 10 })}
                  </p>
                </div>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageSelect} className="hidden" />

            {/* Edit with AI — only when at least 1 uploaded image */}
            {images.length > 0 && (
              <button
                onClick={() => setImageEditOpen(true)}
                className={`mt-2 w-full px-3 py-2 rounded-lg border ${borderIn} ${txtSub} hover:border-brand-500 hover:text-brand-400 text-sm transition flex items-center justify-center gap-2`}
              >
                <span>✨</span>
                <span>{t('editPhotosWithAI')}</span>
              </button>
            )}
          </div>

          {/* Caption */}
          {platform === 'tiktok' && (
            <div>
              <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('tiktokTitle')}</label>
              <input
                type="text"
                value={tiktokTitle}
                onChange={(e) => setTikTokTitle(e.target.value)}
                placeholder={t('tiktokTitlePlaceholder')}
                className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} placeholder-gray-400 focus:outline-none focus:border-brand-500 text-sm`}
              />
            </div>
          )}

          <div>
            <label className={`block text-sm font-medium ${txtSub} mb-2`}>
              {platform === 'instagram' ? t('caption') : t('description')}
            </label>
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

          {/* Instagram-specific commerce fields */}
          {platform === 'instagram' && <>
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
          </>}

          {platform === 'tiktok' && (
            <>
              <div>
                <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('privacy')}</label>
                <select
                  value={tiktokPrivacy}
                  onChange={(e) => setTikTokPrivacy(e.target.value as TikTokPrivacy)}
                  disabled={!tiktokCreatorInfo}
                  className={`w-full px-3 py-2 rounded-lg ${bgInput} border ${borderIn} ${txt} text-sm focus:outline-none focus:border-brand-500`}
                >
                  <option value="">{t('privacySelect')}</option>
                  {tiktokCreatorInfo?.privacyLevelOptions.map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={option === 'SELF_ONLY' && tiktokBrandedContent}
                    >
                      {option === 'PUBLIC_TO_EVERYONE'
                        ? t('privacyEveryone')
                        : option === 'MUTUAL_FOLLOW_FRIENDS'
                          ? t('privacyFriends')
                          : option === 'FOLLOWER_OF_CREATOR'
                            ? t('privacyFollowers')
                            : t('privacyOnlyMe')}
                    </option>
                  ))}
                </select>
                <p className={`text-xs mt-1 ${txtFaint}`}>{t('privacyCreatorInfo')}</p>
              </div>

              <div>
                <label className={`block text-sm font-medium ${txtSub} mb-2`}>{t('interactions')}</label>
                <div className="space-y-2">
                  <label className={`flex items-center gap-2 text-sm ${tiktokCreatorInfo?.commentDisabled ? txtFaint : txtSub}`}>
                    <input
                      type="checkbox"
                      checked={tiktokAllowComment}
                      disabled={!tiktokCreatorInfo || tiktokCreatorInfo.commentDisabled}
                      onChange={(e) => setTikTokAllowComment(e.target.checked)}
                      className="rounded"
                    />
                    {t('allowComments')}
                  </label>
                  {tiktokCreatorInfo?.commentDisabled && (
                    <p className={`text-xs ${txtFaint}`}>{t('commentsDisabledByCreator')}</p>
                  )}
                </div>
              </div>

              <label className={`flex items-center gap-2 text-sm ${txtSub}`}>
                <input
                  type="checkbox"
                  checked={tiktokAutoAddMusic}
                  onChange={(e) => setTikTokAutoAddMusic(e.target.checked)}
                />
                {t('autoAddMusic')}
              </label>

              <div>
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tiktokCommercialContent}
                    onChange={(e) => {
                      setTikTokCommercialContent(e.target.checked);
                      if (!e.target.checked) {
                        setTikTokYourBrand(false);
                        setTikTokBrandedContent(false);
                      }
                    }}
                  />
                  <span className={`text-sm font-medium ${txtSub}`}>{t('commercialContent')}</span>
                </label>
                {tiktokCommercialContent && (
                  <div className={`mt-3 ml-6 space-y-2 text-sm ${txtSub}`}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={tiktokYourBrand} onChange={(e) => setTikTokYourBrand(e.target.checked)} />
                      {t('yourBrand')}
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={tiktokBrandedContent}
                        disabled={tiktokPrivacy === 'SELF_ONLY'}
                        onChange={(e) => setTikTokBrandedContent(e.target.checked)}
                      />
                      {t('brandedContent')}
                    </label>
                    <p className={`text-xs ${txtFaint}`}>
                      {tiktokBrandedContent ? t('paidPartnershipLabel') : t('promotionalContentLabel')}
                    </p>
                  </div>
                )}
              </div>

              <label className={`flex items-start gap-2 text-xs ${txtMuted}`}>
                <input
                  type="checkbox"
                  checked={tiktokConsent}
                  onChange={(e) => setTikTokConsent(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  {t('tiktokConsentPrefix')}{' '}
                  <a
                    href="https://www.tiktok.com/legal/page/global/music-usage-confirmation/en"
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    {t('musicUsageConfirmation')}
                  </a>
                  {(tiktokBrandedContent || tiktokYourBrand) && (
                    <>
                      {' '}{t('and')}{' '}
                      <a
                        href="https://www.tiktok.com/legal/page/global/bc-policy/en"
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {t('brandedContentPolicy')}
                      </a>
                    </>
                  )}
                  .
                </span>
              </label>
            </>
          )}

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
              disabled={
                isLoading
                || (images.length === 0 && !imageUrl)
                || (platform === 'instagram' && !caption.trim())
                || (platform === 'tiktok' && (
                  !tiktokConnected
                  || !tiktokCreatorInfo
                  || !tiktokTitle.trim()
                  || !tiktokPrivacy
                  || !tiktokConsent
                  || (tiktokCommercialContent && !tiktokYourBrand && !tiktokBrandedContent)
                ))
              }
              className={`flex-1 px-3 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 ${btnSecDis} ${btnDisTxt} disabled:cursor-not-allowed text-white font-medium transition text-sm`}
            >{isLoading ? t('publishing') : platform === 'instagram' ? t('publishInstagram') : t('publishTikTok')}</button>
          </div>
          {platform === 'tiktok' && <p className={`text-xs ${txtFaint}`}>{t('tiktokProcessingNotice')}</p>}
        </div>
      </div>

      {/* ── Right: Live Preview ── */}
      <div className={`${mobileView === 'preview' ? 'flex' : 'hidden'} lg:flex flex-1 flex-col min-w-0 ${bg}`}>
        <div className={`flex-shrink-0 border-b ${border} px-5 h-12 flex items-center`}>
          <p className={`text-xs font-semibold ${txtMuted} uppercase tracking-wider`}>{t('preview')}</p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Platform post card */}
          {platform === 'instagram' ? (
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
          ) : (
            <div className="min-h-full bg-black text-white flex items-center justify-center p-6">
              <div className="w-full max-w-[320px]">
                <div className="relative aspect-[9/16] rounded-xl overflow-hidden bg-gray-900 border border-gray-800">
                  {previewImage ? (
                    <img src={previewImage} alt="TikTok post" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-5xl opacity-20">♪</div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black via-black/60 to-transparent">
                    <p className="text-sm font-semibold">@{tiktokAccountName || t('previewYou')}</p>
                    {tiktokTitle && <p className="text-sm mt-2 font-medium">{tiktokTitle}</p>}
                    <p className="text-sm mt-1 whitespace-pre-wrap">{previewCaption}</p>
                    {previewTags.length > 0 && <p className="text-sm mt-1">{previewTags.join(' ')}</p>}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>

    {/* Image edit modal */}

    {imageEditOpen && images[clampedPreviewIndex] && (
      <ImageEditModal
        isOpen={imageEditOpen}
        onClose={() => setImageEditOpen(false)}
        imageBase64={images[clampedPreviewIndex].base64}
        imagePreview={images[clampedPreviewIndex].preview}
        isDarkMode={isDarkMode}
        onApply={(resultBase64, resultPreview) => {
          setImages(prev => prev.map((img, i) =>
            i === clampedPreviewIndex
              ? { base64: resultBase64, preview: resultPreview, name: img.name }
              : img
          ));
          setImageEditOpen(false);
        }}
      />
    )}
    </>
  );
}
