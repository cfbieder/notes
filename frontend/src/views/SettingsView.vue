<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useIntegrationsStore } from '../stores/integrations.js';
import { useUIStore } from '../stores/ui.js';
import AppSidebar from '../components/sidebar/AppSidebar.vue';
import MobileLayout from '../components/mobile/MobileLayout.vue';
import SystemStatusCard from '../components/ui/SystemStatusCard.vue';
import { useMobile } from '../composables/useMobile.js';
import { Settings, HardDrive, RefreshCw, CheckCircle, XCircle, Loader2, Unplug, ExternalLink, Lock, Palette, AlertTriangle } from 'lucide-vue-next';
import { api } from '../api/client.js';

const { isMobile } = useMobile();
const router = useRouter();
const integrationsStore = useIntegrationsStore();
const uiStore = useUIStore();

const themeOptions = [
  { value: 'sapphire', label: 'Sapphire Slate', hint: 'Deep navy + amber accents (default)' },
  { value: 'dark', label: 'Dark', hint: 'Neutral charcoal dark mode' },
  { value: 'light', label: 'Light', hint: 'Neutral light mode' }
];

// Password change
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordSaving = ref(false);
const passwordMessage = ref('');
const passwordError = ref(false);

async function changePassword() {
  passwordMessage.value = '';
  passwordError.value = false;

  if (newPassword.value !== confirmPassword.value) {
    passwordMessage.value = 'New passwords do not match';
    passwordError.value = true;
    return;
  }

  passwordSaving.value = true;
  try {
    await api.put('/auth/password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value
    });
    passwordMessage.value = 'Password updated successfully';
    passwordError.value = false;
    currentPassword.value = '';
    newPassword.value = '';
    confirmPassword.value = '';
  } catch (err) {
    passwordMessage.value = err.message || 'Failed to update password';
    passwordError.value = true;
  } finally {
    passwordSaving.value = false;
  }
}

const canSubmitPassword = () =>
  currentPassword.value && newPassword.value.length >= 8 && confirmPassword.value;

const folderName = ref('');
const pollInterval = ref(5);
const configSaving = ref(false);
const configMessage = ref('');
const connectPolling = ref(null);

onMounted(async () => {
  await integrationsStore.fetchStatus();
  if (integrationsStore.googleDrive.connected) {
    folderName.value = integrationsStore.googleDrive.folderName || '';
    pollInterval.value = integrationsStore.googleDrive.pollIntervalMinutes || 5;
    await integrationsStore.fetchHistory();
  }
});

async function connectGoogleDrive() {
  try {
    const url = await integrationsStore.getAuthUrl();
    window.open(url, '_blank', 'width=600,height=700');

    // Poll for connection status
    connectPolling.value = setInterval(async () => {
      await integrationsStore.fetchStatus();
      if (integrationsStore.googleDrive.connected) {
        clearInterval(connectPolling.value);
        connectPolling.value = null;
      }
    }, 2000);

    // Stop polling after 5 minutes
    setTimeout(() => {
      if (connectPolling.value) {
        clearInterval(connectPolling.value);
        connectPolling.value = null;
      }
    }, 300000);
  } catch (err) {
    console.error('Failed to get auth URL:', err);
  }
}

async function disconnectGoogleDrive() {
  if (!confirm('Disconnect Google Drive? Import history will be preserved.')) return;
  await integrationsStore.disconnect();
  folderName.value = '';
  pollInterval.value = 5;
}

async function saveConfig() {
  configSaving.value = true;
  configMessage.value = '';
  try {
    await integrationsStore.updateConfig({
      folderName: folderName.value,
      pollIntervalMinutes: pollInterval.value
    });
    configMessage.value = 'Configuration saved';
    setTimeout(() => { configMessage.value = ''; }, 3000);
  } catch (err) {
    configMessage.value = err.message || 'Failed to save';
  } finally {
    configSaving.value = false;
  }
}

async function toggleEnabled() {
  await integrationsStore.updateConfig({
    enabled: !integrationsStore.googleDrive.enabled
  });
  await integrationsStore.fetchStatus();
}

const scanError = ref('');

async function scanNow() {
  scanError.value = '';
  try {
    await integrationsStore.scanNow();
  } catch (err) {
    scanError.value = err.body?.needsReconnect
      ? 'Google Drive authorization expired. Click Reconnect to re-authorize.'
      : (err.message || 'Scan failed');
  }
  await Promise.all([
    integrationsStore.fetchStatus(),
    integrationsStore.fetchHistory()
  ]);
}

function openNote(noteId) {
  if (noteId) router.push(`/notes/${noteId}`);
}

