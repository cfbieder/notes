<script setup>
import { ref, computed, onMounted } from 'vue';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import VaultEntryModal from '../components/ui/VaultEntryModal.vue';
import ConfirmModal from '../components/ui/ConfirmModal.vue';
import { useVaultStore } from '../stores/vault.js';
import { useToastsStore } from '../stores/toasts.js';
import { useMobile } from '../composables/useMobile.js';
import { Lock, Unlock, Plus, Search, Copy, Eye, EyeOff, ExternalLink, KeyRound, AlertTriangle, User, CreditCard, Landmark, Hash, Fingerprint } from 'lucide-vue-next';

const { isMobile } = useMobile();
const vault = useVaultStore();
const toasts = useToastsStore();

// Setup form
const setupPassword = ref('');
const setupConfirm = ref('');
const setupAcknowledged = ref(false);
const setupError = ref('');

// Unlock form
const unlockPassword = ref('');
const unlockError = ref('');

// List view
const filter = ref('');
const typeFilter = ref('password');           // 'password' | 'key' | 'card' | 'bank'
const showEntryModal = ref(false);
const editingEntry = ref(null);
const confirmDelete = ref(null);
const revealedId = ref(null);

const TYPE_TABS = [
  { value: 'password', label: 'Passwords', icon: Lock },
  { value: 'key', label: 'Keys', icon: KeyRound },
  { value: 'card', label: 'Cards', icon: CreditCard },
  { value: 'bank', label: 'Bank', icon: Landmark }
];

function normaliseType(t) {
  return (t === 'key' || t === 'card' || t === 'bank') ? t : 'password';
}

// Per-type display helpers — used by the list row template to keep the
// markup small and read off a single config per entry.
function maskedField(e) {
  if (e.type === 'card') return e.card_number || '';
  if (e.type === 'bank') return e.account_number || '';
  return e.password || '';
}
function primaryCopy(e) {
  if (e.type === 'card') return { value: e.card_number, label: 'Card number', short: 'Number' };
  if (e.type === 'bank') return { value: e.account_number, label: 'Account number', short: 'Acct' };
  if (e.type === 'key') return { value: e.password, label: 'Key', short: 'Key' };
  return { value: e.password, label: 'Password', short: 'Pass' };
}
function secondaryCopy(e) {
  if (e.type === 'card' && e.cvv) return { value: e.cvv, label: 'Security code', short: 'CVV' };
  if (e.type === 'bank' && e.routing_number) return { value: e.routing_number, label: 'Routing number', short: 'Routing' };
  if (e.type === 'password' && e.username) return { value: e.username, label: 'Username', short: 'User', icon: User };
  return null;
}

const filteredEntries = computed(() => {
  const q = filter.value.trim().toLowerCase();
  return vault.entries.filter(e => {
    if (normaliseType(e.type) !== typeFilter.value) return false;
    if (!q) return true;
    if (e.name.toLowerCase().includes(q)) return true;
    // Search the most identifying field per type so a partial last-4 match
    // on a card or last digits of an account number finds the entry.
    if (e.type === 'card') {
      return (e.card_number || '').toLowerCase().includes(q);
    }
    if (e.type === 'bank') {
      return (e.account_number || '').toLowerCase().includes(q) ||
             (e.routing_number || '').toLowerCase().includes(q);
    }
    return (e.username || '').toLowerCase().includes(q) ||
           (e.url || '').toLowerCase().includes(q);
  });
});

const activeTypeLabel = computed(() => {
  const t = TYPE_TABS.find(x => x.value === typeFilter.value);
  return t ? t.label.toLowerCase() : 'entries';
});

const setupCanSubmit = computed(() =>
  setupPassword.value.length >= 6 &&
  setupPassword.value === setupConfirm.value &&
  setupAcknowledged.value
);

onMounted(async () => {
  try {
    await vault.loadMeta();
  } catch (err) {
    toasts.addToast({ message: err.message || 'Failed to load vault', type: 'error' });
  }
});

async function doSetup() {
  setupError.value = '';
  if (!setupCanSubmit.value) return;
  try {
    await vault.setup(setupPassword.value);
    toasts.addToast({ message: 'Vault created', type: 'success' });
    setupPassword.value = '';
    setupConfirm.value = '';
    setupAcknowledged.value = false;
  } catch (err) {
    setupError.value = err.message || 'Failed to create vault';
  }
}

