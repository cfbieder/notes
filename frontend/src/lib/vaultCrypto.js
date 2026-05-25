/**
 * Vault crypto — CR020.
 *
 * Strict zero-knowledge: master password / derived key never leave the client.
 *
 *   KDF        Argon2id (m = 64 MiB, t = 3, p = 1, 32-byte output)
 *   Encrypt    AES-256-GCM via WebCrypto, 12-byte random IV per op
 *   Verifier   AES-256-GCM of the constant "vault-v1-ok"
 *   Wire       BYTEA fields are exchanged as base64 in JSON
 *
 * The derived master key is held only in memory by the Pinia store and is
 * never persisted to localStorage / sessionStorage / IndexedDB.
 */

import { argon2id } from 'hash-wasm';

const VERIFIER_PLAINTEXT = 'vault-v1-ok';

export const DEFAULT_KDF_PARAMS = Object.freeze({
  algo: 'argon2id',
  m: 65536,   // 64 MiB
  t: 3,
  p: 1
});

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64 helpers ---------------------------------------------------------

export function bytesToB64(bytes) {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

export function b64ToBytes(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---- random ----------------------------------------------------------------

export function randomBytes(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function generateSalt() {
  return randomBytes(16);
}

// ---- key derivation --------------------------------------------------------

export async function deriveKey(password, salt, params = DEFAULT_KDF_PARAMS) {
  const hashBytes = await deriveRawKey(password, salt, params);
  return importMasterKey(hashBytes);
}

/**
 * Like deriveKey, but returns the raw 32 bytes so callers can wrap them
 * (used only during biometric enrollment — never persisted in plaintext).
 */
export async function deriveRawKey(password, salt, params = DEFAULT_KDF_PARAMS) {
  if (params.algo !== 'argon2id') {
    throw new Error(`Unsupported KDF: ${params.algo}`);
  }
  return argon2id({
    password,
    salt,
    parallelism: params.p,
    iterations: params.t,
    memorySize: params.m,
    hashLength: 32,
    outputType: 'binary'
  });
}

/**
 * Import raw 32-byte master-key material as a non-extractable AES-GCM key.
 */
export async function importMasterKey(rawBytes) {
  return crypto.subtle.importKey(
    'raw',
    rawBytes,
    { name: 'AES-GCM' },
    /* extractable */ false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wrap raw key bytes under a separate raw AES-GCM secret (e.g. a WebAuthn PRF
 * output). Returns base64 of ciphertext + iv. Used by biometric enrollment.
 */
export async function wrapBytes(plaintextBytes, secretBytes) {
  const wrapKey = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'AES-GCM' }, false, ['encrypt']
  );
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKey, plaintextBytes);
  return { ciphertext: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}

export async function unwrapBytes(ciphertextB64, ivB64, secretBytes) {
  const wrapKey = await crypto.subtle.importKey(
    'raw', secretBytes, { name: 'AES-GCM' }, false, ['decrypt']
  );
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBytes(ivB64) },
    wrapKey,
    b64ToBytes(ciphertextB64)
  );
  return new Uint8Array(pt);
}

// ---- AES-GCM ---------------------------------------------------------------

async function aesEncrypt(key, plaintextBytes) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintextBytes);
  return { ciphertext: new Uint8Array(ct), iv };
}

async function aesDecrypt(key, ciphertext, iv) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(pt);
}

// ---- verifier (used to check the master password on unlock) ----------------

export async function buildVerifier(key) {
  const { ciphertext, iv } = await aesEncrypt(key, enc.encode(VERIFIER_PLAINTEXT));
  return {
    verifier_ciphertext: bytesToB64(ciphertext),
    verifier_iv: bytesToB64(iv)
  };
}

export async function checkVerifier(key, verifierCiphertextB64, verifierIvB64) {
  try {
    const pt = await aesDecrypt(
      key,
      b64ToBytes(verifierCiphertextB64),
      b64ToBytes(verifierIvB64)
    );
    return dec.decode(pt) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

// ---- entry payloads --------------------------------------------------------

/**
 * Encrypt a vault entry record. Plaintext is JSON of
 *   { name, username, password, url, notes }
 * with all fields strings (empty string allowed).
 */
export async function encryptEntry(key, record) {
  const json = JSON.stringify(record);
  const { ciphertext, iv } = await aesEncrypt(key, enc.encode(json));
  return {
    ciphertext: bytesToB64(ciphertext),
    iv: bytesToB64(iv)
  };
}

export async function decryptEntry(key, ciphertextB64, ivB64) {
  const pt = await aesDecrypt(
    key,
    b64ToBytes(ciphertextB64),
    b64ToBytes(ivB64)
  );
  return JSON.parse(dec.decode(pt));
}

// ---- password generator (used by the "generate" button in the entry form) --

const GEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_=+';

export function generatePassword(length = 24) {
  const out = new Array(length);
  // Rejection sampling against 256 to stay uniform.
  const max = Math.floor(256 / GEN_ALPHABET.length) * GEN_ALPHABET.length;
  let i = 0;
  while (i < length) {
    const buf = randomBytes(length * 2);
    for (let j = 0; j < buf.length && i < length; j++) {
      if (buf[j] < max) {
        out[i++] = GEN_ALPHABET[buf[j] % GEN_ALPHABET.length];
      }
    }
  }
  return out.join('');
}
