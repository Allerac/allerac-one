'use client';

import { useState, useEffect } from 'react';
import { MODELS } from '@/app/services/llm/models';
import * as setupActions from '@/app/actions/setup';

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  isDarkMode: boolean;
}

interface AvailableModels {
  ollama: Set<string>;
  github: Set<string>;
  gemini: Set<string>;
}

interface DownloadProgress {
  modelId: string;
  progress: number;
  status: string;
}

export default function ModelSelector({ selectedModel, onModelChange, isDarkMode }: ModelSelectorProps) {
  const [availableModels, setAvailableModels] = useState<AvailableModels>({
    ollama: new Set(),
    github: new Set(),
    gemini: new Set(),
  });
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Check which models are available on startup
  useEffect(() => {
    checkAvailableModels();
  }, []);

  const checkAvailableModels = async () => {
    setIsLoading(true);
    try {
      const result = await setupActions.getOllamaModels();
      const ollamaModels = new Set(
        result.success ? result.models.map((m: any) => m.name || m) : []
      );
      setAvailableModels({
        ollama: ollamaModels,
        github: new Set(MODELS.filter(m => m.provider === 'github').map(m => m.id)),
        gemini: new Set(MODELS.filter(m => m.provider === 'gemini').map(m => m.id)),
      });
    } catch (error) {
      console.error('Failed to check available models:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const isModelAvailable = (model: typeof MODELS[0]): boolean => {
    if (model.provider === 'ollama') {
      // Check both exact match and with :latest suffix
      return availableModels.ollama.has(model.id) || availableModels.ollama.has(`${model.id}:latest`);
    }
    return true; // Cloud models are always "available" (need tokens)
  };

  const handleDownloadModel = async (modelId: string) => {
    setDownloadingModel(modelId);
    setDownloadError(null);
    setDownloadProgress({ modelId, progress: 0, status: 'Iniciando...' });

    try {
      const response = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });

      if (!response.ok) {
        throw new Error('Failed to start download');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let downloadComplete = false;

      if (!reader) {
        throw new Error('No response body');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              if (event.error) {
                throw new Error(event.error);
              }

              if (event.status === 'complete') {
                downloadComplete = true;
                setDownloadProgress({ modelId, progress: 100, status: 'Download concluído!' });
                break;
              }

              // Update progress based on event status
              let statusText = event.status || 'Baixando...';
              let progressPercent = event.progress || 0;

              if (event.total && event.completed) {
                progressPercent = Math.round((event.completed / event.total) * 100);
              }

              setDownloadProgress({
                modelId,
                progress: progressPercent,
                status: statusText,
              });
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        if (downloadComplete) break;
      }

      // Refresh available models after download
      await checkAvailableModels();
      onModelChange(modelId);
    } catch (error: any) {
      setDownloadError(error.message || 'Failed to download model');
    } finally {
      setDownloadingModel(null);
      setTimeout(() => setDownloadProgress(null), 2000);
    }
  };

  const selectedModelObj = MODELS.find(m => m.id === selectedModel);
  const isSelectedAvailable = selectedModelObj ? isModelAvailable(selectedModelObj) : true;

  return (
    <div className="relative">
      {/* Main dropdown button */}
      <button
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
        className={`w-full px-3 py-2 rounded-lg border transition-colors flex items-center justify-between ${
          isDarkMode
            ? 'border-gray-600 bg-gray-700 hover:bg-gray-650 text-gray-100'
            : 'border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-900'
        }`}
      >
        <span className="text-sm font-medium truncate">
          {selectedModelObj?.name || 'Select Model'}
          {selectedModelObj && !isSelectedAvailable && (
            <span className="ml-2 text-xs text-orange-400">📥 Download needed</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isDropdownOpen && (
        <div
          className={`absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-lg z-50 max-h-80 overflow-y-auto ${
            isDarkMode ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'
          }`}
        >
          {MODELS.map((model) => {
            const isAvailable = isModelAvailable(model);
            const isSelected = model.id === selectedModel;
            const isDownloading = downloadingModel === model.id;

            return (
              <div key={model.id}>
                {isAvailable ? (
                  // Available model: clickable
                  <button
                    onClick={() => {
                      onModelChange(model.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 transition-colors border-b last:border-b-0 ${
                      isSelected
                        ? isDarkMode
                          ? 'bg-indigo-900/60 text-indigo-300'
                          : 'bg-indigo-50 text-indigo-600'
                        : isDarkMode
                          ? 'hover:bg-gray-700 text-gray-100'
                          : 'hover:bg-gray-100 text-gray-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{model.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{model.name}</div>
                          <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                            {model.description}
                          </div>
                        </div>
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                ) : (
                  // Unavailable Ollama model: show download button or progress
                  <div
                    className={`px-3 py-2 border-b last:border-b-0 ${
                      isDarkMode ? 'bg-gray-750 border-gray-600' : 'bg-orange-50 border-orange-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{model.icon}</span>
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{model.name}</div>
                          <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            {model.description}
                          </div>
                        </div>
                      </div>
                      {isDownloading && downloadProgress?.modelId === model.id ? (
                        <div className="flex-shrink-0 w-32">
                          <div className="mb-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-xs font-medium">{downloadProgress.progress}%</span>
                              <span className="text-xs text-gray-500 truncate max-w-[120px]">{downloadProgress.status}</span>
                            </div>
                          </div>
                          <div
                            className={`w-full h-2 rounded-full overflow-hidden ${
                              isDarkMode ? 'bg-gray-600' : 'bg-gray-300'
                            }`}
                          >
                            <div
                              className={`h-full transition-all ${
                                isDarkMode ? 'bg-orange-500' : 'bg-orange-500'
                              }`}
                              style={{ width: `${downloadProgress.progress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleDownloadModel(model.id)}
                          disabled={isDownloading}
                          className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
                            isDownloading
                              ? isDarkMode
                                ? 'bg-gray-600 text-gray-400 cursor-wait'
                                : 'bg-gray-300 text-gray-600 cursor-wait'
                              : isDarkMode
                                ? 'bg-orange-600 text-orange-50 hover:bg-orange-700'
                                : 'bg-orange-500 text-white hover:bg-orange-600'
                          }`}
                        >
                          {isDownloading ? '⏳' : '📥'} {isDownloading ? 'Downloading...' : 'Download'}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {downloadError && (
            <div className={`px-3 py-2 text-xs ${isDarkMode ? 'bg-red-900/30 text-red-300' : 'bg-red-50 text-red-600'}`}>
              ❌ {downloadError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
