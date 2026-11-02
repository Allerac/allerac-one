'use client';

import AgentShell from './AgentShell';
import ChatClient from '@/app/chat/ChatClient';

interface Props {
  isAdmin: boolean;
  localName: string;
}

/** This Unit's own agent: the regular local chat, embedded in the agents shell. */
export default function LocalAgentClient({ isAdmin, localName }: Props) {
  return (
    <AgentShell activeKey="self" isAdmin={isAdmin} localName={localName}>
      {() => (
        <div className="min-h-0 flex-1" data-testid="local-agent-chat">
          <ChatClient domainSlug="chat" defaultSidebarCollapsed isAdmin={isAdmin} embedded />
        </div>
      )}
    </AgentShell>
  );
}
