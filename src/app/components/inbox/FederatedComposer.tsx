'use client';

import { useEffect, useRef, useState } from 'react';

export const MAX_MESSAGE_CHARS = 4000;

interface Props {
  isDark: boolean;
  placeholder: string;
  disabled: boolean;
  onSend: (text: string) => void;
}

/** Lean composer for remote agents: same look as ChatInput, text only (no models, files or tools). */
export default function FederatedComposer({ isDark: d, placeholder, disabled, onSend }: Props) {
  const [draft, setDraft] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  const send = () => {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft('');
    onSend(text);
  };

  return (
    <div data-name="chat-input-box" className={`rounded-2xl shadow-lg ${d ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
      <textarea
        ref={ref}
        aria-label="Message"
        value={draft}
        maxLength={MAX_MESSAGE_CHARS}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(); } }}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        style={{ minHeight: '48px', maxHeight: '200px', lineHeight: '28px' }}
        className={`w-full resize-none overflow-y-auto bg-transparent px-4 pb-2 pt-3 focus:outline-none disabled:opacity-50 ${d ? 'text-gray-100 placeholder-gray-400' : 'text-black placeholder-gray-400'}`}
      />
      <div className="flex items-center justify-end px-2 pb-2">
        <button
          type="button"
          aria-label="Send"
          onClick={send}
          disabled={disabled || !draft.trim()}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
            draft.trim() ? 'bg-brand-900 text-white hover:bg-brand-950' : d ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-7-7l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
