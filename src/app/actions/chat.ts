'use server';

import { ChatService } from '@/app/services/database/chat.service';
import { assertDomainAccess, requireCurrentUser } from '@/app/lib/auth-session';

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
