'use client';

import { useState, useEffect, useRef } from 'react';
import * as skillActions from '@/app/actions/skills';
import { TOOL_REGISTRY } from '@/app/tools/tools';

interface DomainBinding {
  domain_slug: string;
  skill_id: string | null;
  skill_name: string | null;
  display_name: string | null;
}

interface Skill {
  id: string;
  name: string;
  display_name: string;
  content?: string;
}

const DOMAINS = [
  { slug: 'chat',    label: 'Chat',    icon: '💬' },
  { slug: 'code',    label: 'Code',    icon: '💻' },
  { slug: 'recipes', label: 'Recipes', icon: '🍳' },
  { slug: 'finance', label: 'Finance', icon: '💰' },
  { slug: 'health',  label: 'Health',  icon: '❤️' },
  { slug: 'write',   label: 'Content', icon: '✍️' },
  { slug: 'social',  label: 'Social',  icon: '📸' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  isDarkMode?: boolean;
}

export default function DomainSkillsModal({ isOpen, onClose, userId, isDarkMode = false }: Props) {
  const d = isDarkMode;
  const [bindings, setBindings] = useState<DomainBinding[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingSkill, setEditingSkill] = useState<Skill | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editTools, setEditTools] = useState<string[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const load = async () => {
    setLoading(true);
    const [b, s] = await Promise.all([
      skillActions.getAllDomainSkillDefaults(),
      skillActions.getAllSkills(userId),
    ]);
    setBindings(b);
    setSkills(s as Skill[]);
    setLoading(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === backdropRef.current) onClose();
  };

  const handleChange = async (domainSlug: string, skillId: string) => {
    setSaving(domainSlug);
    await skillActions.setDomainSkillDefault(domainSlug, skillId || null);
    await load();
    setSaving(null);
  };

  const handleEditSkill = async (skillId: string | null) => {
    if (!skillId) return;
    const skill = skills.find(s => s.id === skillId);
    if (!skill) return;
    const tools = await skillActions.getSkillTools(skillId);
    setEditingSkill(skill);
    setEditContent(skill.content || '');
    setEditTools(tools);
  };

  const handleSaveSkill = async () => {
    if (!editingSkill) return;
    setEditSaving(true);
    await Promise.all([
      skillActions.updateSkill(editingSkill.id, { systemPrompt: editContent }),
      skillActions.setSkillTools(editingSkill.id, editTools),
    ]);
    await load();
    setEditingSkill(null);
    setEditSaving(false);
  };

  const toggleTool = (toolName: string) => {
    setEditTools(prev =>
      prev.includes(toolName) ? prev.filter(t => t !== toolName) : [...prev, toolName]
    );
  };

  const toolGroups = TOOL_REGISTRY.reduce<Record<string, typeof TOOL_REGISTRY>>((acc, tool) => {
    (acc[tool.group] ??= []).push(tool);
    return acc;
  }, {});

  const getBinding = (slug: string) => bindings.find(b => b.domain_slug === slug);

  if (!isOpen) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4"
      onClick={handleBackdropClick}
    >
      <div className={`backdrop-blur-md shadow-xl w-full sm:max-w-2xl sm:rounded-lg rounded-t-2xl max-h-[95dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col ${
        d ? 'bg-gray-800/95 border-t sm:border border-gray-700' : 'bg-white/95 border-t sm:border border-gray-200'
      }`}>

        {/* Mobile drag indicator */}
        <div className="flex justify-center pt-2 sm:hidden">
          <div className={`w-10 h-1 rounded-full ${d ? 'bg-gray-600' : 'bg-gray-300'}`} />
        </div>

        {/* Header */}
        <div className={`px-4 py-3 sm:p-4 border-b flex items-center justify-between flex-shrink-0 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-700 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">🌐</span>
            </div>
            <div>
              {editingSkill ? (
                <>
                  <h2 className={`text-base sm:text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                    Edit Skill
                  </h2>
                  <p className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{editingSkill.display_name}</p>
                </>
              ) : (
                <h2 className={`text-base sm:text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                  Domain Skills
                </h2>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {editingSkill && (
              <button
                onClick={() => setEditingSkill(null)}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                title="Back to domains"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className={`p-1.5 sm:p-2 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          ) : editingSkill ? (
            <div className="flex flex-col gap-5">
              {/* System prompt */}
              <div className="flex flex-col gap-2">
                <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>System Prompt</label>
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={10}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none ${
                    d ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'
                  }`}
                />
              </div>

              {/* Tools */}
              <div className="flex flex-col gap-3">
                <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Tools</label>
                {Object.entries(toolGroups).map(([group, tools]) => (
                  <div key={group}>
                    <p className={`text-xs font-medium mb-1.5 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{group}</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {tools.map(tool => (
                        <label
                          key={tool.name}
                          className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                            editTools.includes(tool.name)
                              ? d ? 'border-indigo-500 bg-indigo-900/30' : 'border-indigo-300 bg-indigo-50'
                              : d ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={editTools.includes(tool.name)}
                            onChange={() => toggleTool(tool.name)}
                            className="mt-0.5 accent-indigo-600 flex-shrink-0"
                          />
                          <div>
                            <p className={`text-xs font-medium ${d ? 'text-gray-200' : 'text-gray-800'}`}>{tool.label}</p>
                            <p className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>{tool.description}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={handleSaveSkill}
                  disabled={editSaving}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                >
                  {editSaving ? 'Saving...' : 'Save Skill'}
                </button>
                <button
                  onClick={() => setEditingSkill(null)}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className={`text-sm mb-4 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                Assign a default skill to each domain. New conversations will start with that skill active.
              </p>
              {DOMAINS.map(domain => {
                const binding = getBinding(domain.slug);
                const isSaving = saving === domain.slug;
                return (
                  <div key={domain.slug} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    d ? 'border-gray-700 hover:border-gray-600 bg-gray-700/30' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
                  }`}>
                    <div className="flex items-center gap-2 w-28 flex-shrink-0">
                      <span className="text-base">{domain.icon}</span>
                      <span className={`text-sm font-medium ${d ? 'text-gray-200' : 'text-gray-800'}`}>{domain.label}</span>
                    </div>
                    <select
                      value={binding?.skill_id ?? ''}
                      onChange={e => handleChange(domain.slug, e.target.value)}
                      disabled={isSaving}
                      className={`flex-1 px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 ${
                        d ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
                      }`}
                    >
                      <option value="">— No default skill —</option>
                      {skills.map(skill => (
                        <option key={skill.id} value={skill.id}>{skill.display_name}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleEditSkill(binding?.skill_id ?? null)}
                      disabled={!binding?.skill_id || isSaving}
                      title="Edit skill prompt"
                      className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                        binding?.skill_id && !isSaving
                          ? d ? 'text-gray-400 hover:text-indigo-400 hover:bg-gray-700' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'
                          : 'opacity-30 cursor-not-allowed text-gray-400'
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    {isSaving && <span className={`text-xs flex-shrink-0 ${d ? 'text-gray-500' : 'text-gray-400'}`}>Saving...</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
