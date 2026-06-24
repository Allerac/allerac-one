type DateLike = Date | string | null | undefined;

function iso(value: DateLike): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function conversationDto(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.title,
    domainSlug: row.domain_slug ?? null,
    pinned: Boolean(row.pinned),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export function messageDto(row: Record<string, any>) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    agentRunId: row.agent_run_id ?? null,
    createdAt: iso(row.created_at),
  };
}
