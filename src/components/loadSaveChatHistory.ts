// loadSaveChatHistory.ts
export function loadChatHistory() {
    if (typeof window === 'undefined') return [];
    const saved = localStorage.getItem('chat_history');
    return saved ? JSON.parse(saved) : [];
  }
  
  export function saveChatHistory(messages: Array<{role: string; content: string}>) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('chat_history', JSON.stringify(messages));
  }
  