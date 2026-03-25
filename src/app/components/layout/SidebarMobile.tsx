'use client';

import { Conversation } from '../../types';
import SidebarContent from './SidebarContent';
import { AlleracLogo } from '../ui/AlleracLogo';

interface SidebarMobileProps {
  isSidebarOpen: boolean;
  isDarkMode: boolean;
  onClose: () => void;
  conversations: Conversation[];
  currentConversationId: string | null;
  loadConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  pinConversation: (conversationId: string, pinned: boolean) => void;
  renameConversation: (conversationId: string, title: string) => void;
  showWorkspace?: boolean;
  showHealth?: boolean;
}

export default function SidebarMobile({
  isSidebarOpen,
  isDarkMode,
  onClose,
  conversations,
  currentConversationId,
  loadConversation,
  deleteConversation,
  pinConversation,
  renameConversation,
  showWorkspace,
  showHealth,
}: SidebarMobileProps) {
  const d = isDarkMode;
  return (
    <div className={`fixed inset-y-0 left-0 z-50 w-[80%] max-w-xs flex flex-col border-r transform transition-transform duration-300 ${
      isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
    } ${d ? 'bg-gray-900 text-white border-gray-800' : 'bg-white text-gray-900 border-gray-200'}`}>
      {/* Header — matches ChatHeader style */}
      <div>
        <div className="px-3 pb-2 flex items-center gap-3" style={{ paddingTop: 'calc(0.5rem + env(safe-area-inset-top, 0px))' }}>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors flex-shrink-0 ${d ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-500 hover:bg-gray-100'}`}
            title="Close Sidebar"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <AlleracLogo height={28} variant={d ? 'dark' : 'light'} />
        </div>
      </div>

      <SidebarContent
        conversations={conversations}
        currentConversationId={currentConversationId}
        loadConversation={loadConversation}
        deleteConversation={deleteConversation}
        pinConversation={pinConversation}
        renameConversation={renameConversation}
        isDarkMode={isDarkMode}
        showWorkspace={showWorkspace}
        showHealth={showHealth}
      />
    </div>
  );
}