function formatDate(dateStr) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}
</script>

<template>
  <MobileLayout v-if="isMobile" title="Settings">
    <main class="settings-main" style="padding: 16px;">
      <div class="settings-content">
        <!-- Appearance / Theme -->
        <section class="settings-section">
          <h3><Palette :size="16" /> Appearance</h3>
          <p class="section-desc">Pick a color scheme for the app.</p>
          <div class="theme-grid">
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              type="button"
              :class="['theme-card', `theme-preview-${opt.value}`, { selected: uiStore.theme === opt.value }]"
              @click="uiStore.setTheme(opt.value)"
            >
              <span class="theme-swatch">
                <span class="swatch-sidebar" />
                <span class="swatch-main" />
                <span class="swatch-card" />
                <span class="swatch-accent" />
              </span>
              <span class="theme-label">{{ opt.label }}</span>
              <span class="theme-hint">{{ opt.hint }}</span>
            </button>
          </div>
        </section>

        <!-- Change Password -->
        <section class="settings-section">
          <h3><Lock :size="16" /> Change Password</h3>
          <p class="section-desc">Update your account password.</p>
          <div class="config-form">
            <div class="form-group">
              <label>Current password</label>
              <input v-model="currentPassword" type="password" class="form-input" autocomplete="current-password" />
            </div>
            <div class="form-group">
              <label>New password</label>
              <input v-model="newPassword" type="password" class="form-input" autocomplete="new-password" />
              <span class="form-hint">Minimum 8 characters</span>
            </div>
            <div class="form-group">
              <label>Confirm new password</label>
              <input v-model="confirmPassword" type="password" class="form-input" autocomplete="new-password" />
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" @click="changePassword" :disabled="passwordSaving || !canSubmitPassword()">
                {{ passwordSaving ? 'Updating...' : 'Update Password' }}
              </button>
              <span v-if="passwordMessage" :class="['config-msg', { 'config-msg-error': passwordError }]">{{ passwordMessage }}</span>
            </div>
          </div>
        </section>

        <!-- Google Drive Import -->
        <section class="settings-section">
          <h3>Google Drive Import</h3>
          <p class="section-desc">Import files from a Google Drive folder into your inbox.</p>
          <div v-if="!integrationsStore.googleDrive.connected" class="connect-card">
            <HardDrive :size="32" />
            <p>Connect your Google Drive to import files automatically.</p>
            <button class="btn btn-primary" @click="connectGoogleDrive" :disabled="connectPolling">
              <Loader2 v-if="connectPolling" :size="14" class="spin" />
              <span>{{ connectPolling ? 'Waiting for authorization...' : 'Connect Google Drive' }}</span>
            </button>
          </div>
          <template v-else>
            <div v-if="integrationsStore.googleDrive.needsReconnect" class="reconnect-banner">
              <AlertTriangle :size="16" />
              <div class="reconnect-text">
                <strong>Reconnect required</strong>
                <span>{{ integrationsStore.googleDrive.authError || 'Google revoked access.' }} Sync is paused until you re-authorize.</span>
              </div>
              <button class="btn btn-primary btn-sm" @click="connectGoogleDrive" :disabled="connectPolling">
                <Loader2 v-if="connectPolling" :size="14" class="spin" />
                <span>{{ connectPolling ? 'Waiting...' : 'Reconnect' }}</span>
              </button>
            </div>
            <div class="status-row">
              <CheckCircle :size="16" class="status-connected" />
              <span>Google Drive connected</span>
              <button class="btn btn-ghost btn-sm" @click="toggleEnabled">
                {{ integrationsStore.googleDrive.enabled ? 'Disable' : 'Enable' }} polling
              </button>
              <button class="btn btn-ghost btn-sm btn-danger" @click="disconnectGoogleDrive">
                <Unplug :size="14" />
                Disconnect
              </button>
            </div>
            <div class="config-form">
              <div class="form-group">
                <label>Folder name</label>
                <input v-model="folderName" type="text" placeholder="e.g. Noted Import" class="form-input" />
              </div>
              <div class="form-group">
                <label>Poll interval</label>
                <select v-model.number="pollInterval" class="form-input">
                  <option :value="1">Every 1 minute</option>
                  <option :value="2">Every 2 minutes</option>
                  <option :value="5">Every 5 minutes</option>
                  <option :value="10">Every 10 minutes</option>
                  <option :value="15">Every 15 minutes</option>
                  <option :value="30">Every 30 minutes</option>
                </select>
              </div>
              <div class="form-actions">
                <button class="btn btn-primary" @click="saveConfig" :disabled="configSaving || !folderName">
                  {{ configSaving ? 'Saving...' : 'Save Configuration' }}
                </button>
                <span v-if="configMessage" class="config-msg">{{ configMessage }}</span>
              </div>
            </div>
            <div class="scan-section">
              <button class="btn btn-secondary" @click="scanNow" :disabled="integrationsStore.scanning || !integrationsStore.googleDrive.folderId">
                <Loader2 v-if="integrationsStore.scanning" :size="14" class="spin" />
                <RefreshCw v-else :size="14" />
                {{ integrationsStore.scanning ? 'Scanning...' : 'Scan Now' }}
              </button>
              <span class="scan-info">Last scan: {{ formatDate(integrationsStore.googleDrive.lastImport) }}</span>
              <div v-if="integrationsStore.scanResult" class="scan-result">
                <CheckCircle :size="14" class="status-connected" />
                {{ integrationsStore.scanResult.imported }} file(s) imported
                <span v-if="integrationsStore.scanResult.errors?.length">, {{ integrationsStore.scanResult.errors.length }} error(s)</span>
              </div>
              <div v-if="scanError" class="scan-error">
                <AlertTriangle :size="14" />
                {{ scanError }}
              </div>
            </div>
          </template>
        </section>
        <section v-if="integrationsStore.history.length > 0" class="settings-section">
          <h3>Import History</h3>
          <div class="history-list">
            <div v-for="item in integrationsStore.history" :key="item.id" class="history-item">
              <div class="history-info">
                <span class="history-name">{{ item.drive_file_name }}</span>
                <span class="history-time">{{ formatDate(item.imported_at) }}</span>
              </div>
              <div class="history-status">
                <span :class="['status-badge', `status-${item.status}`]">{{ item.status }}</span>
                <button v-if="item.note_id" class="btn btn-ghost btn-sm" @click="openNote(item.note_id)">
                  <ExternalLink :size="12" /> View
                </button>
              </div>
            </div>
          </div>
        </section>

        <SystemStatusCard />
      </div>
    </main>
  </MobileLayout>

  <div v-else class="settings-layout">
    <AppSidebar />
    <main class="settings-main">
      <div class="settings-header">
        <Settings :size="20" />
        <h2>Settings</h2>
      </div>

      <div v-if="integrationsStore.loading" class="loading">Loading...</div>

      <div v-else class="settings-content">
        <!-- Appearance / Theme -->
        <section class="settings-section">
          <h3><Palette :size="16" /> Appearance</h3>
          <p class="section-desc">Pick a color scheme for the app. Applied immediately and remembered across sessions.</p>
          <div class="theme-grid">
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              type="button"
              :class="['theme-card', `theme-preview-${opt.value}`, { selected: uiStore.theme === opt.value }]"
              @click="uiStore.setTheme(opt.value)"
            >
              <span class="theme-swatch">
                <span class="swatch-sidebar" />
                <span class="swatch-main" />
                <span class="swatch-card" />
                <span class="swatch-accent" />
              </span>
              <span class="theme-label">{{ opt.label }}</span>
              <span class="theme-hint">{{ opt.hint }}</span>
            </button>
          </div>
        </section>

        <!-- Change Password -->
        <section class="settings-section">
          <h3><Lock :size="16" /> Change Password</h3>
          <p class="section-desc">Update your account password.</p>
          <div class="config-form">
            <div class="form-group">
              <label>Current password</label>
              <input v-model="currentPassword" type="password" class="form-input" autocomplete="current-password" />
            </div>
            <div class="form-group">
              <label>New password</label>
              <input v-model="newPassword" type="password" class="form-input" autocomplete="new-password" />
              <span class="form-hint">Minimum 8 characters</span>
            </div>
            <div class="form-group">
              <label>Confirm new password</label>
              <input v-model="confirmPassword" type="password" class="form-input" autocomplete="new-password" />
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" @click="changePassword" :disabled="passwordSaving || !canSubmitPassword()">
                {{ passwordSaving ? 'Updating...' : 'Update Password' }}
              </button>
              <span v-if="passwordMessage" :class="['config-msg', { 'config-msg-error': passwordError }]">{{ passwordMessage }}</span>
            </div>
          </div>
        </section>

        <!-- Google Drive Integration -->
        <section class="settings-section">
          <h3>Google Drive Import</h3>
          <p class="section-desc">Import files from a Google Drive folder into your inbox.</p>

          <!-- Not connected -->
          <div v-if="!integrationsStore.googleDrive.connected" class="connect-card">
            <HardDrive :size="32" />
            <p>Connect your Google Drive to import files automatically.</p>
            <button class="btn btn-primary" @click="connectGoogleDrive" :disabled="connectPolling">
              <Loader2 v-if="connectPolling" :size="14" class="spin" />
              <span>{{ connectPolling ? 'Waiting for authorization...' : 'Connect Google Drive' }}</span>
            </button>
          </div>

          <!-- Connected -->
          <template v-else>
            <!-- Reconnect banner -->
            <div v-if="integrationsStore.googleDrive.needsReconnect" class="reconnect-banner">
              <AlertTriangle :size="16" />
              <div class="reconnect-text">
                <strong>Reconnect required</strong>
                <span>{{ integrationsStore.googleDrive.authError || 'Google revoked access.' }} Sync is paused until you re-authorize.</span>
              </div>
              <button class="btn btn-primary btn-sm" @click="connectGoogleDrive" :disabled="connectPolling">
                <Loader2 v-if="connectPolling" :size="14" class="spin" />
                <span>{{ connectPolling ? 'Waiting...' : 'Reconnect' }}</span>
              </button>
            </div>
            <!-- Status -->
            <div class="status-row">
              <CheckCircle :size="16" class="status-connected" />
              <span>Google Drive connected</span>
              <button class="btn btn-ghost btn-sm" @click="toggleEnabled">
                {{ integrationsStore.googleDrive.enabled ? 'Disable' : 'Enable' }} polling
              </button>
              <button class="btn btn-ghost btn-sm btn-danger" @click="disconnectGoogleDrive">
                <Unplug :size="14" />
                Disconnect
              </button>
            </div>

            <!-- Folder configuration -->
            <div class="config-form">
              <div class="form-group">
                <label>Folder name</label>
                <input
                  v-model="folderName"
                  type="text"
                  placeholder="e.g. Noted Import"
                  class="form-input"
                />
                <span class="form-hint">Enter the exact name of a folder in your Google Drive</span>
              </div>
              <div class="form-group">
                <label>Poll interval</label>
                <select v-model.number="pollInterval" class="form-input">
                  <option :value="1">Every 1 minute</option>
                  <option :value="2">Every 2 minutes</option>
                  <option :value="5">Every 5 minutes</option>
                  <option :value="10">Every 10 minutes</option>
                  <option :value="15">Every 15 minutes</option>
                  <option :value="30">Every 30 minutes</option>
                </select>
              </div>
              <div class="form-actions">
                <button class="btn btn-primary" @click="saveConfig" :disabled="configSaving || !folderName">
                  {{ configSaving ? 'Saving...' : 'Save Configuration' }}
                </button>
                <span v-if="configMessage" class="config-msg">{{ configMessage }}</span>
              </div>
            </div>

            <!-- Manual scan -->
            <div class="scan-section">
              <button
                class="btn btn-secondary"
                @click="scanNow"
                :disabled="integrationsStore.scanning || !integrationsStore.googleDrive.folderId"
              >
                <Loader2 v-if="integrationsStore.scanning" :size="14" class="spin" />
                <RefreshCw v-else :size="14" />
                {{ integrationsStore.scanning ? 'Scanning...' : 'Scan Now' }}
              </button>
              <span class="scan-info">Last scan: {{ formatDate(integrationsStore.googleDrive.lastImport) }}</span>
              <div v-if="integrationsStore.scanResult" class="scan-result">
                <CheckCircle :size="14" class="status-connected" />
                {{ integrationsStore.scanResult.imported }} file(s) imported
                <span v-if="integrationsStore.scanResult.errors?.length">, {{ integrationsStore.scanResult.errors.length }} error(s)</span>
              </div>
              <div v-if="scanError" class="scan-error">
                <AlertTriangle :size="14" />
                {{ scanError }}
              </div>
            </div>
          </template>
        </section>

        <!-- Import History -->
        <section v-if="integrationsStore.history.length > 0" class="settings-section">
          <h3>Import History</h3>
          <div class="history-list">
            <div v-for="item in integrationsStore.history" :key="item.id" class="history-item">
              <div class="history-info">
                <span class="history-name">{{ item.drive_file_name }}</span>
                <span class="history-time">{{ formatDate(item.imported_at) }}</span>
              </div>
              <div class="history-status">
                <span :class="['status-badge', `status-${item.status}`]">{{ item.status }}</span>
                <button v-if="item.note_id" class="btn btn-ghost btn-sm" @click="openNote(item.note_id)">
                  <ExternalLink :size="12" /> View
                </button>
              </div>
            </div>
          </div>
        </section>

        <SystemStatusCard />
      </div>
    </main>
  </div>
