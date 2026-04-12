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
}

export default function InstagramPostModal({
  userId,
  onClose,
  onSuccess,
  initialCaption,
  initialTags,
  initialImageBase64,
  initialImagePreview,
}: InstagramPostModalProps) {
  const [imageBase64, setImageBase64] = useState<string | null>(initialImageBase64 ?? null);
  const [imagePreview, setImagePreview] = useState<string | null>(initialImagePreview ?? null);
  const [caption, setCaption] = useState(initialCaption ?? '');
  const [tags, setTags] = useState(initialTags ?? '');
  const [isLoading, setIsLoading] = useState(false);
  const [isGeneratingCaption, setIsGeneratingCaption] = useState(false);
  const [isGeneratingTags, setIsGeneratingTags] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
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
    if (!imageBase64) {
      setError('Please select an image first');
      return;
    }

    setIsGeneratingCaption(true);
    setError('');
    try {
      const result = await generateCaption(imageBase64, userId);
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

  const handlePublish = async () => {
    if (!imageBase64) {
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
      const fullCaption = tags ? `${caption}\n\n${tags}` : caption;
      const result = await publishInstagramPost(userId, imageBase64, fullCaption);

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
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="w-full h-64 object-cover rounded-lg"
                />
                <button
                  onClick={() => {
                    setImageBase64(null);
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

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:cursor-not-allowed text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handlePublish}
              disabled={isLoading || !imageBase64 || !caption.trim()}
              className="flex-1 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium transition"
            >
              {isLoading ? 'Publishing...' : 'Post to Instagram'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
