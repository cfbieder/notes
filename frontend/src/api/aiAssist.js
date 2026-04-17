import { api, getAccessToken } from './client.js';

export const aiAssistApi = {
  config: () => api.get('/ai-assist/config'),
  models: () => api.get('/ai-assist/models'),
  estimate: ({ prompt, noteIds }) => api.post('/ai-assist/estimate', { prompt, noteIds }),
  generate: ({ prompt, noteIds, model, condense }) =>
    api.post('/ai-assist/generate', { prompt, noteIds, model, condense }),

  // Streaming variant — uses fetch + ReadableStream so we don't need EventSource.
  // onChunk(text) is invoked for each token as it arrives.
  // Returns the final {model, sources, ...} metadata when the stream completes.
  // Throws on network error or if the server emits an {error: ...} line.
  async generateStream({ prompt, noteIds, model, condense }, { onChunk, signal } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    const token = getAccessToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/v1/ai-assist/generate', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({ prompt, noteIds, model, condense, stream: true }),
      signal
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || `Stream error ${res.status}`);
      err.status = res.status;
      err.body = body;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let meta = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) continue;
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        if (obj.error) throw new Error(obj.error);
        if (obj.chunk) onChunk?.(obj.chunk);
        if (obj.done) meta = obj;
      }
    }
    return meta;
  }
};
