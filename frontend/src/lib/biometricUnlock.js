/**
 * Biometric vault unlock — CR021.
 *
 * Uses the WebAuthn PRF extension to derive a stable per-credential secret
 * gated by a platform authenticator (Touch ID, Windows Hello, Android
 * fingerprint). That secret wraps a copy of the vault master key, stored in
 * localStorage. Biometric unlock = unwrap-with-PRF-secret → import as key.
 *
 * Zero-knowledge intact: only the WRAPPED key sits on disk; the wrap secret
 * lives in the OS secure enclave / TPM and never leaves the authenticator.
 * The master password remains primary — biometric is an opt-in, per-device
 * shortcut.
 *
 * This module also re-exports the small Argon2id + key-import helpers needed
 * by the enrollment flow (raw key bytes are needed at enroll time so they
 * can be wrapped under the PRF secret). The non-extractable master key used
 * for steady-state vault operations still comes from vaultCrypto.js's
 * deriveKey() — biometric is purely additive.
 */

import {
  randomBytes,
  bytesToB64,
  b64ToBytes,
  deriveRawKey,
  importMasterKey,
  wrapBytes,
  unwrapBytes
} from './vaultCrypto.js';

// Re-export so callers (vault store) can reach them through a single module.
export { deriveRawKey, importMasterKey };

const STORAGE_KEY = 'noted.vaultBiometric';
const RP_NAME = 'Noted Vault';
const enc = new TextEncoder();

// ---- WebAuthn feature detection ------------------------------------------

/**
 * Feature-detect platform authenticator + PRF support. Returns true if the
 * APIs are at least present — actual PRF availability can only be confirmed
 * by attempting enrollment, since some browsers expose the API but the
 * authenticator silently drops the extension.
 */
export function isSupported() {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && !!navigator.credentials?.create
    && !!navigator.credentials?.get;
}

/**
 * Async probe — does this device have a usable platform authenticator (Touch
 * ID, Windows Hello, Android fingerprint)? Useful for showing a "set up a
 * fingerprint in your OS first" hint before we ask the user to enroll.
 */
export async function hasPlatformAuthenticator() {
  if (!isSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

// ---- localStorage management ---------------------------------------------

export function getStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.credentialId || !parsed?.wrappedKey) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasEnrollmentFor(userId) {
  const s = getStored();
  return !!(s && (!userId || s.vaultUserId === userId));
}

export function clearEnrollment() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---- enroll / unlock -----------------------------------------------------

/**
 * Enroll biometric unlock for the current user. Caller supplies the raw
 * master-key bytes (32) — typically just-derived from the password the user
 * re-typed at the Settings prompt. The raw bytes are wrapped under the PRF
 * secret returned by the platform authenticator and stashed in localStorage.
 *
 * Throws on cancel, PRF-not-supported, or any WebAuthn error.
 */
export async function enroll({ userId, userName, rawMasterKey }) {
  if (!isSupported()) {
    throw new Error('Biometric unlock is not supported in this browser.');
  }
  if (!(rawMasterKey instanceof Uint8Array) || rawMasterKey.length !== 32) {
    throw new Error('Master key bytes are required for enrollment.');
  }

  const prfSalt = randomBytes(32);
  const challenge = randomBytes(32);

  let credential;
  try {
    credential = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: RP_NAME },           // no rp.id → defaults to current origin
        user: {
          id: enc.encode(userId),
          name: userName || 'noted-user',
          displayName: userName || 'Noted'
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },    // ES256
          { type: 'public-key', alg: -257 }   // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred'
        },
        extensions: {
          prf: { eval: { first: prfSalt } }
        },
        timeout: 60000
      }
    });
  } catch (err) {
    if (err?.name === 'NotAllowedError') {
      throw new Error('Enrollment was cancelled or timed out.');
    }
    throw new Error(err?.message || 'Failed to create biometric credential.');
  }

  if (!credential) {
    throw new Error('Enrollment returned no credential.');
  }

  const ext = credential.getClientExtensionResults?.();
  const prfResult = ext?.prf?.results?.first;
  if (!prfResult) {
    throw new Error(
      'This browser/device does not support the WebAuthn PRF extension — biometric unlock unavailable.'
    );
  }

  const prfBytes = new Uint8Array(prfResult);
  try {
    const wrapped = await wrapBytes(rawMasterKey, prfBytes);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      vaultUserId: userId,
      credentialId: bytesToB64(new Uint8Array(credential.rawId)),
      prfSalt: bytesToB64(prfSalt),
      wrappedKey: wrapped.ciphertext,
      wrappedIv: wrapped.iv,
      enrolledAt: new Date().toISOString()
    }));
  } finally {
    prfBytes.fill(0);
  }
}

/**
 * Biometric unlock. Prompts the platform authenticator, unwraps the stored
 * master key, and returns its raw 32 bytes. Caller imports them as a
 * CryptoKey (see importMasterKey).
 *
 * Throws on cancel, missing enrollment, or PRF failure.
 */
export async function unlock() {
  const stored = getStored();
  if (!stored) throw new Error('No biometric credential is enrolled on this device.');

  const challenge = randomBytes(32);
  const credentialId = b64ToBytes(stored.credentialId);
  const prfSalt = b64ToBytes(stored.prfSalt);

  let assertion;
  try {
    assertion = await navigator.credentials.get({
      publicKey: {
        challenge,
        allowCredentials: [{
          type: 'public-key',
          id: credentialId,
          transports: ['internal']
        }],
        userVerification: 'required',
        extensions: { prf: { eval: { first: prfSalt } } },
        timeout: 60000
      }
    });
  } catch (err) {
    if (err?.name === 'NotAllowedError') {
      throw new Error('Biometric unlock was cancelled or timed out.');
    }
    throw new Error(err?.message || 'Biometric unlock failed.');
  }

  if (!assertion) throw new Error('Biometric unlock returned no assertion.');

  const ext = assertion.getClientExtensionResults?.();
  const prfResult = ext?.prf?.results?.first;
  if (!prfResult) {
    throw new Error('PRF result missing — biometric enrollment must be redone.');
  }

  const prfBytes = new Uint8Array(prfResult);
  try {
    return await unwrapBytes(stored.wrappedKey, stored.wrappedIv, prfBytes);
  } finally {
    prfBytes.fill(0);
  }
}