</template>

<style scoped>
.settings-layout {
  display: flex;
  height: 100vh;
}

.settings-main {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
}

.settings-header h2 { margin: 0; }

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px;
  color: var(--text-muted);
}

.settings-content {
  max-width: 640px;
}

.settings-section {
  margin-bottom: 32px;
  padding: 20px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}

.settings-section h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: var(--text-primary);
}

.section-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin: 0 0 16px 0;
}

/* Connect card */
.connect-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 32px;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
  color: var(--text-muted);
  text-align: center;
}

.connect-card p {
  margin: 0;
  font-size: 13px;
}

/* Status row */
.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--status-success-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  margin-bottom: 16px;
  font-size: 13px;
  color: var(--text-primary);
}

.status-connected { color: var(--status-success); }

.status-row .btn { margin-left: auto; }
.status-row .btn + .btn { margin-left: 4px; }

/* Config form */
.config-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-group label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-input {
  padding: 8px 12px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
}

.form-input:focus {
  outline: none;
  border-color: var(--accent-primary);
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.form-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.config-msg {
  font-size: 12px;
  color: var(--status-success);
}

.config-msg-error {
  color: var(--status-error);
}

/* Scan section */
.scan-section {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.scan-info {
  font-size: 12px;
  color: var(--text-muted);
}

.scan-result {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--status-success);
  width: 100%;
  margin-top: 4px;
}

.scan-error {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--status-error);
  width: 100%;
  margin-top: 4px;
}

