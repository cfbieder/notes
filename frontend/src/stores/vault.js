/**
 * Vault store — CR020.
 *
 * Holds the derived master key in memory only. Never persisted.
 *
 * Lifecycle:
 *   not-set-up  → user has no vault_meta on the server
 *   locked      → vault_meta exists; master key not in memory
 *   unlocked    → master key in memory; idle timer running
 *
 * Idle timer (15 min) and manual lock both wipe the master key.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../api/client.js';
import {
  DEFAULT_KDF_PARAMS,
  generateSalt,
  bytesToB64,
  deriveKey,
  buildVerifier,
  checkVerifier,
  encryptEntry,
  decryptEntry
} from '../lib/vaultCrypto.js';

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export const useVaultStore = defineStore('vault', () => {
  // null = unknown (haven't fetched), false = no vault, true = vault exists
  const isSetUp = ref(null);
  const isUnlocked = ref(false);
  const meta = ref(null);            // server response from GET /vault/meta
  const entries = ref([]);           // [{id, name, username, password, url, notes, updated_at}]
  const busy = ref(false);
  const error = ref(null);

  // Held in closure so it never appears in DevTools as a reactive value.
  let masterKey = null;
  let idleTimer = null;

  const status = computed(() => {
    if (isSetUp.value === null) return 'unknown';
    if (!isSetUp.value) return 'not-set-up';
    return isUnlocked.value ? 'unlocked' : 'locked';
  });

  function clearIdleTimer() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function resetIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(() => {
      lock();
    }, IDLE_TIMEOUT_MS);
  }

  /**
   * Fetch /vault/meta to determine setup state. Safe to call repeatedly.
   */
  async function loadMeta() {
    error.value = null;
    try {
      const res = await api.get('/vault/meta');
      meta.value = res.data;
      isSetUp.value = true;
    } catch (err) {
      if (err.status === 404) {
        meta.value = null;
        isSetUp.value = false;
      } else {
        error.value = err.message || 'Failed to load vault metadata';
        throw err;
      }
    }
  }

  /**
   * First-time setup. Derives a key from the password, builds the verifier,
   * POSTs metadata to the server, then leaves the vault unlocked.
   */
  async function setup(password) {
    error.value = null;
    busy.value = true;
    try {
      const salt = generateSalt();
      const params = { ...DEFAULT_KDF_PARAMS };
      const key = await deriveKey(password, salt, params);
      const { verifier_ciphertext, verifier_iv } = await buildVerifier(key);

      await api.post('/vault/meta', {
        kdf_salt: bytesToB64(salt),
        kdf_params: params,
        verifier_ciphertext,
        verifier_iv
      });

      masterKey = key;
      isSetUp.value = true;
      isUnlocked.value = true;
      entries.value = [];
      await loadMeta();
      resetIdleTimer();
    } finally {
      busy.value = false;
    }
  }

  /**
   * Unlock with the master password. Returns true on success, false on
   * wrong password (not an exception, since wrong-password is normal).
   * Throws on transport errors.
   */
  async function unlock(password) {
    error.value = null;
    busy.value = true;
    try {
      if (!meta.value) await loadMeta();
      if (!meta.value) throw new Error('Vault not set up');

      const salt = b64ToBytesLocal(meta.value.kdf_salt);
      const key = await deriveKey(password, salt, meta.value.kdf_params);

      const ok = await checkVerifier(
        key,
        meta.value.verifier_ciphertext,
        meta.value.verifier_iv
      );
      if (!ok) return false;

      masterKey = key;
      isUnlocked.value = true;
      await loadEntries();
      resetIdleTimer();
      return true;
    } finally {
      busy.value = false;
    }
  }

  function lock() {
    masterKey = null;
    isUnlocked.value = false;
    entries.value = [];
    clearIdleTimer();
  }

  async function loadEntries() {
    if (!masterKey) throw new Error('Vault is locked');
    const res = await api.get('/vault/entries');
    const decrypted = [];
    for (const row of res.data) {
      try {
        const record = await decryptEntry(masterKey, row.ciphertext, row.iv);
        decrypted.push({
          id: row.id,
          ...normaliseRecord(record),
          updated_at: row.updated_at,
          created_at: row.created_at
        });
      } catch {
        // A row that won't decrypt (e.g. encrypted with an old key) — surface
        // it as a stub so the user can delete it.
        decrypted.push({
          id: row.id,
          type: 'password',
          name: '(unreadable entry)',
          username: '', password: '', url: '', notes: '',
          updated_at: row.updated_at,
          created_at: row.created_at,
          undecryptable: true
        });
      }
    }
    decrypted.sort((a, b) => a.name.localeCompare(b.name));
    entries.value = decrypted;
    resetIdleTimer();
  }

  async function createEntry(record) {
    if (!masterKey) throw new Error('Vault is locked');
    const payload = await encryptEntry(masterKey, normaliseRecord(record));
    await api.post('/vault/entries', payload);
    await loadEntries();
  }

  async function updateEntry(id, record) {
    if (!masterKey) throw new Error('Vault is locked');
    const payload = await encryptEntry(masterKey, normaliseRecord(record));
    await api.put(`/vault/entries/${id}`, payload);
    await loadEntries();
  }

  async function deleteEntry(id) {
    if (!masterKey) throw new Error('Vault is locked');
    await api.delete(`/vault/entries/${id}`);
    await loadEntries();
  }

  /**
   * Rotate the master password.
   *
   * Verifies the current password client-side, derives a new key, decrypts every
   * entry with the old key + re-encrypts with the new key, then atomically posts
   * the new metadata + re-encrypted entries to /vault/rotate. Vault does not need
   * to be unlocked first — current password is what authorises the rotation.
   *
   * Returns true on success, false if the current password is wrong.
   */
  async function changePassword(currentPassword, newPassword) {
    error.value = null;
    busy.value = true;
    try {
      // Always re-fetch meta to avoid acting on a stale snapshot.
      await loadMeta();
      if (!meta.value) throw new Error('Vault not set up');

      // Verify current password.
      const currentSalt = b64ToBytesLocal(meta.value.kdf_salt);
      const currentKey = await deriveKey(currentPassword, currentSalt, meta.value.kdf_params);
      const ok = await checkVerifier(currentKey, meta.value.verifier_ciphertext, meta.value.verifier_iv);
      if (!ok) return false;

      // Derive new key from a fresh salt + default params.
      const newSalt = generateSalt();
      const newParams = { ...DEFAULT_KDF_PARAMS };
      const newKey = await deriveKey(newPassword, newSalt, newParams);
      const newVerifier = await buildVerifier(newKey);

      // Re-encrypt every entry. Fetch directly from the server so we have the
      // raw ciphertext blobs — the in-memory `entries` array is plaintext records.
      const listRes = await api.get('/vault/entries');
      const reEncrypted = [];
      for (const row of listRes.data) {
        let record;
        try {
          record = await decryptEntry(currentKey, row.ciphertext, row.iv);
        } catch (err) {
          // An undecryptable row would be lost on rotation. Refuse to rotate so
          // the user can investigate / delete it first.
          throw new Error(
            `Entry ${row.id} could not be decrypted with the current password. ` +
            `Delete it before changing your master password.`
          );
        }
        const blob = await encryptEntry(newKey, record);
        reEncrypted.push({ id: row.id, ciphertext: blob.ciphertext, iv: blob.iv });
      }

      await api.put('/vault/rotate', {
        kdf_salt: bytesToB64(newSalt),
        kdf_params: newParams,
        verifier_ciphertext: newVerifier.verifier_ciphertext,
        verifier_iv: newVerifier.verifier_iv,
        entries: reEncrypted
      });

      // If the vault was unlocked when the rotation started, swap the in-memory
      // key over so the user can keep using it without re-unlocking.
      if (masterKey) {
        masterKey = newKey;
        resetIdleTimer();
      }
      // Refresh local meta cache.
      await loadMeta();
      return true;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Call from the view on user activity inside /vault to keep the session warm.
   * (Note: idle timer also resets implicitly on every store action.)
   */
  function touch() {
    if (isUnlocked.value) resetIdleTimer();
  }

  function normaliseRecord(r) {
    // Type discriminator drives the UI's per-type field set. Each type only
    // persists fields relevant to itself; irrelevant fields are dropped so a
    // legacy 'password' entry edited as a 'card' wouldn't carry orphan data.
    // (In practice the modal locks the type on edit, but normalise stays
    // defensive.)
    const rawType = r.type;
    const type = rawType === 'key' || rawType === 'card' || rawType === 'bank'
      ? rawType
      : 'password';
    const name = String(r.name ?? '').trim();
    const notes = String(r.notes ?? '');

    if (type === 'card') {
      return {
        type,
        name,
        card_number: String(r.card_number ?? ''),
        expiration: String(r.expiration ?? ''),
        cvv: String(r.cvv ?? ''),
        notes
      };
    }
    if (type === 'bank') {
      return {
        type,
        name,
        account_number: String(r.account_number ?? ''),
        routing_number: String(r.routing_number ?? ''),
        swift_bic: String(r.swift_bic ?? ''),
        notes
      };
    }
    // password / key — secret lives in `password`; key entries leave
    // username/url blank.
    return {
      type,
      name,
      username: type === 'key' ? '' : String(r.username ?? ''),
      password: String(r.password ?? ''),
      url: type === 'key' ? '' : String(r.url ?? ''),
      notes
    };
  }

  // Local helper to avoid pulling b64ToBytes into the import surface twice.
  function b64ToBytesLocal(b64) {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  return {
    isSetUp, isUnlocked, meta, entries, busy, error, status,
    loadMeta, setup, unlock, lock, loadEntries,
    createEntry, updateEntry, deleteEntry, touch, changePassword
  };
});
