'use client';

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

interface Props {
  editing: EditingState;
  skills: Skill[];
  globalModelId: string | null;
  isDark: boolean;
  saving: boolean;
  loading: boolean;
  onChange: (next: EditingState) => void;
  onSkillChange: (skillId: string) => void;
  onSave: () => void;
  onRevert: () => void;
}

export default function DomainSkillEditor({
  editing, skills, globalModelId, isDark: d, saving, loading, onChange, onSkillChange, onSave, onRevert,
}: Props) {
  const toolGroups = TOOL_REGISTRY.reduce<Record<string, typeof TOOL_REGISTRY>>((acc, tool) => {
    (acc[tool.group] ??= []).push(tool);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-400 to-indigo-700 flex items-center justify-center flex-shrink-0">
          <span className="text-lg">{editing.domain.icon}</span>
        </div>
        <div>
          <h2 className={`text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>{editing.domain.label}</h2>
          <p className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>
            {skills.find(s => s.id === editing.skillId)?.display_name ?? 'No skill'}
          </p>
        </div>
      </div>

      {/* Model strategy */}
      <div className={`flex flex-col gap-3 p-3 rounded-lg border ${d ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>AI Model</label>
            <p className={`text-xs mt-1 ${d ? 'text-gray-500' : 'text-gray-400'}`}>
              {editing.modelSettings.inheritGlobal
                ? `Effective: ${MODELS.find(m => m.id === globalModelId)?.name ?? 'global model'}`
                : `Effective: ${MODELS.find(m => m.id === editing.modelSettings.modelId)?.name ?? 'Select a model'}`}
            </p>
          </div>
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
            <span className={`text-xs ${d ? 'text-gray-300' : 'text-gray-600'}`}>Inherit global</span>
          </label>
        </div>

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

      {/* Skill selector */}
      <div className="flex flex-col gap-2">
        <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>Skill</label>
        <select
          value={editing.skillId ?? ''}
          onChange={e => onSkillChange(e.target.value)}
          disabled={loading}
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

      {editing.skillId && (
        <>
          <div className="flex flex-col gap-2">
            <label className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>System Prompt</label>
            <textarea
              value={editing.content}
              onChange={e => onChange({ ...editing, content: e.target.value })}
              rows={14}
              className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm resize-none ${
                d ? 'border-gray-600 bg-gray-700 text-gray-100 placeholder-gray-500' : 'border-gray-300 bg-white text-gray-900'
              }`}
            />
          </div>

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
                        onChange={() => onChange({
                          ...editing,
                          tools: editing.tools.includes(tool.name)
                            ? editing.tools.filter(t => t !== tool.name)
                            : [...editing.tools, tool.name],
                        })}
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
          onClick={onSave}
          disabled={saving}
          className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={onRevert}
          disabled={saving || loading}
          className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed ${d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
        >
          Revert
        </button>
      </div>
    </div>
  );
}
