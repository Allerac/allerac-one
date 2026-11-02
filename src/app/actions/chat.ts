'use server';

import { ChatService } from '@/app/services/database/chat.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';
import { getOrCreatePrimaryConversation, insertTopicMarker } from '@/app/services/chat/primary-conversation';
import * as history from '@/app/services/chat/chat-history.service';

const chatService = new ChatService();

export async function loadSystemMessage() {
    const user = await requireCurrentUser();
    return await chatService.loadSystemMessage(user.id);
}

export async function saveSystemMessage(systemMessage: string) {
    const user = await requireCurrentUser();
    return await chatService.saveSystemMessage(user.id, systemMessage);
}

export async function loadConversations(domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);
    return await chatService.loadConversations(user.id, domainSlug);
}

export async function loadMessages(conversationId: string) {
    const user = await requireCurrentUser();
    return await chatService.loadMessages(conversationId, user.id);
}

export async function createConversation(title: string, domainSlug?: string | null) {
    const user = await requireCurrentUser();
    if (domainSlug) await assertDomainAccess(user, domainSlug);
    return await chatService.createConversation(user.id, title, domainSlug);
}

export async function saveMessage(conversationId: string, role: string, content: string) {
    const user = await requireCurrentUser();
    return await chatService.saveMessage(conversationId, role, content, { userId: user.id });
}

export async function deleteConversation(conversationId: string) {
    const user = await requireCurrentUser();
    return await chatService.deleteConversation(conversationId, user.id);
}

export async function pinConversation(conversationId: string, pinned: boolean) {
    const user = await requireCurrentUser();
    return await chatService.pinConversation(conversationId, pinned, user.id);
}

export async function renameConversation(conversationId: string, title: string) {
    const user = await requireCurrentUser();
    return await chatService.renameConversation(conversationId, title, user.id);
}

/** Phase 4a: the user's single conversation with the local agent, created lazily. */
export async function openPrimaryConversation(domainSlug: string = 'chat') {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, domainSlug);
    return await getOrCreatePrimaryConversation({ userId: user.id, domain: domainSlug });
}

/** Phase 4a: "New topic" inserts a marker; nothing is deleted. */
export async function startNewTopic(conversationId: string) {
    const user = await requireCurrentUser();
    return { success: await insertTopicMarker(conversationId, user.id) };
}

// ---------------------------------------------------------------- Phase 4b

/** Latest page (or the page older than `before`) of a conversation the user owns. */
export async function loadMessagePage(conversationId: string, before?: string | null) {
    const user = await requireCurrentUser();
    return await history.loadMessagePage(conversationId, user.id, { before });
}

/** Newer page after a jump into the middle of a conversation. */
export async function loadNewerMessagePage(conversationId: string, after: string) {
    const user = await requireCurrentUser();
    return await history.loadNewerMessages(conversationId, user.id, after);
}

/** The page containing a search hit. */
export async function loadMessagePageAround(conversationId: string, messageId: string) {
    const user = await requireCurrentUser();
    return await history.loadPageAround(conversationId, user.id, messageId);
}

/** Old (non-primary) agent chat conversations, opened read-only. */
export async function loadArchivedConversations() {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'chat');
    return await history.listArchivedConversations(user.id);
}

/** Full-text + semantic search over the user's own agent chat history. */
export async function searchChatHistory(query: string) {
    const user = await requireCurrentUser();
    await assertDomainAccess(user, 'chat');
    // Catch up on segments that missed their embedding (provider down earlier).
    history.scheduleSegmentEmbedding({ userId: user.id });
    return await history.searchChatHistory(user.id, query);
}
