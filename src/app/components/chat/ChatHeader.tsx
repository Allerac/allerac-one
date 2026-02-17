'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Model } from '../../types';
import type { Skill } from '../../services/skills/skills.service';

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

interface ChatHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  isDarkMode: boolean;
  selectedModel: string;
  setSelectedModel: (modelId: string) => void;
  MODELS: Model[];
  currentConversationId: string | null;
  currentConversationHasMemory: boolean;
  handleGenerateSummary: () => void;
  githubConfigured?: boolean;
  ollamaConnected?: boolean;
  ollamaModels?: OllamaModel[];
  onDownloadModel?: (modelId: string) => Promise<void>;
  userId?: string | null;
  availableSkills?: Skill[];
  activeSkill?: Skill | null;
  onActivateSkill?: (skillId: string) => Promise<void>;
  onDeactivateSkill?: () => Promise<void>;
}

export default function ChatHeader({
  isSidebarOpen,
  setIsSidebarOpen,
  isDarkMode,
  selectedModel,
  setSelectedModel,
  MODELS,
  currentConversationId,
  currentConversationHasMemory,
  handleGenerateSummary,
  githubConfigured = false,
  ollamaConnected = false,
  ollamaModels = [],
  onDownloadModel,
  userId = null,
  availableSkills = [],
  activeSkill = null,
  onActivateSkill,
  onDeactivateSkill,
}: ChatHeaderProps) {
  const t = useTranslations('system');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isSkillDropdownOpen, setIsSkillDropdownOpen] = useState(false);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const skillDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (skillDropdownRef.current && !skillDropdownRef.current.contains(event.target as Node)) {
        setIsSkillDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentModel = MODELS.find((m: Model) => m.id === selectedModel);

  // Check if a model is available/installed
  const isModelAvailable = (model: Model): boolean => {
    if (model.provider === 'github') {
      return githubConfigured;
    }
    if (model.provider === 'ollama') {
      if (!ollamaConnected) return false;
      // Cloud models are always available if Ollama is connected
      if (model.id.includes(':cloud')) return true;
      return ollamaModels.some(
        m => m.name === model.id || m.name.startsWith(model.id.split(':')[0])
      );
    }
    return false;
  };

  // Check if Ollama model can be downloaded
  const canDownloadModel = (model: Model): boolean => {
    return model.provider === 'ollama' && ollamaConnected && !isModelAvailable(model);
  };

  const handleDownload = async (e: React.MouseEvent, modelId: string) => {
    e.stopPropagation();
    if (!onDownloadModel) return;

    setDownloadingModel(modelId);
    try {
      await onDownloadModel(modelId);
    } finally {
      setDownloadingModel(null);
    }
  };

  // Get status indicator for current model
  const getStatusColor = () => {
    if (!currentModel) return 'bg-gray-400';
    return isModelAvailable(currentModel) ? 'bg-green-500' : 'bg-gray-400';
  };

  return (
    <div className={`border-b ${isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
      <div className="px-3 sm:px-6 py-4">
        <div className="flex items-center gap-3">
          {/* Mobile hamburger button - only visible on small screens */}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className={`lg:hidden p-2 rounded-lg transition-colors ${
              isDarkMode
                ? 'hover:bg-gray-700 text-gray-300'
                : 'hover:bg-gray-100 text-gray-700'
            }`}
            title={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Model selector dropdown */}
          <div className="relative flex-1" ref={dropdownRef}>
            <button
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className={`flex items-center gap-3 p-2 rounded-lg transition-colors w-full ${
                isDarkMode
                  ? 'hover:bg-gray-700'
                  : 'hover:bg-gray-100'
              }`}
            >
              <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-xl">{currentModel?.icon || '🤖'}</span>
                {/* Status indicator dot */}
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${isDarkMode ? 'border-gray-800' : 'border-white'} ${getStatusColor()}`} />
              </div>
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <h2 className={`text-lg font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {currentModel?.name || 'AI Assistant'}
                  </h2>
                  <svg
                    className={`w-4 h-4 transition-transform ${isModelDropdownOpen ? 'rotate-180' : ''} ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
                <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {currentModel?.description || 'Online'}
                </p>
              </div>
            </button>

            {/* Dropdown menu */}
            {isModelDropdownOpen && (
              <div className={`absolute top-full left-0 mt-2 w-80 rounded-lg shadow-xl border z-50 max-h-96 overflow-y-auto ${
                isDarkMode
                  ? 'bg-gray-800 border-gray-700'
                  : 'bg-white border-gray-200'
              }`}>
                {/* Cloud Models Section */}
                <div className={`px-3 py-2 text-xs font-medium ${isDarkMode ? 'text-gray-400 bg-gray-750' : 'text-gray-500 bg-gray-50'}`}>
                  ☁️ {t('cloudModels')}
                  {!githubConfigured && (
                    <span className={`ml-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      ({t('tokenRequired')})
                    </span>
                  )}
                </div>
                {MODELS.filter(m => m.provider === 'github').map((model) => {
                  const available = isModelAvailable(model);
                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        if (available) {
                          setSelectedModel(model.id);
                          setIsModelDropdownOpen(false);
                        }
                      }}
                      disabled={!available}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        !available
                          ? 'opacity-50 cursor-not-allowed'
                          : selectedModel === model.id
                            ? isDarkMode
                              ? 'bg-gray-700'
                              : 'bg-blue-50'
                            : isDarkMode
                              ? 'hover:bg-gray-700'
                              : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="relative">
                        <span className="text-xl">{model.icon}</span>
                        <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full ${available ? 'bg-green-500' : 'bg-gray-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          {model.name}
                        </div>
                        <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {model.description}
                        </div>
                      </div>
                      {selectedModel === model.id && available && (
                        <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  );
                })}

                {/* Local Models Section */}
                <div className={`px-3 py-2 text-xs font-medium border-t ${isDarkMode ? 'text-gray-400 bg-gray-750 border-gray-700' : 'text-gray-500 bg-gray-50 border-gray-200'}`}>
                  🦙 {t('localModels')}
                  {!ollamaConnected && (
                    <span className={`ml-2 ${isDarkMode ? 'text-yellow-400' : 'text-yellow-600'}`}>
                      ({t('disconnected')})
                    </span>
                  )}
                </div>
                {MODELS.filter(m => m.provider === 'ollama').map((model) => {
                  const available = isModelAvailable(model);
                  const canDownload = canDownloadModel(model);
                  const isDownloading = downloadingModel === model.id;

                  return (
                    <button
                      key={model.id}
                      onClick={() => {
                        if (available) {
                          setSelectedModel(model.id);
                          setIsModelDropdownOpen(false);
                        }
                      }}
                      disabled={!available && !canDownload}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                        !available && !canDownload
                          ? 'opacity-50 cursor-not-allowed'
                          : selectedModel === model.id
                            ? isDarkMode
                              ? 'bg-gray-700'
                              : 'bg-blue-50'
                            : isDarkMode
                              ? 'hover:bg-gray-700'
                              : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="relative">
                        <span className="text-xl">{model.icon}</span>
                        <span className={`absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full ${available ? 'bg-green-500' : 'bg-gray-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                          {model.name}
                        </div>
                        <div className={`text-xs truncate ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          {model.description}
                        </div>
                      </div>
                      {available ? (
                        selectedModel === model.id && (
                          <svg className="w-5 h-5 text-blue-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )
                      ) : canDownload ? (
                        <button
                          onClick={(e) => handleDownload(e, model.id)}
                          disabled={isDownloading}
                          className="flex-shrink-0 px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50 flex items-center gap-1"
                        >
                          {isDownloading ? (
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                          ) : (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                          )}
                        </button>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Skill selector dropdown */}
          {availableSkills.length > 0 && currentConversationId && (
            <div className="relative" ref={skillDropdownRef}>
              <button
                onClick={() => setIsSkillDropdownOpen(!isSkillDropdownOpen)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${
                  activeSkill
                    ? 'bg-purple-600 text-white hover:bg-purple-700'
                    : isDarkMode
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
                title={activeSkill ? `Active: ${activeSkill.display_name}` : 'Activate a skill'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-sm hidden sm:inline">
                  {activeSkill ? activeSkill.display_name : 'Skills'}
                </span>
                <svg
                  className={`w-3 h-3 transition-transform ${isSkillDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Skills dropdown */}
              {isSkillDropdownOpen && (
                <div className={`absolute right-0 mt-2 w-72 rounded-lg shadow-lg z-50 ${
                  isDarkMode ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}>
                  <div className="p-2">
                    <div className={`text-xs font-semibold px-3 py-2 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Available Skills
                    </div>
                    <div className="max-h-80 overflow-y-auto">
                      {activeSkill && (
                        <button
                          onClick={async () => {
                            if (onDeactivateSkill) {
                              await onDeactivateSkill();
                              setIsSkillDropdownOpen(false);
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isDarkMode
                              ? 'text-red-400 hover:bg-red-500/10'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span>Deactivate Skill</span>
                        </button>
                      )}
                      
                      {availableSkills.map((skill) => {
                        const isActive = activeSkill?.id === skill.id;
                        return (
                          <button
                            key={skill.id}
                            onClick={async () => {
                              if (!isActive && onActivateSkill) {
                                await onActivateSkill(skill.id);
                                setIsSkillDropdownOpen(false);
                              }
                            }}
                            disabled={isActive}
                            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                              isActive
                                ? isDarkMode
                                  ? 'bg-purple-500/20 text-purple-400'
                                  : 'bg-purple-50 text-purple-700'
                                : isDarkMode
                                ? 'hover:bg-gray-700 text-gray-300'
                                : 'hover:bg-gray-50 text-gray-700'
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{skill.display_name}</span>
                                {isActive && (
                                  <svg className="w-4 h-4 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              <p className={`text-xs mt-0.5 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                {skill.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {currentConversationId && (
            <button
              onClick={handleGenerateSummary}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm rounded-lg transition-colors ${
                currentConversationHasMemory
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-purple-600 hover:bg-purple-700'
              }`}
              title={currentConversationHasMemory
                ? 'This conversation is already saved in memory'
                : 'Save this conversation to long-term memory'
              }
            >
              {currentConversationHasMemory ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
