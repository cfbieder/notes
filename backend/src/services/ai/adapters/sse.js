'use strict';

// Shared Server-Sent-Events reader for cloud adapters (OpenAI + Anthropic both
// stream `data: <json>` lines). Reads a fetch Response body and invokes
// onData(payloadString) for each `data:` payload, skipping the OpenAI `[DONE]`
// sentinel. Exported standalone so it can be unit-tested with a fake Response
// (e.g. `new Response("data: {...}\n\n")`) — no network required.

async function streamSse(res, onData) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line || !line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        onData(payload);
      }
    }
    // Flush a final buffered data line with no trailing newline.
    const last = buffer.trim();
    if (last.startsWith('data:')) {
      const payload = last.slice(5).trim();
      if (payload && payload !== '[DONE]') onData(payload);
    }
  } finally {
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

module.exports = { streamSse };
