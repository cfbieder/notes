'use strict';

// CR038 — encryption for AI provider API keys.
//
// The server must decrypt these keys unattended (e.g. the deep-think job runner,
// with no user session present), so a zero-knowledge scheme like the vault
// (cr-020) CANNOT be reused. Instead: AES-256-GCM with a master key held ONLY in
// the AI_KEYS_ENC_KEY env var. The key never lives in the database, so a DB
// backup on its own yields no plaintext.
//
// Stored blob layout: iv(12) || authTag(16) || ciphertext.
//
// SECURITY: never log the master key, a plaintext API key, or a decrypted value.
// Callers must treat the return of decrypt() as sensitive.

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12; // GCM standard nonce length
const TAG_LEN = 16;
const ENV_VAR = 'AI_KEYS_ENC_KEY';

// Resolve the 32-byte master key from env. Accepts 64 hex chars (openssl
// rand -hex 32). Throws (fail-closed) if missing or malformed — callers use
// isConfigured() to degrade gracefully instead of catching this.
function getMasterKey() {
  const raw = (process.env[ENV_VAR] || '').trim();
  if (!raw) {
    throw new Error(`${ENV_VAR} is not set — cannot encrypt/decrypt AI provider keys`);
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(`${ENV_VAR} must be 64 hex characters (openssl rand -hex 32)`);
  }
  return Buffer.from(raw, 'hex');
}

// True when a valid master key is configured. Lets features fail closed
// (disabled) rather than erroring when no key is present.
function isConfigured() {
  try {
    getMasterKey();
    return true;
  } catch {
    return false;
  }
}

// Encrypt a plaintext string → Buffer (iv||tag||ciphertext) for BYTEA storage.
function encrypt(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encrypt() requires a non-empty string');
  }
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]);
}

// Decrypt a Buffer produced by encrypt() → plaintext string.
// Throws on a wrong key or tampered data (GCM auth failure).
function decrypt(blob) {
  if (!Buffer.isBuffer(blob) || blob.length <= IV_LEN + TAG_LEN) {
    throw new Error('decrypt() requires a valid encrypted buffer');
  }
  const key = getMasterKey();
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

module.exports = { isConfigured, encrypt, decrypt, ENV_VAR };
