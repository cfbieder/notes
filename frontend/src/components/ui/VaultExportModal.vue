<script setup>
import { ref, computed } from 'vue';
import { ShieldAlert, Download } from 'lucide-vue-next';

const props = defineProps({
  entryCount: { type: Number, default: 0 }
});

const emit = defineEmits(['export', 'cancel']);

const passphrase = ref('');
const confirm = ref('');
const acknowledged = ref(false);
const busy = ref(false);
const error = ref('');

const canSubmit = computed(() =>
  passphrase.value.length >= 8 &&
  passphrase.value === confirm.value &&
  acknowledged.value &&
  props.entryCount > 0
);

async function doExport() {
  error.value = '';
  if (!canSubmit.value) {
    if (passphrase.value.length < 8) error.value = 'Use at least 8 characters.';
    else if (passphrase.value !== confirm.value) error.value = 'Passphrases do not match.';
    return;
  }
  busy.value = true;
  try {
    // Parent performs the encryption + download (it owns the decrypted entries).
    await emit('export', passphrase.value);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="overlay" @click.self="$emit('cancel')">
      <div class="modal">
        <div class="header">
          <Download :size="18" />
          <h3>Emergency export</h3>
        </div>

        <div class="body">
          <p class="intro">
            Creates a single <strong>self-decrypting HTML file</strong> containing all
            {{ entryCount }} vault {{ entryCount === 1 ? 'entry' : 'entries' }}. Save it somewhere
            safe (USB drive, offline backup). Open it in any web browser, with no internet and
            without Noted, then enter the passphrase below to read your secrets.
          </p>

          <div class="warn">
            <ShieldAlert :size="16" />
            <div>
              The passphrase below is the <strong>only</strong> thing protecting this file — it is
              separate from your vault master password and is never stored. If you forget it, the
              file is unreadable. If someone gets both the file and the passphrase, they get everything.
            </div>
          </div>

          <form class="form" @submit.prevent="doExport">
            <label>
              <span>Export passphrase (min 8 chars)</span>
              <input type="password" v-model="passphrase" autocomplete="new-password" autofocus />
            </label>
            <label>
              <span>Confirm passphrase</span>
              <input type="password" v-model="confirm" autocomplete="new-password" />
            </label>
            <label class="ack">
              <input type="checkbox" v-model="acknowledged" />
              <span>I understand this file holds my secrets and forgetting the passphrase makes it unreadable.</span>
            </label>
            <div v-if="error" class="error-text">{{ error }}</div>
          </form>
        </div>

        <div class="footer">
          <button class="btn-secondary" @click="$emit('cancel')" :disabled="busy">Cancel</button>
          <button class="btn-primary" @click="doExport" :disabled="!canSubmit || busy">
            <Download :size="14" />
            {{ busy ? 'Encrypting…' : 'Download encrypted file' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed; inset: 0;
  background: var(--overlay-modal);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000; padding: 16px;
}
.modal {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  width: 480px; max-width: 100%;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.header {
  display: flex; align-items: center; gap: 8px;
  padding: 16px 20px 0;
}
.header h3 { margin: 0; font-size: 16px; }
.body { padding: 12px 20px 16px; }
.intro {
  margin: 0 0 14px;
  font-size: 13px; line-height: 1.5;
  color: var(--text-secondary);
}
.warn {
  display: flex; gap: 10px;
  background: rgba(229, 57, 53, 0.08);
  border: 1px solid rgba(229, 57, 53, 0.3);
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 16px;
  font-size: 12px; line-height: 1.5;
  color: var(--text-primary);
}
.warn svg { color: #e53935; flex-shrink: 0; margin-top: 2px; }
.form { display: flex; flex-direction: column; gap: 12px; }
.form label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 12px; color: var(--text-secondary);
}
.form label.ack { flex-direction: row; align-items: flex-start; gap: 8px; }
.form input[type="password"] {
  background: var(--bg-input, var(--bg-main));
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 13px;
  color: var(--text-primary);
}
.form input:focus { outline: none; border-color: var(--accent-primary); }
.error-text { color: #e53935; font-size: 12px; }
.footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding: 12px 20px;
  border-top: 1px solid var(--border-subtle);
}
.btn-primary, .btn-secondary {
  padding: 7px 14px; border-radius: 6px;
  font-family: 'Inter', sans-serif; font-size: 13px;
  cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.btn-primary { background: var(--accent-primary); border: none; color: white; font-weight: 500; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary:hover:not(:disabled) { opacity: 0.88; }
.btn-secondary { background: none; border: 1px solid var(--border-subtle); color: var(--text-secondary); }
.btn-secondary:hover:not(:disabled) { color: var(--text-primary); border-color: var(--border-strong); }
.btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
