import { Message, Model } from '../../types';

interface ChatMessageServiceConfig {
  githubToken: string;
  tavilyApiKey: string;
  userId: string | null;
  selectedModel: string;
  systemMessage: string;
  currentConversationId: string | null;
  setCurrentConversationId: (id: string | null) => void;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  MODELS: Model[];
  TOOLS: any[];
  activeSkill?: any | null;
  preSelectedSkill?: any | null;
  onConversationCreated?: () => void;
  onConversationCreatedWithSkill?: (conversationId: string, skillId: string) => Promise<void>;
}

export class ChatMessageService {
  private config: ChatMessageServiceConfig;

  constructor(config: ChatMessageServiceConfig) {
    this.config = config;
  }

  async sendMessage(inputMessage: string, imageAttachments?: Array<{ file: File; preview: string }>, activeSkill?: any | null) {
    if (!inputMessage.trim() && (!imageAttachments || imageAttachments.length === 0)) return;
    if (!this.config.userId) return;

    const messageContent = inputMessage || 'What do you see in this image?';

    // Build display content (text + image previews for the UI)
    let displayContent: string | any[] = messageContent;
    if (imageAttachments && imageAttachments.length > 0) {
      displayContent = [
        { type: 'text', text: messageContent },
        ...imageAttachments.map(img => ({
          type: 'image_url',
          image_url: { url: img.preview },
        })),
      ];
    }

    // 1. Add user message for immediate display
    this.config.setMessages(prev => [
      ...prev,
      { role: 'user', content: displayContent, timestamp: new Date() } as Message,
    ]);

    // 2. Add empty assistant placeholder so the UI shows a typing indicator
    this.config.setMessages(prev => [
      ...prev,
      { role: 'assistant', content: '', timestamp: new Date() } as Message,
    ]);

    try {
      // 3. Encode images to base64 data URLs for the server
      let encodedImages: Array<{ url: string }> | undefined;
      if (imageAttachments && imageAttachments.length > 0) {
        encodedImages = await Promise.all(
          imageAttachments.map(img => new Promise<{ url: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ url: reader.result as string });
            reader.readAsDataURL(img.file);
          }))
        );
      }

      // Determine provider from model config
      const currentModel = this.config.MODELS.find(m => m.id === this.config.selectedModel);
      const provider = currentModel?.provider || 'github';

      // 4. POST to the SSE Route Handler
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          conversationId: this.config.currentConversationId,
          model: this.config.selectedModel,
          provider,
          imageAttachments: encodedImages,
          // Pass pre-selected skill ID only for new conversations so the server
          // activates and uses it on the very first message
          preSelectedSkillId: !this.config.currentConversationId && this.config.preSelectedSkill
            ? this.config.preSelectedSkill.id
            : undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const text = await response.text().catch(() => `HTTP ${response.status}`);
        throw new Error(text || `HTTP error ${response.status}`);
      }

      // 5. Parse the SSE stream, updating the assistant placeholder as tokens arrive
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event: any;
          try {
            event = JSON.parse(line.slice(6));
          } catch { continue; }

          if (event.type === 'token') {
            // Append token to the last (assistant placeholder) message
            this.config.setMessages(prev => {
              const msgs = [...prev];
              const last = msgs[msgs.length - 1];
              if (last && last.role === 'assistant') {
                msgs[msgs.length - 1] = {
                  ...last,
                  content: (last.content as string) + event.content,
                };
              }
              return msgs;
            });
          } else if (event.type === 'done') {
            const newConvId: string = event.conversationId;
            const wasNew = !this.config.currentConversationId;

            this.config.setCurrentConversationId(newConvId);

            if (wasNew) {
              if (this.config.onConversationCreated) {
                this.config.onConversationCreated();
              }
              // Activate pre-selected skill on the new conversation
              if (this.config.preSelectedSkill && this.config.onConversationCreatedWithSkill) {
                console.log('[Skills] Auto-activating pre-selected skill:', this.config.preSelectedSkill.name);
                await this.config.onConversationCreatedWithSkill(newConvId, this.config.preSelectedSkill.id);
              }
            }
          } else if (event.type === 'error') {
            throw new Error(event.message || 'Server error');
          }
        }
      }
    } catch (error: any) {
      console.error('❌ Error sending message:', error);
      // Replace empty assistant placeholder with the error
      this.config.setMessages(prev => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && last.content === '') {
          msgs[msgs.length - 1] = {
            ...last,
            content: error.message,
          };
        } else {
          msgs.push({ role: 'assistant', content: error.message, timestamp: new Date() } as Message);
        }
        return msgs;
      });
    }
  }
}
