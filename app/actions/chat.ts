'use server';

import { ChatService } from '@/app/services/database/chat.service';

const chatService = new ChatService();

export async function loadSystemMessage(userId: string) {
    return await chatService.loadSystemMessage(userId);
}

export async function saveSystemMessage(userId: string, systemMessage: string) {
    return await chatService.saveSystemMessage(userId, systemMessage);
}

export async function loadConversations(userId: string) {
    return await chatService.loadConversations(userId);
}

export async function loadMessages(conversationId: string) {
    return await chatService.loadMessages(conversationId);
}

export async function createConversation(userId: string, title: string) {
    return await chatService.createConversation(userId, title);
}

export async function saveMessage(conversationId: string, role: string, content: string) {
    return await chatService.saveMessage(conversationId, role, content);
}

export async function deleteConversation(conversationId: string) {
    return await chatService.deleteConversation(conversationId);
}