async function doUnlock() {
  unlockError.value = '';
  try {
    const ok = await vault.unlock(unlockPassword.value);
    if (!ok) {
      unlockError.value = 'Incorrect master password';
      return;
    }
    unlockPassword.value = '';
  } catch (err) {
    unlockError.value = err.message || 'Failed to unlock';
  }
}

async function doBiometricUnlock() {
  unlockError.value = '';
  try {
    const ok = await vault.unlockWithBiometric();
    if (!ok) {
      unlockError.value = 'Saved biometric credential is out of date — enter your password to re-enroll.';
    }
  } catch (err) {
    unlockError.value = err.message || 'Biometric unlock failed';
  }
}

function lock() {
  vault.lock();
  toasts.addToast({ message: 'Vault locked', type: 'info', duration: 2000 });
}

function openCreate() {
  editingEntry.value = null;
  showEntryModal.value = true;
}

function openEdit(entry) {
  editingEntry.value = entry;
  showEntryModal.value = true;
}

async function saveEntry(record) {
  try {
    if (editingEntry.value?.id) {
      await vault.updateEntry(editingEntry.value.id, record);
      toasts.addToast({ message: 'Entry updated', type: 'success', duration: 2000 });
    } else {
      await vault.createEntry(record);
      toasts.addToast({ message: 'Entry created', type: 'success', duration: 2000 });
    }
    showEntryModal.value = false;
    editingEntry.value = null;
  } catch (err) {
    toasts.addToast({ message: err.message || 'Failed to save', type: 'error' });
  }
}

function askDelete(entry) {
  confirmDelete.value = entry;
}

async function doDelete() {
  const e = confirmDelete.value;
  confirmDelete.value = null;
  showEntryModal.value = false;
  editingEntry.value = null;
  try {
    await vault.deleteEntry(e.id);
    toasts.addToast({ message: 'Entry deleted', type: 'success', duration: 2000 });
  } catch (err) {
    toasts.addToast({ message: err.message || 'Failed to delete', type: 'error' });
  }
}

async function copyField(value, label) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toasts.addToast({ message: `${label} copied — clears in 30 s`, type: 'info', duration: 2000 });
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
  } catch {
    toasts.addToast({ message: 'Clipboard unavailable', type: 'error' });
  }
  vault.touch();
}

function toggleReveal(id) {
  revealedId.value = revealedId.value === id ? null : id;
  vault.touch();
}

function maskedDots() {
  return '••••••••••';
}
</script>