.reconnect-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--status-warning-bg);
  border: 1px solid var(--status-warning);
  border-radius: 6px;
  margin-bottom: 12px;
  color: var(--text-primary);
}

.reconnect-banner > svg { color: var(--status-warning); flex-shrink: 0; }

.reconnect-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  font-size: 13px;
}

.reconnect-text strong { font-size: 13px; }
.reconnect-text span { font-size: 12px; color: var(--text-secondary); }

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-primary);
  color: var(--text-primary);
}
[data-theme="light"] .btn-primary { color: #ffffff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }

.btn-secondary {
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
}
.btn-secondary:hover:not(:disabled) { border-color: var(--accent-primary); }

.btn-ghost {
  background: none;
  color: var(--text-muted);
  padding: 4px 8px;
}
.btn-ghost:hover { color: var(--text-primary); }

.btn-sm {
  font-size: 11px;
  padding: 4px 8px;
}

.btn-danger:hover { color: var(--status-error); }

/* History */
.history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  overflow-y: auto;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  font-size: 12px;
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.history-name {
  color: var(--text-primary);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  color: var(--text-muted);
  font-size: 11px;
}

.history-status {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.status-badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
}

.status-success {
  background: var(--status-success-bg);
  color: var(--status-success);
}

.status-error {
  background: var(--status-error-bg);
  color: var(--status-error);
}

.status-skipped {
  background: var(--status-warning-bg);
  color: var(--status-warning);
}

/* Spinner */
.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Theme picker */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.theme-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 12px;
  background: var(--bg-main);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: 'Inter', sans-serif;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, transform 0.15s;
}

