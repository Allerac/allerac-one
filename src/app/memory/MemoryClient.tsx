'use client';

import DomainLayout from '@/app/components/layout/DomainLayout';
import MemoryGraphPanel from './MemoryGraphPanel';

interface Props {
  userId: string;
  userName: string | null;
  userEmail: string;
  isAdmin: boolean;
  defaultSkillName?: string;
}

export default function MemoryClient(props: Props) {
  return (
    <DomainLayout
      userId={props.userId}
      userName={props.userName}
      userEmail={props.userEmail}
      isAdmin={props.isAdmin}
      domainId="memory"
      defaultSkillName={props.defaultSkillName}
    >
      <MemoryGraphPanel />
    </DomainLayout>
  );
}
