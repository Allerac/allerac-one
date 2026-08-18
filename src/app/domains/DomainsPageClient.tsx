'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import * as skillActions from '@/app/actions/skills';
import * as domainActions from '@/app/actions/domains';
import { useTheme } from '@/app/context/ThemeContext';
import DomainSkillEditor, { type EditingState, type Skill } from '@/app/components/domains/DomainSkillEditor';
import DomainSkillChatPanel from '@/app/components/domains/DomainSkillChatPanel';

interface DomainBinding {
  domain_slug: string;
  skill_id: string | null;
  skill_name: string | null;
  display_name: string | null;
}

const DOMAINS = [
  { slug: 'chat',    label: 'Chat',    icon: '💬' },
  { slug: 'code',    label: 'Code',    icon: '💻' },
  { slug: 'recipes', label: 'Recipes', icon: '🍳' },
  { slug: 'finance', label: 'Finance', icon: '💰' },
  { slug: 'health',  label: 'Health',  icon: '❤️' },
  { slug: 'music',   label: 'Music',   icon: '🎵' },
  { slug: 'write',   label: 'Content', icon: '✍️' },
  { slug: 'social',  label: 'Social',  icon: '📸' },
  { slug: 'tickets', label: 'Tickets', icon: '🎫' },
  { slug: 'design',  label: 'Design',  icon: '🎨' },
  { slug: 'search',  label: 'Search',  icon: '🔍' },
  { slug: 'email',   label: 'Email',   icon: '✉️' },
  { slug: 'notes',   label: 'Notes',   icon: '📝' },
  { slug: 'jobs',    label: 'Jobs',    icon: '⏰' },
  { slug: 'memory',  label: 'Knowledge', icon: '🗂️' },
  { slug: 'robot-assistant', label: 'Robot', icon: 'R' },
  { slug: 'sales',   label: 'Sales',   icon: '📣' },
];

type MobileTab = 'list' | 'editor' | 'assistant';

