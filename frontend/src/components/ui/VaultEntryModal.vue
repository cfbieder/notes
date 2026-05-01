<script setup>
import { ref, watch, computed } from 'vue';
import { Eye, EyeOff, Copy, RefreshCw, X, KeyRound, Lock } from 'lucide-vue-next';
import { generatePassword } from '../../lib/vaultCrypto.js';
import { useToastsStore } from '../../stores/toasts.js';

const props = defineProps({
  entry: { type: Object, default: null }    // null = create
});
const emit = defineEmits(['save', 'cancel', 'delete']);

const toasts = useToastsStore();

const type = ref('password');                // 'password' | 'key'
const name = ref('');
const username = ref('');
const password = ref('');
const url = ref('');
const notes = ref('');
const reveal = ref(false);
const saving = ref(false);
const genLength = ref(24);

const isEdit = computed(() => !!props.entry?.id);
const canSave = computed(() => name.value.trim().length > 0);
const isKey = computed(() => type.value === 'key');

watch(() => props.entry, (e) => {
  type.value = e?.type === 'key' ? 'key' : 'password';
  name.value = e?.name ?? '';
  username.value = e?.username ?? '';
  password.value = e?.password ?? '';
  url.value = e?.url ?? '';
  notes.value = e?.notes ?? '';
  reveal.value = false;
}, { immediate: true });

async function copy(value, label) {
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    toasts.addToast({ message: `${label} copied — clears in 30 s`, type: 'info', duration: 2000 });
    setTimeout(() => navigator.clipboard.writeText('').catch(() => {}), 30000);
  } catch {
    toasts.addToast({ message: 'Clipboard unavailable', type: 'error' });
  }
}

function generate() {
  const len = Math.max(4, Math.min(128, parseInt(genLength.value, 10) || 24));
  genLength.value = len;
  password.value = generatePassword(len);
  reveal.value = true;
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    emit('save', {
      type: type.value,
      name: name.value.trim(),
      username: isKey.value ? '' : username.value,
      password: password.value,
      url: isKey.value ? '' : url.value,
      notes: notes.value
    });
  } finally {
    saving.value = false;
  }
}

const secretLabel = computed(() => isKey.value ? 'Key' : 'Password');
const secretPlaceholder = computed(() => isKey.value
  ? '-----BEGIN PRIVATE KEY-----\n…or paste an API token, recovery code, etc.'
  : '••••••••');
</script>

