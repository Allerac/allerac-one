'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import * as userActions from '@/app/actions/user';
import * as memoryActions from '@/app/actions/memory';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  isDarkMode: boolean;
  userId: string | null;
  githubToken?: string;
  userName?: string;
  domainSlug: string;
}

interface LearnedInstruction {
  id: string;
  instruction: string;
  source: 'explicit' | 'distilled';
  evidence: string | null;
  createdAt: string;
}

interface Memory {
  id: string;
  summary: string;
  key_topics: string[];
  importance_score: number;
  created_at: string;
}

export default function MyAlleracModal({
  isOpen,
  onClose,
  isDarkMode,
  userId,
  domainSlug,
}: Props) {
  const d = isDarkMode;
  const [baseInstructions, setBaseInstructions] = useState('');
  const [learnedInstructions, setLearnedInstructions] = useState<LearnedInstruction[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !userId) return;
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) setLoading(true);
        return Promise.all([
          userActions.getDomainInstructionDetails(domainSlug),
          memoryActions.getRecentSummaries(10, 1, domainSlug),
        ]);
      })
      .then(([details, recentMemories]) => {
        if (!active) return;
        setBaseInstructions(details.baseContent);
        setLearnedInstructions(details.instructions);
        setMemories(recentMemories);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [isOpen, userId, domainSlug]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const revoke = async (instructionId: string) => {
    setRevokingId(instructionId);
    const result = await userActions.revokeDomainInstruction(domainSlug, instructionId);
    if (result.success) {
      setLearnedInstructions(current => current.filter(item => item.id !== instructionId));
    }
    setRevokingId(null);
  };

  if (!isOpen) return null;
  const domainLabel = domainSlug.charAt(0).toUpperCase() + domainSlug.slice(1);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`backdrop-blur-md rounded-xl shadow-xl w-full max-w-2xl max-h-[85dvh] flex flex-col ${
        d ? 'bg-gray-800/95 border border-gray-700' : 'bg-white/95 border border-gray-200'
      }`}>
        <div className={`px-6 py-5 border-b ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src="/icon-nobg-purple.svg" alt="Allerac" className="w-6 h-6" />
              <div>
                <h2 className={`text-lg font-semibold ${d ? 'text-gray-100' : 'text-gray-900'}`}>About this Allerac</h2>
                <p className={`text-xs ${d ? 'text-gray-400' : 'text-gray-500'}`}>{domainLabel} domain</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close" className={d ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}>
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <p className={`text-sm ${d ? 'text-gray-400' : 'text-gray-600'}`}>
            Allerac learns durable preferences and rules from conversation. Review or revoke what it has learned for this domain.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link href="/memory" onClick={onClose} className={`rounded-lg border p-3 text-sm transition ${
              d ? 'border-gray-700 hover:bg-gray-700 text-gray-200' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}>
              <span className="block font-medium">Memory</span>
              <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Search and manage memories</span>
            </Link>
            <Link href="/memory/documents" onClick={onClose} className={`rounded-lg border p-3 text-sm transition ${
              d ? 'border-gray-700 hover:bg-gray-700 text-gray-200' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}>
              <span className="block font-medium">Documents</span>
              <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Manage RAG documents</span>
            </Link>
            <Link href="/jobs" onClick={onClose} className={`rounded-lg border p-3 text-sm transition ${
              d ? 'border-gray-700 hover:bg-gray-700 text-gray-200' : 'border-gray-200 hover:bg-gray-50 text-gray-700'
            }`}>
              <span className="block font-medium">Jobs</span>
              <span className={`text-xs ${d ? 'text-gray-500' : 'text-gray-400'}`}>Review scheduled tasks</span>
            </Link>
          </div>

          {loading ? (
            <p className={`text-sm py-8 text-center ${d ? 'text-gray-500' : 'text-gray-400'}`}>Loading…</p>
          ) : (
            <>
              {baseInstructions && (
                <div className={`rounded-lg border p-4 ${d ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                  <div className={`text-xs font-semibold uppercase tracking-wide mb-2 ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                    Existing configuration
                  </div>
                  <pre className={`text-sm whitespace-pre-wrap font-sans ${d ? 'text-gray-300' : 'text-gray-700'}`}>
                    {baseInstructions}
                  </pre>
                </div>
              )}

              <div className="space-y-2">
                <div className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                  Memories
                </div>
                {memories.length === 0 ? (
                  <p className={`text-sm py-4 text-center ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                    No memories saved for this domain yet.
                  </p>
                ) : memories.map(memory => (
                  <div key={memory.id} className={`rounded-lg border p-3 ${
                    d ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-white'
                  }`}>
                    <p className={`text-sm ${d ? 'text-gray-200' : 'text-gray-800'}`}>{memory.summary}</p>
                    <div className={`mt-2 flex flex-wrap items-center gap-2 text-[11px] ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                      <span>Importance {memory.importance_score}/10</span>
                      <span>·</span>
                      <span>{new Date(memory.created_at).toLocaleDateString()}</span>
                      {memory.key_topics?.map(topic => (
                        <span key={topic} className={`rounded px-1.5 py-0.5 ${
                          d ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className={`text-xs font-semibold uppercase tracking-wide ${d ? 'text-gray-400' : 'text-gray-500'}`}>
                  Learned instructions
                </div>
                {learnedInstructions.length === 0 ? (
                  <p className={`text-sm py-6 text-center ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                    No learned instructions yet. Teach Allerac naturally in conversation.
                  </p>
                ) : learnedInstructions.map(item => (
                  <div key={item.id} className={`rounded-lg border p-3 flex gap-3 ${
                    d ? 'border-gray-700 bg-gray-900/40' : 'border-gray-200 bg-white'
                  }`}>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${d ? 'text-gray-200' : 'text-gray-800'}`}>{item.instruction}</p>
                      <div className={`mt-1 flex gap-2 text-[11px] ${d ? 'text-gray-500' : 'text-gray-400'}`}>
                        <span>{item.source === 'explicit' ? 'Learned directly' : 'Distilled from conversations'}</span>
                        <span>·</span>
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                      {item.evidence && <p className={`mt-1 text-xs ${d ? 'text-gray-500' : 'text-gray-500'}`}>{item.evidence}</p>}
                    </div>
                    <button
                      onClick={() => revoke(item.id)}
                      disabled={revokingId === item.id}
                      className="self-start text-xs text-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      {revokingId === item.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`p-4 border-t ${d ? 'border-gray-700' : 'border-gray-200'}`}>
          <button onClick={onClose} className={`w-full px-4 py-2 rounded-md transition ${
            d ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}>Close</button>
        </div>
      </div>
    </div>
  );
}