export default function DomainsPageClient() {
  const router = useRouter();
  const { isDark: d } = useTheme();

  const [bindings, setBindings] = useState<DomainBinding[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [globalModelId] = useState<string | null>(
    () => typeof window !== 'undefined' ? localStorage.getItem('selected_model') : null
  );
  const [mobileTab, setMobileTab] = useState<MobileTab>('list');

  const load = async () => {
    setLoading(true);
    const [b, s] = await Promise.all([
      skillActions.getAllDomainSkillDefaults(),
      skillActions.getAllSkills(),
    ]);
    setBindings(b);
    setSkills(s as Skill[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const getBinding = (slug: string) => bindings.find(b => b.domain_slug === slug);

  const loadDomain = async (domain: typeof DOMAINS[0]) => {
    setSelectedSlug(domain.slug);
    setMobileTab('editor');
    const binding = getBinding(domain.slug);
    const skillId = binding?.skill_id ?? null;
    setLoadingEdit(true);
    const skill = skills.find(s => s.id === skillId);
    const [tools, modelSettings] = await Promise.all([
      skillId ? skillActions.getSkillTools(skillId) : Promise.resolve([]),
      domainActions.getDomainModelSettings(domain.slug),
    ]);
    setEditing({ domain, skillId, content: skill?.content || '', tools, modelSettings });
    setLoadingEdit(false);
  };

  const handleSkillChange = async (newSkillId: string) => {
    if (!editing) return;
    const skill = skills.find(s => s.id === newSkillId);
    const tools = newSkillId ? await skillActions.getSkillTools(newSkillId) : [];
    setEditing({ ...editing, skillId: newSkillId || null, content: skill?.content || '', tools });
  };

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    await skillActions.setDomainSkillDefault(editing.domain.slug, editing.skillId);
    await domainActions.saveDomainModelSettings({
      domainSlug: editing.domain.slug,
      ...editing.modelSettings,
    });
    if (editing.skillId) {
      await Promise.all([
        skillActions.updateSkill(editing.skillId, { systemPrompt: editing.content }),
        skillActions.setSkillTools(editing.skillId, editing.tools),
      ]);
    }
    await load();
    setSaving(false);
  };

  const handleRevert = () => {
    const domain = DOMAINS.find(dm => dm.slug === selectedSlug);
    if (domain) loadDomain(domain);
  };

  const handleApplied = (updatedContent: string) => {
    setEditing(prev => prev ? { ...prev, content: updatedContent } : prev);
    setSkills(prev => prev.map(s => s.id === editing?.skillId ? { ...s, content: updatedContent } : s));
  };

  const leaveDomains = () => {
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/');
  };

  const selectedSkill = editing?.skillId ? skills.find(s => s.id === editing.skillId) : null;

  return (
    <div className={`h-[100dvh] flex flex-col ${d ? 'bg-gray-950' : 'bg-gray-100'}`}>
      <div className={`px-4 py-3 border-b flex items-center justify-between flex-shrink-0 ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">🌐</span>
          <h1 className={`text-base font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>Domain Configuration</h1>
        </div>
        <button
          onClick={leaveDomains}
          className={`p-1.5 rounded-lg transition-colors ${d ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Mobile tab bar */}
      <div className={`lg:hidden flex border-b flex-shrink-0 ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        {(['list', 'editor', 'assistant'] as MobileTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-2 text-xs font-medium capitalize ${
              mobileTab === tab
                ? 'text-indigo-500 border-b-2 border-indigo-500'
                : d ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            {tab === 'list' ? 'Domains' : tab === 'editor' ? 'Editor' : 'Assistant'}
          </button>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Domain list */}
        <div className={`${mobileTab === 'list' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-64 flex-shrink-0 border-r overflow-y-auto ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-500" />
            </div>
          ) : (
            <div className="p-2 flex flex-col gap-1">
              {DOMAINS.map(domain => {
                const binding = getBinding(domain.slug);
                const active = selectedSlug === domain.slug;
                return (
                  <button
                    key={domain.slug}
                    onClick={() => loadDomain(domain)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                      active
                        ? 'bg-indigo-600 text-white'
                        : d ? 'hover:bg-gray-800 text-gray-300' : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    <span className="text-base">{domain.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{domain.label}</div>
                      <div className={`text-xs truncate ${active ? 'text-indigo-200' : d ? 'text-gray-500' : 'text-gray-400'}`}>
                        {binding?.display_name ?? 'No skill'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Editor */}
        <div className={`${mobileTab === 'editor' ? 'flex' : 'hidden'} lg:flex flex-1 overflow-y-auto p-4 sm:p-5`}>
          {loadingEdit ? (
            <div className="flex justify-center py-12 w-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500" />
            </div>
          ) : editing ? (
            <DomainSkillEditor
              editing={editing}
              skills={skills}
              globalModelId={globalModelId}
              isDark={d}
              saving={saving}
              loading={loadingEdit}
              onChange={setEditing}
              onSkillChange={handleSkillChange}
              onSave={handleSave}
              onRevert={handleRevert}
            />
          ) : (
            <p className={`text-sm ${d ? 'text-gray-400' : 'text-gray-500'}`}>
              Select a domain from the list to configure its model, skill, prompt, and tools.
            </p>
          )}
        </div>

        {/* Assistant */}
        <div className={`${mobileTab === 'assistant' ? 'flex' : 'hidden'} lg:flex flex-col w-full lg:w-[420px] flex-shrink-0 border-l ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          {editing?.skillId && selectedSkill ? (
            <DomainSkillChatPanel
              skillId={editing.skillId}
              skillName={selectedSkill.display_name}
              domainSlug={editing.domain.slug}
              defaultModelId={globalModelId}
              isDark={d}
              onApplied={handleApplied}
            />
          ) : (
            <div className="flex items-center justify-center h-full p-6">
              <p className={`text-xs text-center ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                Select a domain with a skill assigned to chat with the prompt assistant.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
