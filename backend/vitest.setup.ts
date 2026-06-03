// vitest.setup.ts
// Mock WebSocket for Supabase Realtime in older Node.js versions
if (typeof global.WebSocket === 'undefined') {
  (global as any).WebSocket = class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    
    url = '';
    readyState = 3;
    bufferedAmount = 0;
    extensions = '';
    protocol = '';
    binaryType = 'blob';
    
    onopen = null;
    onerror = null;
    onclose = null;
    onmessage = null;
    
    constructor(url: string) {
      this.url = url;
    }
    
    close() {}
    send() {}
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() { return true; }
  };
}