<template>
  <component :is="isMobile ? MobileLayout : 'div'" :title="isMobile ? 'Vault' : undefined">
    <div :class="isMobile ? 'vault-mobile' : 'vault-layout'">
      <AppSidebar v-if="!isMobile" />
      <main class="vault-main">

        <!-- Loading -->
        <div v-if="vault.status === 'unknown'" class="vault-empty">
          <KeyRound :size="32" />
          <p>Loading vault…</p>
        </div>

        <!-- Setup -->
        <div v-else-if="vault.status === 'not-set-up'" class="vault-card">
          <div class="card-header">
            <KeyRound :size="20" />
            <h2>Create your vault</h2>
          </div>
          <p class="card-intro">
            Pick a master password to encrypt your vault. This password
            never leaves your browser. The server only ever sees ciphertext.
          </p>
          <div class="warning-box">
            <AlertTriangle :size="16" />
            <div>
              <strong>There is no recovery.</strong>
              If you forget this password, every entry in your vault becomes permanently unreadable —
              even to the server admin. Pick something memorable, or store it somewhere safe outside Noted.
            </div>
          </div>

          <form class="setup-form" @submit.prevent="doSetup">
            <label>
              <span>Master password (min 6 chars)</span>
              <input type="password" v-model="setupPassword" autocomplete="new-password" autofocus />
            </label>
            <label>
              <span>Confirm</span>
              <input type="password" v-model="setupConfirm" autocomplete="new-password" />
            </label>
            <label class="ack">
              <input type="checkbox" v-model="setupAcknowledged" />
              <span>I understand that forgetting this password means losing my vault.</span>
            </label>
            <div v-if="setupError" class="error-text">{{ setupError }}</div>
            <button type="submit" class="btn-primary" :disabled="!setupCanSubmit || vault.busy">
              {{ vault.busy ? 'Deriving key…' : 'Create vault' }}
            </button>
          </form>
        </div>

        <!-- Unlock -->
        <div v-else-if="vault.status === 'locked'" class="vault-card">
          <div class="card-header">
            <Lock :size="20" />
            <h2>Vault is locked</h2>
          </div>
          <p class="card-intro">Enter your master password to decrypt your entries.</p>

          <button
            v-if="vault.biometricEnrolled && vault.biometricSupported"
            type="button"
            class="btn-biometric"
            :disabled="vault.busy"
            @click="doBiometricUnlock"
          >
            <Fingerprint :size="16" />
            {{ vault.busy ? 'Verifying…' : 'Use biometric unlock' }}
          </button>

          <div v-if="vault.biometricEnrolled && vault.biometricSupported" class="or-divider">
            <span>or</span>
          </div>

          <form class="setup-form" @submit.prevent="doUnlock">
            <label>
              <span>Master password</span>
              <input type="password" v-model="unlockPassword" autocomplete="current-password" autofocus />
            </label>
            <div v-if="unlockError" class="error-text">{{ unlockError }}</div>
            <button type="submit" class="btn-primary" :disabled="!unlockPassword || vault.busy">
              {{ vault.busy ? 'Deriving key…' : 'Unlock' }}
            </button>
          </form>
        </div>

        <!-- Unlocked list -->
        <template v-else>
          <div class="vault-header">
            <h2><Unlock :size="18" /> Vault</h2>
            <div class="header-actions">
              <button class="btn-secondary" @click="lock" title="Lock vault">
                <Lock :size="14" /> Lock
              </button>
              <button class="btn-primary" @click="openCreate">
                <Plus :size="14" /> New entry
              </button>
            </div>
          </div>

          <div class="type-tabs" role="tablist" aria-label="Entry type">
            <button
              v-for="tab in TYPE_TABS"
              :key="tab.value"
              type="button"
              role="tab"
              :aria-selected="typeFilter === tab.value"
              class="type-tab"
              :class="{ active: typeFilter === tab.value }"
              @click="typeFilter = tab.value"
            >
              <component :is="tab.icon" :size="13" />
              {{ tab.label }}
            </button>
          </div>

          <div class="filter-bar">
            <div class="filter-input">
              <Search :size="14" />
              <input v-model="filter" placeholder="Filter…" />
            </div>
          </div>

          <div v-if="vault.entries.length === 0" class="vault-empty">
            <KeyRound :size="32" />
            <p>No entries yet.</p>
            <button class="btn-secondary" @click="openCreate">
              <Plus :size="14" /> Add your first entry
            </button>
          </div>

          <div v-else-if="filteredEntries.length === 0" class="vault-empty">
            <p v-if="filter">No {{ activeTypeLabel }} entries match “{{ filter }}”.</p>
            <p v-else>No {{ activeTypeLabel }} entries.</p>
          </div>

          <ul v-else class="entry-list">
            <li v-for="e in filteredEntries" :key="e.id" class="entry-row" :class="['type-' + normaliseType(e.type), { undecryptable: e.undecryptable }]">
              <button class="entry-name" @click="openEdit(e)">
                <span class="entry-title-row">
                  <KeyRound v-if="e.type === 'key'" :size="13" class="type-badge" />
                  <CreditCard v-else-if="e.type === 'card'" :size="13" class="type-badge" />
                  <Landmark v-else-if="e.type === 'bank'" :size="13" class="type-badge" />
                  <Lock v-else :size="13" class="type-badge" />
                  <strong>{{ e.name }}</strong>
                </span>
                <span v-if="e.type === 'password' && e.username" class="entry-username">{{ e.username }}</span>
                <span v-else-if="e.type === 'card' && e.expiration" class="entry-username">Exp {{ e.expiration }}</span>
                <span v-else-if="e.type === 'bank' && e.swift_bic" class="entry-username">SWIFT {{ e.swift_bic }}</span>
              </button>

              <div class="entry-secret">
                <span v-if="revealedId === e.id" class="entry-password-revealed">{{ maskedField(e) || '—' }}</span>
                <span v-else class="entry-password-masked">{{ maskedField(e) ? maskedDots() : '—' }}</span>
              </div>

              <!-- Quick-copy action group: prominent labeled buttons (mobile + desktop). -->
              <div class="entry-actions">
                <button
                  v-if="secondaryCopy(e)"
                  class="quick-copy-btn"
                  @click.stop="copyField(secondaryCopy(e).value, secondaryCopy(e).label)"
                  :title="`Copy ${secondaryCopy(e).label.toLowerCase()}`"
                >
                  <component :is="secondaryCopy(e).icon || Hash" :size="14" />
                  <Copy :size="11" class="copy-overlay" />
                  <span class="quick-copy-label">{{ secondaryCopy(e).short }}</span>
                </button>
                <button
                  class="quick-copy-btn primary-copy"
                  :disabled="!primaryCopy(e).value"
                  @click.stop="copyField(primaryCopy(e).value, primaryCopy(e).label)"
                  :title="`Copy ${primaryCopy(e).label.toLowerCase()}`"
                >
                  <KeyRound v-if="e.type === 'key'" :size="14" />
                  <CreditCard v-else-if="e.type === 'card'" :size="14" />
                  <Landmark v-else-if="e.type === 'bank'" :size="14" />
                  <Lock v-else :size="14" />
                  <Copy :size="11" class="copy-overlay" />
                  <span class="quick-copy-label">{{ primaryCopy(e).short }}</span>
                </button>

                <button class="icon-action" @click.stop="toggleReveal(e.id)" :title="revealedId === e.id ? 'Hide' : 'Reveal'">
                  <Eye v-if="revealedId !== e.id" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
                <a v-if="e.type === 'password' && e.url" class="icon-action" :href="e.url" target="_blank" rel="noopener" title="Open URL">
                  <ExternalLink :size="14" />
                </a>
              </div>
            </li>
          </ul>
        </template>

      </main>
    </div>

    <VaultEntryModal
      v-if="showEntryModal"
      :entry="editingEntry"
      :default-type="typeFilter"
      @save="saveEntry"
      @cancel="showEntryModal = false; editingEntry = null"
      @delete="askDelete"
    />

    <ConfirmModal
      v-if="confirmDelete"
      title="Delete entry"
      :message="`Delete “${confirmDelete.name}”? This cannot be undone.`"
      confirm-text="Delete"
      :danger="true"
      @confirm="doDelete"
      @cancel="confirmDelete = null"
    />
  </component>
