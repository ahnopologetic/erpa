import { VoiceMemo, ChatSession, VoiceMemoStorage } from '~types/voice-memo';

export class VoiceMemoStorageManager implements VoiceMemoStorage {
    private readonly CHAT_SESSIONS_KEY = 'voice_memo_chat_sessions';
    private readonly VOICE_MEMOS_KEY = 'voice_memo_data';

    async saveChatSession(session: ChatSession): Promise<void> {
        try {
            const existingSessions = await this.getAllChatSessions();
            const sessionIndex = existingSessions.findIndex(s => s.id === session.id);

            if (sessionIndex >= 0) {
                existingSessions[sessionIndex] = session;
            } else {
                existingSessions.push(session);
            }

            await chrome.storage.local.set({
                [this.CHAT_SESSIONS_KEY]: existingSessions
            });
        } catch (error) {
            console.error('Failed to save chat session:', error);
            throw error;
        }
    }

    async loadChatSession(tabId: number, url: string): Promise<ChatSession | null> {
        try {
            const sessions = await this.getAllChatSessions();
            const session = sessions.find(s => s.tabId === tabId && s.url === url);
            return session || null;
        } catch (error) {
            console.error('Failed to load chat session:', error);
            return null;
        }
    }

    async saveVoiceMemo(voiceMemo: VoiceMemo): Promise<void> {
        try {
            const result = await chrome.storage.local.get([this.VOICE_MEMOS_KEY]);
            const voiceMemos: Record<string, VoiceMemo> = result[this.VOICE_MEMOS_KEY] || {};

            voiceMemos[voiceMemo.id] = voiceMemo;

            await chrome.storage.local.set({
                [this.VOICE_MEMOS_KEY]: voiceMemos
            });
        } catch (error) {
            console.error('Failed to save voice memo:', error);
            throw error;
        }
    }

    async loadVoiceMemo(id: string): Promise<VoiceMemo | null> {
        try {
            const result = await chrome.storage.local.get([this.VOICE_MEMOS_KEY]);
            const voiceMemos: Record<string, VoiceMemo> = result[this.VOICE_MEMOS_KEY] || {};

            return voiceMemos[id] || null;
        } catch (error) {
            console.error('Failed to load voice memo:', error);
            return null;
        }
    }

    async deleteVoiceMemo(id: string): Promise<void> {
        try {
            const result = await chrome.storage.local.get([this.VOICE_MEMOS_KEY]);
            const voiceMemos: Record<string, VoiceMemo> = result[this.VOICE_MEMOS_KEY] || {};

            delete voiceMemos[id];

            await chrome.storage.local.set({
                [this.VOICE_MEMOS_KEY]: voiceMemos
            });
        } catch (error) {
            console.error('Failed to delete voice memo:', error);
            throw error;
        }
    }

    async getAllChatSessions(): Promise<ChatSession[]> {
        try {
            const result = await chrome.storage.local.get([this.CHAT_SESSIONS_KEY]);
            return result[this.CHAT_SESSIONS_KEY] || [];
        } catch (error) {
            console.error('Failed to get chat sessions:', error);
            return [];
        }
    }

    // Utility methods
    generateVoiceMemoId(): string {
        return `voice_memo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    generateChatSessionId(tabId: number, url: string): string {
        return `chat_session_${tabId}_${btoa(url).replace(/[^a-zA-Z0-9]/g, '')}`;
    }

    // Clean up old sessions (optional utility)
    async cleanupOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
        try {
            const sessions = await this.getAllChatSessions();
            const cutoffTime = Date.now() - maxAge;
            const activeSessions = sessions.filter(session => session.updatedAt > cutoffTime);

            if (activeSessions.length !== sessions.length) {
                await chrome.storage.local.set({
                    [this.CHAT_SESSIONS_KEY]: activeSessions
                });
            }
        } catch (error) {
            console.error('Failed to cleanup old sessions:', error);
        }
    }
}

// Export singleton instance
export const voiceMemoStorage = new VoiceMemoStorageManager();
