'use client';

import { createContext, useContext, ReactNode } from 'react';

export interface ToolCallEvent {
  name: string;
  args: any;
  ts: number;
}

interface DomainContextValue {
  isDark: boolean;
  lastToolCall: ToolCallEvent | null;
  setLastToolCall: (event: ToolCallEvent) => void;
  postContext: string;
  setPostContext: (ctx: string) => void;
}

const DomainContext = createContext<DomainContextValue>({
  isDark: true,
  lastToolCall: null,
  setLastToolCall: () => {},
  postContext: '',
  setPostContext: () => {},
});

export function useDomainContext() {
  return useContext(DomainContext);
}

export function DomainProvider({
  value,
  children,
}: {
  value: DomainContextValue;
  children: ReactNode;
}) {
  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>;
}