</template>

<style scoped>
.vault-layout {
  display: flex;
  height: 100vh;
}
.vault-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
  max-width: 100%;
}
.vault-mobile { padding: 16px; }

.vault-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 16px;
}
.vault-header h2 {
  margin: 0; display: flex; align-items: center; gap: 8px;
}
.header-actions { display: flex; gap: 8px; }

.vault-card {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 24px;
  max-width: 480px;
  margin: 48px auto;
}
.card-header {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 8px;
}
.card-header h2 { margin: 0; font-size: 18px; }
.card-intro {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 16px;
}
.warning-box {
  display: flex; gap: 10px;
  background: rgba(229, 57, 53, 0.08);
  border: 1px solid rgba(229, 57, 53, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-primary);
}
.warning-box svg { color: #e53935; flex-shrink: 0; margin-top: 2px; }

.btn-biometric {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-input, var(--bg-main));
  border: 1px solid var(--accent-primary);
  border-radius: 8px;
  color: var(--accent-primary);
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.btn-biometric:hover:not(:disabled) {
  background: rgba(var(--accent-primary-rgb, 80, 120, 200), 0.08);
}
.btn-biometric:disabled { opacity: 0.5; cursor: not-allowed; }
.or-divider {
  display: flex; align-items: center; gap: 8px;
  margin: 12px 0;
  color: var(--text-secondary);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.or-divider::before, .or-divider::after {
  content: '';
  flex: 1;
  border-top: 1px solid var(--border-subtle);
}

.setup-form { display: flex; flex-direction: column; gap: 12px; }
.setup-form label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: var(--text-secondary);
}
.setup-form label.ack {
  flex-direction: row; align-items: flex-start; gap: 8px;
}
.setup-form input[type="password"], .setup-form input[type="text"] {
  background: var(--bg-input, var(--bg-card));
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text-primary);
}
.setup-form input:focus { outline: none; border-color: var(--accent-primary); }