.theme-card:hover { border-color: var(--accent-primary); }

.theme-card.selected {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 2px var(--accent-primary) inset;
}

.theme-swatch {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  width: 100%;
  height: 56px;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  margin-bottom: 6px;
}

.swatch-sidebar, .swatch-main, .swatch-card, .swatch-accent {
  display: block;
  width: 100%;
  height: 100%;
}

/* Each preview card renders its own palette, regardless of the active theme */
.theme-preview-sapphire .swatch-sidebar { background: #102a50; }
.theme-preview-sapphire .swatch-main    { background: #1a3a6d; }
.theme-preview-sapphire .swatch-card    { background: #244a85; }
.theme-preview-sapphire .swatch-accent  { background: #ff9f1c; }

.theme-preview-dark .swatch-sidebar { background: #141414; }
.theme-preview-dark .swatch-main    { background: #1e1e1e; }
.theme-preview-dark .swatch-card    { background: #2a2a2a; }
.theme-preview-dark .swatch-accent  { background: #5b9dff; }

.theme-preview-light .swatch-sidebar { background: #f3f5f8; }
.theme-preview-light .swatch-main    { background: #ffffff; }
.theme-preview-light .swatch-card    { background: #e5e8ec; }
.theme-preview-light .swatch-accent  { background: #2563eb; }

.theme-label {
  font-size: 13px;
  font-weight: 600;
}

.theme-hint {
  font-size: 11px;
  color: var(--text-muted);
}
</style>