<template>
  <Teleport to="body">
    <div class="vault-modal-overlay" @click.self="emit('cancel')">
      <div class="vault-modal">
        <div class="vault-modal-header">
          <h3>{{ isEdit ? 'Edit entry' : 'New entry' }}</h3>
          <button class="icon-btn" @click="emit('cancel')" aria-label="Close"><X :size="16" /></button>
        </div>

        <div class="vault-modal-body">
          <!-- Type selector — locked once an entry exists, so we don't need to
               migrate fields on the fly. Edit-existing keeps its original type. -->
          <div class="type-selector" :class="{ 'is-locked': isEdit }">
            <button
              type="button"
              class="type-option"
              :class="{ active: type === 'password' }"
              :disabled="isEdit"
              @click="type = 'password'"
            >
              <Lock :size="14" /> Password
            </button>
            <button
              type="button"
              class="type-option"
              :class="{ active: type === 'key' }"
              :disabled="isEdit"
              @click="type = 'key'"
            >
              <KeyRound :size="14" /> Key
            </button>
          </div>

          <label>
            <span>Name *</span>
            <input v-model="name" :placeholder="isKey ? 'SSH Production' : 'GitHub'" autofocus />
          </label>

          <label v-if="!isKey">
            <span>Username</span>
            <div class="field-with-action">
              <input v-model="username" placeholder="user@example.com" />
              <button type="button" class="field-action" :disabled="!username" @click="copy(username, 'Username')" title="Copy">
                <Copy :size="14" />
              </button>
            </div>
          </label>

          <label>
            <span>{{ secretLabel }}</span>
            <div v-if="isKey" class="key-field">
              <textarea
                :class="{ revealed: reveal }"
                v-model="password"
                rows="6"
                spellcheck="false"
                autocomplete="off"
                :placeholder="secretPlaceholder"
              ></textarea>
              <div class="key-field-actions">
                <button type="button" class="field-action" @click="reveal = !reveal" :title="reveal ? 'Mask' : 'Reveal'">
                  <Eye v-if="!reveal" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
                <button type="button" class="field-action" :disabled="!password" @click="copy(password, 'Key')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </div>
            <div v-else class="field-with-action">
              <input :type="reveal ? 'text' : 'password'" v-model="password" :placeholder="secretPlaceholder" autocomplete="new-password" />
              <button type="button" class="field-action" @click="reveal = !reveal" :title="reveal ? 'Hide' : 'Reveal'">
                <Eye v-if="!reveal" :size="14" />
                <EyeOff v-else :size="14" />
              </button>
              <button type="button" class="field-action" :disabled="!password" @click="copy(password, 'Password')" title="Copy">
                <Copy :size="14" />
              </button>
              <button type="button" class="field-action" @click="generate" title="Generate password">
                <RefreshCw :size="14" />
              </button>
            </div>
            <div v-if="!isKey" class="generate-row">
              <label class="length-label">
                Length
                <input type="number" min="4" max="128" v-model.number="genLength" class="length-input" />
              </label>
              <span class="hint">Click <RefreshCw :size="11" class="inline-icon" /> to generate</span>
            </div>
          </label>

          <label v-if="!isKey">
            <span>URL</span>
            <div class="field-with-action">
              <input v-model="url" placeholder="https://example.com" />
              <button type="button" class="field-action" :disabled="!url" @click="copy(url, 'URL')" title="Copy">
                <Copy :size="14" />
              </button>
            </div>
          </label>

          <label>
            <span>Notes</span>
            <textarea v-model="notes" rows="3" placeholder="Recovery codes, security questions, ..."></textarea>
          </label>
        </div>

        <div class="vault-modal-footer">
          <button v-if="isEdit" type="button" class="btn-danger" @click="emit('delete', entry)">Delete</button>
          <div class="footer-spacer"></div>
          <button type="button" class="btn-secondary" @click="emit('cancel')">Cancel</button>
          <button type="button" class="btn-primary" :disabled="!canSave || saving" @click="save">
            {{ saving ? 'Saving…' : (isEdit ? 'Save' : 'Create') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.vault-modal-overlay {
  position: fixed; inset: 0;
  background: var(--overlay-modal);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000;
}
.vault-modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 480px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  display: flex; flex-direction: column;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
}
.vault-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.vault-modal-header h3 { margin: 0; font-size: 15px; }
.icon-btn {
  background: none; border: none; color: var(--text-secondary);
  cursor: pointer; padding: 4px;
}
.icon-btn:hover { color: var(--text-primary); }
.vault-modal-body {
  padding: 16px 18px;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
}

.type-selector {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: var(--bg-input, var(--bg-main));
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.type-selector.is-locked { opacity: 0.6; }
.type-option {
  flex: 1;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  padding: 6px 10px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
}
.type-option.active {
  background: var(--bg-card);
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.type-option:disabled { cursor: default; }
.type-option:not(:disabled):hover:not(.active) { color: var(--text-primary); }

label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: var(--text-secondary);
}
input, textarea {
  background: var(--bg-input, var(--bg-card));
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 7px 10px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  color: var(--text-primary);
}
input:focus, textarea:focus {
  outline: none;
  border-color: var(--accent-primary);
}
textarea { font-family: ui-monospace, monospace; resize: vertical; }
.field-with-action { display: flex; gap: 4px; }
.field-with-action input { flex: 1; }
.field-action {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0 8px;
  display: inline-flex; align-items: center; justify-content: center;
}
.field-action:hover:not(:disabled) {
  color: var(--text-primary);
  border-color: var(--border-strong);
}
.field-action:disabled { opacity: 0.4; cursor: not-allowed; }

/* Key field — tall textarea for long secrets, with masking via -webkit-text-security */
.key-field { position: relative; display: flex; flex-direction: column; gap: 4px; }
.key-field textarea {
  -webkit-text-security: disc;
  text-security: disc;
  letter-spacing: 1px;
}
.key-field textarea.revealed {
  -webkit-text-security: none;
  text-security: none;
  letter-spacing: 0;
}
.key-field-actions {
  display: flex; gap: 4px; justify-content: flex-end;
}

.generate-row {
  display: flex; align-items: center; gap: 12px;
  padding-top: 4px;
  font-size: 11px;
}
.length-label {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 11px;
}
.length-input {
  width: 56px;
  padding: 4px 6px;
  font-size: 12px;
}
.hint {
  display: inline-flex; align-items: center; gap: 4px;
  color: var(--text-muted, var(--text-secondary));
}
.inline-icon { vertical-align: -1px; }

.vault-modal-footer {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 18px;
  border-top: 1px solid var(--border-subtle);
}
.footer-spacer { flex: 1; }
.btn-primary, .btn-secondary, .btn-danger {
  padding: 7px 16px;
  border-radius: 6px;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  cursor: pointer;
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
.btn-danger {
  background: none;
  border: 1px solid #e53935;
  color: #e53935;
}
.btn-danger:hover { background: rgba(229, 57, 53, 0.08); }
</style>