.error-text {
  color: #e53935;
  font-size: 12px;
}

.type-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}
.type-tab {
  flex: 1;
  min-width: 90px;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 7px 12px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.type-tab.active {
  background: var(--bg-input, var(--bg-main));
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.type-tab:hover:not(.active) { color: var(--text-primary); }

.filter-bar {
  display: flex; align-items: center; gap: 8px;
  margin-bottom: 12px;
}
.filter-input {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 6px 10px;
  color: var(--text-secondary);
  width: 240px;
  max-width: 100%;
}
.filter-input input {
  flex: 1; min-width: 0;
  background: none; border: none; outline: none;
  color: var(--text-primary); font-size: 13px;
}
@media (max-width: 640px) {
  .filter-input { width: auto; flex: 1; }
  .type-tab { min-width: 0; padding: 8px 6px; font-size: 12px; }
}

.vault-empty {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 48px 16px;
  color: var(--text-secondary);
}

.entry-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
.entry-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center; gap: 12px;
  padding: 10px 12px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.entry-row.undecryptable { opacity: 0.6; }
.entry-name {
  min-width: 0;
  background: none; border: none; cursor: pointer; text-align: left;
  color: var(--text-primary);
  display: flex; flex-direction: column; gap: 2px;
  padding: 0;
}
.entry-title-row { display: inline-flex; align-items: center; gap: 6px; }
.entry-title-row strong { font-size: 14px; font-weight: 500; }
.type-badge { color: var(--text-secondary); flex-shrink: 0; }
.type-key .type-badge { color: var(--accent-warn, #e8a13b); }
.type-card .type-badge { color: var(--accent-primary); }
.type-bank .type-badge { color: var(--accent-success, #4caf50); }
.entry-username { font-size: 11px; color: var(--text-secondary); }
.entry-name:hover strong { color: var(--accent-primary); }

.entry-secret { display: flex; align-items: center; gap: 6px; }
.entry-password-revealed {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--text-primary);
  max-width: 220px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.entry-password-masked {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 1px;
}

.entry-actions { display: flex; align-items: center; gap: 6px; }

.quick-copy-btn {
  position: relative;
  display: inline-flex; align-items: center; gap: 5px;
  padding: 6px 10px;
  background: var(--bg-input, var(--bg-main));
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  min-height: 32px;
}
.quick-copy-btn:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--accent-primary);
  background: var(--bg-card);
}
.quick-copy-btn:active { transform: scale(0.97); }
.quick-copy-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.quick-copy-btn.primary-copy {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
.quick-copy-btn.primary-copy:hover:not(:disabled) {
  background: rgba(var(--accent-primary-rgb, 80, 120, 200), 0.08);
}
.quick-copy-label { line-height: 1; }
.copy-overlay {
  position: absolute;
  bottom: 4px; right: 4px;
  background: var(--bg-card);
  border-radius: 50%;
  padding: 1px;
  color: var(--text-secondary);
}

.icon-action {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 6px 8px;
  display: inline-flex; align-items: center; justify-content: center;
  text-decoration: none;
  min-height: 32px;
}
.icon-action:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong);
}
.icon-action:disabled { opacity: 0.4; cursor: not-allowed; }

/* On narrow screens, stack the row so quick-copy buttons get a full-width tap row. */
@media (max-width: 640px) {
  .entry-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  .entry-secret {
    justify-content: flex-start;
  }
  .entry-actions {
    flex-wrap: wrap;
    gap: 6px;
  }
  .quick-copy-btn { flex: 1; justify-content: center; min-height: 38px; padding: 8px 10px; }
  .quick-copy-label { font-size: 13px; }
  .icon-action { min-height: 38px; min-width: 38px; padding: 8px 10px; }
  .copy-overlay { display: none; }
}

.btn-primary, .btn-secondary {
  padding: 7px 14px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.btn-primary {
  background: var(--accent-primary);
  border: none;
  color: white;
  font-weight: 500;
}
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-secondary {
  background: none;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
}
.btn-secondary:hover { color: var(--text-primary); border-color: var(--border-strong); }
</style>
