'use client';

import { useEffect, useState } from 'react';
import { 
  getAllSkills, 
  createSkill, 
  updateSkill, 
  deleteSkill, 
  getSkillUsageStats,
  getUserTelegramBot,
  assignSkillToBot
} from '../../actions/skills';
import type { Skill } from '../../services/skills/skills.service';

interface SkillStats {
  count: number;
  avgRating: number;
  successRate: number;
  avgTokens: number;
}

interface SkillsLibraryProps {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
}

type Tab = 'library' | 'create' | 'edit';

export default function SkillsLibrary({
  isOpen,
  onClose,
  isDarkMode,
  userId,
}: SkillsLibraryProps) {
  const [activeTab, setActiveTab] = useState<Tab>('library');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
  const [skillStats, setSkillStats] = useState<Record<string, SkillStats>>({});
  const [hasTelegramBot, setHasTelegramBot] = useState(false);
  const [telegramBotId, setTelegramBotId] = useState<string | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    displayName: '',
    description: '',
    systemPrompt: '',
    category: '',
    shared: false,
    assignToTelegram: false,
  });

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      loadSkills();
      checkTelegramBot();
    }
  }, [isOpen, userId]);

  const checkTelegramBot = async () => {
    if (!userId) return;
    
    try {
      const bot = await getUserTelegramBot(userId);
      setHasTelegramBot(!!bot);
      setTelegramBotId(bot?.id || null);
    } catch (err) {
      console.error('Error checking telegram bot:', err);
    }
  };

  const loadSkills = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAllSkills(userId);
      setSkills(data);
      
      // Load stats for each skill
      const stats: Record<string, SkillStats> = {};
      for (const skill of data) {
        try {
          const skillStat = await getSkillUsageStats(skill.id);
          stats[skill.id] = skillStat;
        } catch (err) {
          console.error(`Error loading stats for skill ${skill.id}:`, err);
        }
      }
      setSkillStats(stats);
    } catch (err) {
      setError('Failed to load skills');
      console.error('Error loading skills:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSkill = async () => {
    if (!formData.name || !formData.displayName || !formData.systemPrompt) {
      setError('Name, display name, and system prompt are required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const newSkill = await createSkill({
        userId,
        name: formData.name.toLowerCase().replace(/\s+/g, '-'),
        displayName: formData.displayName,
        description: formData.description,
        systemPrompt: formData.systemPrompt,
        category: formData.category || undefined,
        shared: formData.shared,
      });

      console.log('[SkillsLibrary] Skill created:', newSkill);
      console.log('[SkillsLibrary] assignToTelegram:', formData.assignToTelegram);
      console.log('[SkillsLibrary] telegramBotId:', telegramBotId);

      // Assign to Telegram bot if checkbox is checked
      if (formData.assignToTelegram && telegramBotId && newSkill) {
        console.log('[SkillsLibrary] Assigning skill to bot...');
        try {
          await assignSkillToBot(telegramBotId, newSkill.id, false);
          console.log('[SkillsLibrary] Skill assigned successfully!');
        } catch (err) {
          console.error('Failed to assign skill to bot:', err);
          setError('Skill created but failed to assign to Telegram bot');
        }
      }
      
      // Reset form
      setFormData({
        name: '',
        displayName: '',
        description: '',
        systemPrompt: '',
        category: '',
        shared: false,
        assignToTelegram: false,
      });
      
      await loadSkills();
      setActiveTab('library');
    } catch (err) {
      setError('Failed to create skill');
      console.error('Error creating skill:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSkill = async () => {
    if (!selectedSkill) return;

    setLoading(true);
    setError(null);
    try {
      await updateSkill(selectedSkill.id, {
        name: formData.name.toLowerCase().replace(/\s+/g, '-'),
        displayName: formData.displayName,
        description: formData.description,
        systemPrompt: formData.systemPrompt,
        category: formData.category || undefined,
        shared: formData.shared,
      });
      
      await loadSkills();
      setSelectedSkill(null);
      setActiveTab('library');
    } catch (err) {
      setError('Failed to update skill');
      console.error('Error updating skill:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSkill = async (skillId: string) => {
    if (!confirm('Are you sure you want to delete this skill?')) return;
    if (!userId) return;

    setLoading(true);
    setError(null);
    try {
      await deleteSkill(skillId, userId);
      await loadSkills();
      if (selectedSkill?.id === skillId) {
        setSelectedSkill(null);
      }
    } catch (err) {
      setError('Failed to delete skill');
      console.error('Error deleting skill:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEditSkill = (skill: Skill) => {
    setSelectedSkill(skill);
    setFormData({
      name: skill.name,
      displayName: skill.display_name,
      description: skill.description,
      systemPrompt: skill.content,
      category: skill.category || '',
      shared: skill.shared,
      assignToTelegram: false, // Not applicable for edit
    });
    setActiveTab('edit');
  };

  const getCategoryIcon = (category: string | null) => {
    switch (category) {
      case 'assistant': return '🎯';
      case 'code': return '💻';
      case 'research': return '🔍';
      case 'creative': return '🎨';
      case 'education': return '📚';
      default: return '⚡';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col ${isDarkMode ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'}`}>
        {/* Header */}
        <div className={`p-6 border-b flex items-center justify-between ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div>
            <h2 className={`text-2xl font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              ⚡ Skills Library
            </h2>
            <p className={`text-sm mt-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Manage AI skills - specialized behaviors and capabilities for your assistants
            </p>
          </div>
          <button
            onClick={onClose}
            className={`transition-colors ${isDarkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <button
            onClick={() => setActiveTab('library')}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'library'
                ? isDarkMode
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'border-b-2 border-blue-600 text-blue-600'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            📚 Library
          </button>
          <button
            onClick={() => {
              setSelectedSkill(null);
              setFormData({
                name: '',
                displayName: '',
                description: '',
                systemPrompt: '',
                category: '',
                shared: false,
                assignToTelegram: false,
              });
              setActiveTab('create');
            }}
            className={`px-6 py-3 font-medium transition-colors ${
              activeTab === 'create'
                ? isDarkMode
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'border-b-2 border-blue-600 text-blue-600'
                : isDarkMode
                  ? 'text-gray-400 hover:text-gray-300'
                  : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            ➕ Create New
          </button>
          {selectedSkill && (
            <button
              onClick={() => setActiveTab('edit')}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === 'edit'
                  ? isDarkMode
                    ? 'border-b-2 border-blue-500 text-blue-400'
                    : 'border-b-2 border-blue-600 text-blue-600'
                  : isDarkMode
                    ? 'text-gray-400 hover:text-gray-300'
                    : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              ✏️ Edit
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className={`mb-4 p-4 rounded-lg ${isDarkMode ? 'bg-red-900/20 text-red-400 border border-red-800' : 'bg-red-50 text-red-600 border border-red-200'}`}>
              {error}
            </div>
          )}

          {/* Library Tab */}
          {activeTab === 'library' && (
            <div className="space-y-4">
              {loading && skills.length === 0 ? (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Loading skills...
                </div>
              ) : skills.length === 0 ? (
                <div className={`text-center py-12 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <p className="text-lg mb-2">No skills available yet</p>
                  <p className="text-sm">Create your first skill to get started!</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {skills.map((skill) => {
                    const stats = skillStats[skill.id];
                    return (
                      <div
                        key={skill.id}
                        className={`p-4 rounded-lg border ${isDarkMode ? 'bg-gray-700/50 border-gray-600 hover:border-gray-500' : 'bg-gray-50 border-gray-200 hover:border-gray-300'} transition-colors`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{getCategoryIcon(skill.category)}</span>
                            <div>
                              <h3 className={`font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                {skill.display_name}
                              </h3>
                              <p className={`text-xs ${isDarkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                                {skill.name}
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {skill.verified && (
                              <span className="text-blue-500" title="Verified">
                                ✓
                              </span>
                            )}
                            {skill.shared && (
                              <span className="text-green-500" title="Shared">
                                🌐
                              </span>
                            )}
                            {skill.user_id === userId && (
                              <button
                                onClick={() => handleEditSkill(skill)}
                                className={`text-sm ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                              >
                                ✏️
                              </button>
                            )}
                          </div>
                        </div>
                        
                        <p className={`text-sm mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          {skill.description}
                        </p>
                        
                        {stats && (
                          <div className={`flex gap-4 text-xs pt-3 border-t ${isDarkMode ? 'border-gray-600 text-gray-400' : 'border-gray-200 text-gray-600'}`}>
                            <span>📊 {stats.count} uses</span>
                            {stats.avgRating > 0 && <span>⭐ {stats.avgRating.toFixed(1)}</span>}
                          </div>
                        )}
                        
                        {skill.user_id === userId && (
                          <div className="mt-3 pt-3 border-t border-gray-600 flex gap-2">
                            <button
                              onClick={() => handleDeleteSkill(skill.id)}
                              className={`text-xs px-3 py-1 rounded ${isDarkMode ? 'bg-red-900/30 text-red-400 hover:bg-red-900/50' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                              disabled={loading}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Create/Edit Tab */}
          {(activeTab === 'create' || activeTab === 'edit') && (
            <div className="max-w-2xl mx-auto space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Display Name *
                </label>
                <input
                  type="text"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  placeholder="Personal Assistant"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Skill ID * <span className="text-xs text-gray-500">(lowercase, no spaces)</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  placeholder="personal-assistant"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={2}
                  className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  placeholder="Brief description of what this skill does"
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  System Prompt *
                </label>
                <textarea
                  value={formData.systemPrompt}
                  onChange={(e) => setFormData({ ...formData, systemPrompt: e.target.value })}
                  rows={8}
                  className={`w-full px-3 py-2 rounded-lg border font-mono text-sm ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                  placeholder="You are a helpful personal assistant..."
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className={`w-full px-3 py-2 rounded-lg border ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                >
                  <option value="">None</option>
                  <option value="assistant">Assistant</option>
                  <option value="code">Code</option>
                  <option value="research">Research</option>
                  <option value="creative">Creative</option>
                  <option value="education">Education</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="shared"
                  checked={formData.shared}
                  onChange={(e) => setFormData({ ...formData, shared: e.target.checked })}
                  className="rounded"
                />
                <label htmlFor="shared" className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Share this skill publicly
                </label>
              </div>

              {hasTelegramBot && activeTab === 'create' && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="assignToTelegram"
                    checked={formData.assignToTelegram}
                    onChange={(e) => setFormData({ ...formData, assignToTelegram: e.target.checked })}
                    className="rounded"
                  />
                  <label htmlFor="assignToTelegram" className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Assign to Telegram bot (available in /skills)
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  onClick={activeTab === 'create' ? handleCreateSkill : handleUpdateSkill}
                  disabled={loading}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-blue-500 hover:bg-blue-600 text-white'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {loading ? 'Saving...' : activeTab === 'create' ? 'Create Skill' : 'Update Skill'}
                </button>
                <button
                  onClick={() => {
                    setSelectedSkill(null);
                    setActiveTab('library');
                  }}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
