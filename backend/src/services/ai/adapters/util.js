'use strict';

// Shared helpers for cloud adapters.

const DEFAULT_TIMEOUT_MS = parseInt(process.env.LLM_GENERATE_TIMEOUT_MS, 10) || 180_000;

// Build an AbortSignal that fires on either the caller's signal or a timeout.
// Returns { signal, cleanup }. cleanup() must be called in a finally block.
function withTimeout(userSignal, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs || DEFAULT_TIMEOUT_MS);
  let signal = controller.signal;
  if (userSignal) {
    if (typeof AbortSignal.any === 'function') {
      signal = AbortSignal.any([userSignal, controller.signal]);
    } else {
      userSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }
  return { signal, cleanup: () => clearTimeout(timer) };
}

// SECURITY: adapter errors must never carry the API key or the upstream
// response body (which can echo request context, including auth headers). This
// produces a safe, status-only message.
function providerError(provider, status) {
  return new Error(`${provider} request failed with HTTP ${status}`);
}

module.exports = { withTimeout, providerError, DEFAULT_TIMEOUT_MS };
