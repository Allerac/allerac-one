'use client';

import { useState, useRef } from 'react';
import { generateCaption, generateTags, publishInstagramPost } from '@/app/actions/instagram';

interface InstagramPostModalProps {
  userId: string;
  onClose: () => void;
  onSuccess?: (postId: string) => void;
  initialCaption?: string;
  initialTags?: string;
  initialImageBase64?: string;
  initialImagePreview?: string;
  initialImageUrl?: string;
}

export default function InstagramPostModal({
  userId,
  onClose,
  onSuccess,
  initialCaption,
  initialTags,
  initialImageBase64,
  initialImagePreview,
  initialImageUrl,
}: InstagramPostModalProps) {
  const [imageBase64, setImageBase64] = useState<string | null>(initialImageBase64 ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImagePreview ?? null);
  const [caption, setCaption] = useState(initialCaption ?? '');
  const [tags, setTags] = useState(initialTags ?? '');
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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('Image size must be less than 10MB');
      return;
    }

    setError('');

    // Read file as base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setImageBase64(result.split(',')[1] || result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateCaption = async () => {
    const imageInput = imageBase64 || imageUrl;
    if (!imageInput) {
      setError('Please select an image first');
      return;
    }

    setIsGeneratingCaption(true);
    setError('');
    try {
      const result = await generateCaption(imageInput, userId);
      if (result.success) {
        setCaption(result.caption);
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGeneratingCaption(false);
    }
  };

  const handleGenerateTags = async () => {
    setIsGeneratingTags(true);
    setError('');
    try {
      const result = await generateTags(userId, caption);
      if (result.success) {
        setTags(result.tags);
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGeneratingTags(false);
    }
  };

  const handleCopyToClipboard = async () => {
    try {
      const fullCaption = tags ? `${caption}\n\n${tags}` : caption;
      await navigator.clipboard.writeText(fullCaption);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err: any) {
      setError('Failed to copy to clipboard');
    }
  };

  const handlePublish = async () => {
    if (!imageBase64 && !imageUrl) {
      setError('Please select an image');
      return;
    }

    if (!caption.trim()) {
      setError('Please add a caption');
      return;
    }

    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      let base64ToPublish = imageBase64;

      // If only imageUrl is available, fetch and convert to base64
      if (!base64ToPublish && imageUrl) {
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          base64ToPublish = await new Promise((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              resolve(result.split(',')[1] || result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
        } catch (err) {
          console.error('Failed to fetch image, will publish with URL directly:', err);
          // Continue with imageUrl instead of base64
        }
      }

      const fullCaption = tags ? `${caption}\n\n${tags}` : caption;
      // If we have base64, use publishInstagramPost server action. Otherwise use imageUrl
      const result = base64ToPublish
        ? await publishInstagramPost(userId, base64ToPublish as string, fullCaption)
        : // For imageUrl, call the tool directly via API
          await fetch('/api/instagram/publish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caption: fullCaption, image_url: imageUrl }),
          }).then(r => r.json());

      if (result.success) {
        setSuccess(result.message);
        setTimeout(() => {
          onSuccess?.(result.postId);
          onClose();
        }, 2000);
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-700">
        {/* Header */}
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 p-6 flex justify-between items-center">
          <h2 className="text-xl font-bold text-white">Post to Instagram</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl font-light"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Image Section */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Image
            </label>
            {imagePreview || imageUrl ? (
              <div className="relative">
                <img
                  src={imagePreview || imageUrl || ''}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    setImageBase64(null);
                    setImageUrl(null);
                    setImagePreview(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm"
                >
                  Remove
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-brand-500 hover:bg-brand-500/5 transition"
              >
                <div className="text-gray-400">
                  <div className="text-4xl mb-2">📸</div>
                  <p className="text-sm">Click to select an image</p>
                  <p className="text-xs text-gray-500 mt-1">Max 10MB • JPG, PNG, GIF</p>
                </div>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>

          {/* Caption Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-300">
                Caption
              </label>
              <button
                onClick={handleGenerateCaption}
                disabled={isGeneratingCaption || !imageBase64}
                className="text-sm px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition"
              >
                {isGeneratingCaption ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Write your caption..."
              className="w-full h-24 px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              {caption.length} characters
            </p>
          </div>

          {/* Tags Section */}
          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-medium text-gray-300">
                Hashtags (optional)
              </label>
              <button
                onClick={handleGenerateTags}
                disabled={isGeneratingTags}
                className="text-sm px-3 py-1 rounded bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition"
              >
                {isGeneratingTags ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="#hashtag1 #hashtag2 #hashtag3..."
              className="w-full px-4 py-2 rounded-lg bg-gray-700 border border-gray-600 text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Separate hashtags with spaces
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-lg bg-red-900/50 text-red-300 border border-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-3 rounded-lg bg-green-900/50 text-green-300 border border-green-700 text-sm">
              {success}
            </div>
          )}

          {/* Copy Success Message */}
          {copySuccess && (
            <div className="p-3 rounded-lg bg-blue-900/50 text-blue-300 border border-blue-700 text-sm">
              Copied to clipboard! 📋
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 flex-wrap">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 min-w-32 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white transition text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCopyToClipboard}
              disabled={!caption.trim()}
              className="flex-1 min-w-32 px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 disabled:bg-gray-800 disabled:cursor-not-allowed text-white transition text-sm"
            >
              📋 Copy Text
            </button>
            <button
              onClick={handlePublish}
              disabled={isLoading || (!imageBase64 && !imageUrl) || !caption.trim()}
              className="flex-1 min-w-32 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium transition text-sm"
            >
              {isLoading ? 'Publishing...' : 'Post to Instagram'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
