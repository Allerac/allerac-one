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

interface EditingState {
  domain: { slug: string; label: string; icon: string };
  skillId: string | null;
  content: string;
  tools: string[];
}

const DOMAINS = [
  { slug: 'chat',    label: 'Chat',    icon: '💬' },
  { slug: 'code',    label: 'Code',    icon: '💻' },
  { slug: 'recipes', label: 'Recipes', icon: '🍳' },
  { slug: 'finance', label: 'Finance', icon: '💰' },
  { slug: 'health',  label: 'Health',  icon: '❤️' },
  { slug: 'write',   label: 'Content', icon: '✍️' },
  { slug: 'social',  label: 'Social',  icon: '📸' },
  { slug: 'tickets', label: 'Tickets', icon: '🎫' },
  { slug: 'design',  label: 'Design',  icon: '🎨' },
  { slug: 'search',  label: 'Search',  icon: '🔍' },
  { slug: 'email',   label: 'Email',   icon: '✉️' },
  { slug: 'notes',   label: 'Notes',   icon: '📝' },
  { slug: 'jobs',    label: 'Jobs',    icon: '⏰' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  isDarkMode?: boolean;
}

export default function DomainSkillsModal({ isOpen, onClose, userId, isDarkMode = false }: Props) {
  const [retroMode, setRetroMode] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem('cfg-retro') !== 'off' : true
  );
  const toggleRetro = () => setRetroMode(prev => {
    const next = !prev;
    localStorage.setItem('cfg-retro', next ? 'on' : 'off');
    return next;
  });

  const d = retroMode || isDarkMode;

  const [bindings, setBindings] = useState<DomainBinding[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);

  const toolGroups = TOOL_REGISTRY.reduce<Record<string, typeof TOOL_REGISTRY>>((acc, tool) => {
    (acc[tool.group] ??= []).push(tool);
    return acc;
  }, {});

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

  const getBinding = (slug: string) => bindings.find(b => b.domain_slug === slug);

  const handleEditDomain = async (domain: typeof DOMAINS[0]) => {
    const binding = getBinding(domain.slug);
    const skillId = binding?.skill_id ?? null;
    setLoadingEdit(true);
    const skill = skills.find(s => s.id === skillId);
    const tools = skillId ? await skillActions.getSkillTools(skillId) : [];
    setEditing({ domain, skillId, content: skill?.content || '', tools });
    setLoadingEdit(false);
  };

  const handleEditSkillChange = async (newSkillId: string) => {
    if (!editing) return;
    const skill = skills.find(s => s.id === newSkillId);
    const tools = newSkillId ? await skillActions.getSkillTools(newSkillId) : [];
    setEditing({ ...editing, skillId: newSkillId || null, content: skill?.content || '', tools });
  };

  const handleSave = async () => {
    if (!editing) return;
    setEditSaving(true);
    await skillActions.setDomainSkillDefault(editing.domain.slug, editing.skillId);
    if (editing.skillId) {
      await Promise.all([
        skillActions.updateSkill(editing.skillId, { systemPrompt: editing.content }),
        skillActions.setSkillTools(editing.skillId, editing.tools),
      ]);
    }
    await load();
    setEditing(null);
    setEditSaving(false);
  };

  const toggleTool = (toolName: string) => {
    if (!editing) return;
    setEditing({
      ...editing,
      tools: editing.tools.includes(toolName)
        ? editing.tools.filter(t => t !== toolName)
        : [...editing.tools, toolName],
    });
  };

  if (!isOpen) return null;

  return (
    <>
      <style>{`
        .allerac-cfg {
          font-family: 'Courier New', Courier, monospace;
          color: #c9d1d9;
        }
        .allerac-cfg label {
          color: #8b949e !important;
          font-size: 0.72rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          font-weight: 600;
        }
        .allerac-cfg input:not([type=range]):not([type=checkbox]),
        .allerac-cfg textarea,
        .allerac-cfg select {
          background: #161b22 !important;
          border: 1px solid #30363d !important;
          color: #c9d1d9 !important;
          border-radius: 4px !important;
          font-family: inherit !important;
          font-size: 0.82rem !important;
        }
        .allerac-cfg input:focus,
        .allerac-cfg textarea:focus,
        .allerac-cfg select:focus {
          border-color: #818cf8 !important;
          outline: none !important;
          box-shadow: 0 0 0 1px #818cf820 !important;
        }
        .allerac-cfg input::placeholder,
        .allerac-cfg textarea::placeholder { color: #484f58 !important; }
        .allerac-cfg [class*="border-b"], .allerac-cfg [class*="border-t"] {
          border-color: #21262d !important;
        }
        .allerac-cfg [class*="bg-gray-700"], .allerac-cfg [class*="bg-gray-700/30"] {
          background-color: #161b22 !important;
        }
        .allerac-cfg [class*="bg-gray-600"] { background-color: #21262d !important; }
        .allerac-cfg [class*="text-gray-100"], .allerac-cfg [class*="text-gray-200"] {
          color: #e6edf3 !important;
        }
        .allerac-cfg [class*="text-gray-300"] { color: #c9d1d9 !important; }
        .allerac-cfg [class*="text-gray-400"], .allerac-cfg [class*="text-gray-500"] {
          color: #8b949e !important;
        }
        .allerac-cfg [class*="rounded-lg"], .allerac-cfg [class*="rounded-md"] {
          border-radius: 4px !important;
        }
        .allerac-cfg [class*="border-gray-700"], .allerac-cfg [class*="border-gray-600"] {
          border-color: #30363d !important;
        }
        .allerac-cfg [class*="bg-indigo-900"] { background-color: #1e1b4b !important; }
        .allerac-cfg [class*="border-indigo-500"] { border-color: #818cf8 !important; }
        .allerac-cfg [class*="text-indigo-400"] { color: #818cf8 !important; }
        .allerac-cfg [class*="bg-gray-50"], .allerac-cfg [class*="bg-gray-50/50"] {
          background-color: #161b22 !important;
        }
        .allerac-cfg [class*="bg-white"] { background-color: #0d0d0d !important; }
        .allerac-cfg [class*="text-gray-800"], .allerac-cfg [class*="text-gray-900"] {
          color: #e6edf3 !important;
        }
        .allerac-cfg [class*="border-gray-200"], .allerac-cfg [class*="border-gray-300"] {
          border-color: #30363d !important;
        }
        .allerac-cfg [class*="hover:border-gray-300"]:hover,
        .allerac-cfg [class*="hover:border-gray-600"]:hover { border-color: #484f58 !important; }
        .allerac-cfg [class*="hover:bg-gray-100"]:hover,
        .allerac-cfg [class*="hover:bg-gray-700"]:hover { background-color: #21262d !important; }
        .allerac-cfg [class*="animate-spin"] { border-bottom-color: #818cf8 !important; }
      `}</style>

      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 sm:p-4"
        onClick={handleBackdropClick}
      >
        <div
          className={`${retroMode ? 'allerac-cfg' : `backdrop-blur-md shadow-xl ${d ? 'bg-gray-800/95 border-t sm:border border-gray-700' : 'bg-white/95 border-t sm:border border-gray-200'}`} w-full sm:max-w-2xl rounded-t-sm sm:rounded max-h-[95dvh] sm:max-h-[85dvh] overflow-hidden flex flex-col`}
          style={retroMode ? { background: '#0d0d0d', border: '1px solid #30363d' } : undefined}
        >
          {/* Mobile drag indicator */}
          <div className="flex justify-center pt-2 sm:hidden">
            {retroMode
              ? <div style={{ width: 32, height: 3, background: '#30363d', borderRadius: 2 }} />
              : <div className={`w-10 h-1 rounded-full ${d ? 'bg-gray-600' : 'bg-gray-300'}`} />
            }
          </div>

          {/* Header */}
          {retroMode ? (
            <div style={{ borderBottom: '1px solid #21262d', padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ color: '#818cf8', fontSize: '0.75rem' }}>▸</span>
                <span style={{ color: '#e6edf3', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.06em' }}>
                  {editing ? `${editing.domain.icon} ${editing.domain.label}` : 'Domain Skills'}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {editing && (
                  <button onClick={() => setEditing(null)}
                    style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', padding: '2px 6px' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#8b949e')}
                    onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
                  >[←]</button>
                )}
                <button onClick={toggleRetro}
                  style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.72rem', fontFamily: 'inherit', padding: '2px 6px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#8b949e')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
                >[modern]</button>
                <button onClick={onClose}
                  style={{ background: 'none', border: 'none', color: '#484f58', cursor: 'pointer', fontSize: '0.82rem', fontFamily: 'inherit', padding: '2px 8px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#f85149')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#484f58')}
                >[×]</button>
              </div>
            </div>
          ) : (
            <div className={`px-4 py-3 sm:p-4 border-b flex items-center justify-between flex-shrink-0 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-700 flex items-center justify-center flex-shrink-0">
                  <span className="text-lg">{editing ? editing.domain.icon : '🌐'}</span>
                </div>
                <div>
                  <h2 className={`text-base sm:text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>
                    {editing ? editing.domain.label : 'Domain Skills'}
                  </h2>
                  {editing && (
                    <p className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                      {skills.find(s => s.id === editing.skillId)?.display_name ?? 'No skill'}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {editing && (
                  <button onClick={() => setEditing(null)}
                    className={`p-1.5 sm:p-2 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                    title="Back"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                )}
                <button onClick={toggleRetro}
                  className={`px-2 py-1 rounded text-xs transition-colors ${d ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                >retro</button>
                <button onClick={onClose}
                  className={`p-1.5 sm:p-2 rounded-lg transition-colors ${d ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
              </div>
            ) : editing ? (
              <div className="flex flex-col gap-5">
                {/* Skill selector */}
                <div className="flex flex-col gap-2">
                  <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Skill</label>
                  <select
                    value={editing.skillId ?? ''}
                    onChange={e => handleEditSkillChange(e.target.value)}
                    disabled={loadingEdit}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                      d ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
                    }`}
                  >
                    <option value="">— No default skill —</option>
                    {skills.map(skill => (
                      <option key={skill.id} value={skill.id}>{skill.display_name}</option>
                    ))}
                  </select>
                </div>

                {/* System prompt */}
                {editing.skillId && (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>System Prompt</label>
                      <textarea
                        value={editing.content}
                        onChange={e => setEditing({ ...editing, content: e.target.value })}
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
                                  editing.tools.includes(tool.name)
                                    ? d ? 'border-indigo-500 bg-indigo-900/30' : 'border-indigo-300 bg-indigo-50'
                                    : d ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={editing.tools.includes(tool.name)}
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
                  </>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={editSaving}
                    className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
                  >
                    {editSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className={`text-sm mb-4 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                  Edit the skill and tools for each domain.
                </p>
                {DOMAINS.map(domain => {
                  const binding = getBinding(domain.slug);
                  return (
                    <div key={domain.slug} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      d ? 'border-gray-700 hover:border-gray-600 bg-gray-700/30' : 'border-gray-200 hover:border-gray-300 bg-gray-50/50'
                    }`}>
                      <div className="flex items-center gap-2 w-28 flex-shrink-0">
                        <span className="text-base">{domain.icon}</span>
                        <span className={`text-sm font-medium ${d ? 'text-gray-200' : 'text-gray-800'}`}>{domain.label}</span>
                      </div>
                      <span className={`flex-1 text-sm truncate ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                        {binding?.display_name ?? <span className={d ? 'text-gray-600' : 'text-gray-400'}>No skill</span>}
                      </span>
                      <button
                        onClick={() => handleEditDomain(domain)}
                        title="Edit"
                        className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          d ? 'text-gray-400 hover:text-indigo-400 hover:bg-gray-700' : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-100'
                        }`}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
