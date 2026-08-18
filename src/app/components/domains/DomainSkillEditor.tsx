'use client';

import { useState } from 'react';
import { TOOL_REGISTRY } from '@/app/tools/tools';
import { MODELS } from '@/app/services/llm/models';

export interface Skill {
  id: string;
  name: string;
  display_name: string;
  content?: string;
}

export interface DomainModelSettings {
  inheritGlobal: boolean;
  modelId: string | null;
  fallbackModelId: string | null;
  temperature: number | null;
  maxTokens: number | null;
  localOnly: boolean;
}

export interface EditingState {
  domain: { slug: string; label: string; icon: string };
  skillId: string | null;
  content: string;
  tools: string[];
  modelSettings: DomainModelSettings;
}

interface ToolbarProps {
  domains: { slug: string; label: string; icon: string }[];
  selectedSlug: string;
  onSelectDomain: (slug: string) => void;
  skills: Skill[];
  editing: EditingState;
  globalModelId: string | null;
  isDark: boolean;
  saving: boolean;
  loading: boolean;
  onChange: (next: EditingState) => void;
  onSkillChange: (skillId: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

export function DomainToolbar({
  domains, selectedSlug, onSelectDomain, skills, editing, globalModelId,
  isDark: d, saving, loading, onChange, onSkillChange, onSave, onRevert,
}: ToolbarProps) {
  const [modelSettingsOpen, setModelSettingsOpen] = useState(false);
  const inputCls = `px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    d ? 'border-gray-600 bg-gray-800 text-gray-100' : 'border-gray-300 bg-white text-gray-900'
  }`;

  return (
    <div className={`flex flex-col gap-2.5 px-4 py-3 border-b flex-shrink-0 ${d ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
      <div className="flex flex-wrap items-center gap-2.5">
        <select value={selectedSlug} onChange={e => onSelectDomain(e.target.value)} className={inputCls}>
          {domains.map(domain => (
            <option key={domain.slug} value={domain.slug}>{domain.icon} {domain.label}</option>
          ))}
        </select>

        <select
          value={editing.skillId ?? ''}
          onChange={e => onSkillChange(e.target.value)}
          disabled={loading}
          className={inputCls}
        >
          <option value="">— No default skill —</option>
          {skills.map(skill => (
            <option key={skill.id} value={skill.id}>{skill.display_name}</option>
          ))}
        </select>

        <button
          onClick={() => setModelSettingsOpen(prev => !prev)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            d ? 'border-gray-600 text-gray-300 hover:bg-gray-800' : 'border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
        >
          Model: {editing.modelSettings.inheritGlobal
            ? (MODELS.find(m => m.id === globalModelId)?.name ?? 'global')
            : (MODELS.find(m => m.id === editing.modelSettings.modelId)?.name ?? 'Select…')} {modelSettingsOpen ? '▲' : '▼'}
        </button>

        <div className="flex-1" />

        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onRevert}
          disabled={saving || loading}
          className={`px-4 py-1.5 rounded-lg transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Revert
        </button>
      </div>

      {modelSettingsOpen && (
        <div className={`flex flex-col gap-3 p-3 rounded-lg border ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={editing.modelSettings.inheritGlobal}
              onChange={e => onChange({
                ...editing,
                modelSettings: {
                  ...editing.modelSettings,
                  inheritGlobal: e.target.checked,
                  modelId: e.target.checked
                    ? editing.modelSettings.modelId
                    : (editing.modelSettings.modelId ?? MODELS[0]?.id ?? null),
                },
              })}
              className="accent-indigo-600"
            />
            <span className={`text-xs ${d ? 'text-gray-300' : 'text-gray-600'}`}>Inherit global model settings</span>
          </label>

          {!editing.modelSettings.inheritGlobal && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Primary model</label>
                  <select
                    value={editing.modelSettings.modelId ?? ''}
                    onChange={e => onChange({
                      ...editing,
                      modelSettings: { ...editing.modelSettings, modelId: e.target.value || null },
                    })}
                    className={`w-full px-3 py-2 mt-1 border rounded-lg text-sm ${d ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
                  >
                    {MODELS.filter(model => !editing.modelSettings.localOnly || model.provider === 'ollama')
                      .map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Fallback model</label>
                  <select
                    value={editing.modelSettings.fallbackModelId ?? ''}
                    onChange={e => onChange({
                      ...editing,
                      modelSettings: { ...editing.modelSettings, fallbackModelId: e.target.value || null },
                    })}
                    className={`w-full px-3 py-2 mt-1 border rounded-lg text-sm ${d ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
                  >
                    <option value="">No fallback</option>
                    {MODELS.filter(model => !editing.modelSettings.localOnly || model.provider === 'ollama')
                      .map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Temperature</label>
                  <input
                    type="number" min="0" max="2" step="0.1"
                    value={editing.modelSettings.temperature ?? 0.7}
                    onChange={e => onChange({
                      ...editing,
                      modelSettings: { ...editing.modelSettings, temperature: Number(e.target.value) },
                    })}
                    className={`w-full px-3 py-2 mt-1 border rounded-lg text-sm ${d ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
                  />
                </div>
                <div>
                  <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Max tokens</label>
                  <input
                    type="number" min="128" max="32768" step="128"
                    value={editing.modelSettings.maxTokens ?? 2000}
                    onChange={e => onChange({
                      ...editing,
                      modelSettings: { ...editing.modelSettings, maxTokens: Number(e.target.value) },
                    })}
                    className={`w-full px-3 py-2 mt-1 border rounded-lg text-sm ${d ? 'border-gray-600 bg-gray-700 text-gray-100' : 'border-gray-300 bg-white text-gray-900'}`}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editing.modelSettings.localOnly}
                  onChange={e => {
                    const localOnly = e.target.checked;
                    const primary = MODELS.find(m => m.id === editing.modelSettings.modelId);
                    onChange({
                      ...editing,
                      modelSettings: {
                        ...editing.modelSettings,
                        localOnly,
                        modelId: localOnly && primary?.provider !== 'ollama'
                          ? (MODELS.find(m => m.provider === 'ollama')?.id ?? null)
                          : editing.modelSettings.modelId,
                        fallbackModelId: localOnly ? null : editing.modelSettings.fallbackModelId,
                      },
                    });
                  }}
                  className="accent-indigo-600"
                />
                <span className={`text-xs ${d ? 'text-gray-300' : 'text-gray-600'}`}>Local models only (privacy)</span>
              </label>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface SystemPromptPanelProps {
  content: string;
  disabled: boolean;
  isDark: boolean;
  onChange: (content: string) => void;
}

export function SystemPromptPanel({ content, disabled, isDark: d, onChange }: SystemPromptPanelProps) {
  return (
    <div className="flex flex-col h-full p-4 sm:p-5 gap-2">
      <label className={`text-xs font-semibold uppercase tracking-wide flex-shrink-0 ${d ? 'text-gray-400' : 'text-gray-500'}`}>System Prompt</label>
      {disabled ? (
        <p className={`text-sm ${d ? 'text-gray-500' : 'text-gray-400'}`}>Select a skill to edit its system prompt.</p>
      ) : (
        <textarea
          value={content}
          onChange={e => onChange(e.target.value)}
          className={`flex-1 w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none ${
            d ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'
          }`}
        />
      )}
    </div>
  );
}

interface ToolsPanelProps {
  tools: string[];
  disabled: boolean;
  isDark: boolean;
  onChange: (tools: string[]) => void;
}

export function ToolsPanel({ tools, disabled, isDark: d, onChange }: ToolsPanelProps) {
  const toolGroups = TOOL_REGISTRY.reduce<Record<string, typeof TOOL_REGISTRY>>((acc, tool) => {
    (acc[tool.group] ??= []).push(tool);
    return acc;
  }, {});

  const toggleTool = (toolName: string) => {
    onChange(tools.includes(toolName) ? tools.filter(t => t !== toolName) : [...tools, toolName]);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-4 sm:p-5 gap-3">
      <label className={`text-xs font-semibold uppercase tracking-wide flex-shrink-0 ${d ? 'text-gray-400' : 'text-gray-500'}`}>Tools</label>
      {disabled ? (
        <p className={`text-sm ${d ? 'text-gray-500' : 'text-gray-400'}`}>Select a skill to configure its tools.</p>
      ) : (
        Object.entries(toolGroups).map(([group, groupTools]) => (
          <div key={group}>
            <p className={`text-xs font-medium mb-1.5 ${d ? 'text-gray-500' : 'text-gray-400'}`}>{group}</p>
            <div className="flex flex-col gap-1.5">
              {groupTools.map(tool => (
                <label
                  key={tool.name}
                  className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                    tools.includes(tool.name)
                      ? d ? 'border-indigo-500 bg-indigo-900/30' : 'border-indigo-300 bg-indigo-50'
                      : d ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={tools.includes(tool.name)}
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
        ))
      )}
    </div>
  );
}
