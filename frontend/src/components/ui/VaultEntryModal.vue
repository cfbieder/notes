<script setup>
import { ref, watch, computed } from 'vue';
import { Eye, EyeOff, Copy, RefreshCw, X, KeyRound, Lock, CreditCard, Landmark } from 'lucide-vue-next';
import { generatePassword } from '../../lib/vaultCrypto.js';
import { useToastsStore } from '../../stores/toasts.js';

const props = defineProps({
  entry: { type: Object, default: null },     // null = create
  defaultType: { type: String, default: 'password' },
  existingGroups: { type: Array, default: () => [] }  // group names already in use for this type
});
const emit = defineEmits(['save', 'cancel', 'delete']);

const toasts = useToastsStore();

// 'password' | 'key' | 'card' | 'bank'
const type = ref('password');

// Shared
const name = ref('');
const group = ref('');
const notes = ref('');
const saving = ref(false);

// Password / Key
const username = ref('');
const password = ref('');
const url = ref('');
const reveal = ref(false);
const genLength = ref(24);

// Card
const cardNumber = ref('');
const expiration = ref('');
const cvv = ref('');
const revealCardNumber = ref(false);
const revealCvv = ref(false);

// Bank
const accountNumber = ref('');
const routingNumber = ref('');
const swiftBic = ref('');
const revealAccountNumber = ref(false);

const isEdit = computed(() => !!props.entry?.id);
const canSave = computed(() => name.value.trim().length > 0);
const isPassword = computed(() => type.value === 'password');
const isKey = computed(() => type.value === 'key');
const isCard = computed(() => type.value === 'card');
const isBank = computed(() => type.value === 'bank');

function isValidType(t) {
  return t === 'password' || t === 'key' || t === 'card' || t === 'bank';
}

watch(() => props.entry, (e) => {
  // On edit, lock to entry's existing type. On create, honor defaultType so the
  // "+ New entry" button respects the currently-selected list tab.
  const initialType = e?.type && isValidType(e.type)
    ? e.type
    : (isValidType(props.defaultType) ? props.defaultType : 'password');
  type.value = initialType;

  name.value = e?.name ?? '';
  group.value = e?.group ?? '';
  notes.value = e?.notes ?? '';

  username.value = e?.username ?? '';
  password.value = e?.password ?? '';
  url.value = e?.url ?? '';
  reveal.value = false;

  cardNumber.value = e?.card_number ?? '';
  expiration.value = e?.expiration ?? '';
  cvv.value = e?.cvv ?? '';
  revealCardNumber.value = false;
  revealCvv.value = false;

  accountNumber.value = e?.account_number ?? '';
  routingNumber.value = e?.routing_number ?? '';
  swiftBic.value = e?.swift_bic ?? '';
  revealAccountNumber.value = false;
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
    const base = { type: type.value, name: name.value.trim(), group: group.value.trim(), notes: notes.value };
    let payload;
    if (isCard.value) {
      payload = {
        ...base,
        card_number: cardNumber.value,
        expiration: expiration.value,
        cvv: cvv.value
      };
    } else if (isBank.value) {
      payload = {
        ...base,
        account_number: accountNumber.value,
        routing_number: routingNumber.value,
        swift_bic: swiftBic.value
      };
    } else if (isKey.value) {
      payload = { ...base, username: '', password: password.value, url: '' };
    } else {
      payload = {
        ...base,
        username: username.value,
        password: password.value,
        url: url.value
      };
    }
    emit('save', payload);
  } finally {
    saving.value = false;
  }
}

const passwordSecretLabel = computed(() => isKey.value ? 'Key' : 'Password');
const passwordSecretPlaceholder = computed(() => isKey.value
  ? '-----BEGIN PRIVATE KEY-----\n…or paste an API token, recovery code, etc.'
  : '••••••••');
const notesLabel = computed(() => (isCard.value || isBank.value) ? 'Comments' : 'Notes');
const nameLabel = computed(() => {
  if (isCard.value) return 'Card Name *';
  if (isBank.value) return 'Account Name *';
  return 'Name *';
});
const namePlaceholder = computed(() => {
  if (isCard.value) return 'Personal Visa';
  if (isBank.value) return 'Checking — Bank of X';
  if (isKey.value) return 'SSH Production';
  return 'GitHub';
});
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
              :class="{ active: isPassword }"
              :disabled="isEdit"
              @click="type = 'password'"
            >
              <Lock :size="13" /> Password
            </button>
            <button
              type="button"
              class="type-option"
              :class="{ active: isKey }"
              :disabled="isEdit"
              @click="type = 'key'"
            >
              <KeyRound :size="13" /> Key
            </button>
            <button
              type="button"
              class="type-option"
              :class="{ active: isCard }"
              :disabled="isEdit"
              @click="type = 'card'"
            >
              <CreditCard :size="13" /> Card
            </button>
            <button
              type="button"
              class="type-option"
              :class="{ active: isBank }"
              :disabled="isEdit"
              @click="type = 'bank'"
            >
              <Landmark :size="13" /> Bank
            </button>
          </div>

          <label>
            <span>{{ nameLabel }}</span>
            <input v-model="name" :placeholder="namePlaceholder" autofocus />
          </label>

          <label>
            <span>Group <span class="optional">(optional)</span></span>
            <input
              v-model="group"
              list="vault-group-suggestions"
              placeholder="e.g. Work, Personal, Servers"
            />
            <datalist id="vault-group-suggestions">
              <option v-for="g in existingGroups" :key="g" :value="g" />
            </datalist>
          </label>

          <!-- ===== PASSWORD ===== -->
          <template v-if="isPassword">
            <label>
              <span>Username</span>
              <div class="field-with-action">
                <input v-model="username" placeholder="user@example.com" />
                <button type="button" class="field-action" :disabled="!username" @click="copy(username, 'Username')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>

            <label>
              <span>Password</span>
              <div class="field-with-action">
                <input :type="reveal ? 'text' : 'password'" v-model="password" placeholder="••••••••" autocomplete="new-password" />
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
              <div class="generate-row">
                <label class="length-label">
                  Length
                  <input type="number" min="4" max="128" v-model.number="genLength" class="length-input" />
                </label>
                <span class="hint">Click <RefreshCw :size="11" class="inline-icon" /> to generate</span>
              </div>
            </label>

            <label>
              <span>URL</span>
              <div class="field-with-action">
                <input v-model="url" placeholder="https://example.com" />
                <button type="button" class="field-action" :disabled="!url" @click="copy(url, 'URL')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>
          </template>

          <!-- ===== KEY ===== -->
          <template v-else-if="isKey">
            <label>
              <span>{{ passwordSecretLabel }}</span>
              <div class="key-field">
                <textarea
                  :class="{ revealed: reveal }"
                  v-model="password"
                  rows="6"
                  spellcheck="false"
                  autocomplete="off"
                  :placeholder="passwordSecretPlaceholder"
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
            </label>
          </template>

          <!-- ===== CARD ===== -->
          <template v-else-if="isCard">
            <label>
              <span>Card Number</span>
              <div class="field-with-action">
                <input :type="revealCardNumber ? 'text' : 'password'" v-model="cardNumber" placeholder="•••• •••• •••• ••••" autocomplete="off" />
                <button type="button" class="field-action" @click="revealCardNumber = !revealCardNumber" :title="revealCardNumber ? 'Hide' : 'Reveal'">
                  <Eye v-if="!revealCardNumber" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
                <button type="button" class="field-action" :disabled="!cardNumber" @click="copy(cardNumber, 'Card number')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>

            <label>
              <span>Expiration Date</span>
              <div class="field-with-action">
                <input v-model="expiration" placeholder="MM/YY" autocomplete="off" />
                <button type="button" class="field-action" :disabled="!expiration" @click="copy(expiration, 'Expiration')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>

            <label>
              <span>Security Code</span>
              <div class="field-with-action">
                <input :type="revealCvv ? 'text' : 'password'" v-model="cvv" placeholder="•••" autocomplete="off" />
                <button type="button" class="field-action" @click="revealCvv = !revealCvv" :title="revealCvv ? 'Hide' : 'Reveal'">
                  <Eye v-if="!revealCvv" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
                <button type="button" class="field-action" :disabled="!cvv" @click="copy(cvv, 'Security code')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>
          </template>

          <!-- ===== BANK ===== -->
          <template v-else-if="isBank">
            <label>
              <span>Account Number / IBAN</span>
              <div class="field-with-action">
                <input :type="revealAccountNumber ? 'text' : 'password'" v-model="accountNumber" placeholder="••••••••••••" autocomplete="off" />
                <button type="button" class="field-action" @click="revealAccountNumber = !revealAccountNumber" :title="revealAccountNumber ? 'Hide' : 'Reveal'">
                  <Eye v-if="!revealAccountNumber" :size="14" />
                  <EyeOff v-else :size="14" />
                </button>
                <button type="button" class="field-action" :disabled="!accountNumber" @click="copy(accountNumber, 'Account number')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>

            <label>
              <span>Routing Number</span>
              <div class="field-with-action">
                <input v-model="routingNumber" placeholder="123456789" autocomplete="off" />
                <button type="button" class="field-action" :disabled="!routingNumber" @click="copy(routingNumber, 'Routing number')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>

            <label>
              <span>SWIFT / BIC Code</span>
              <div class="field-with-action">
                <input v-model="swiftBic" placeholder="BOFAUS3N" autocomplete="off" />
                <button type="button" class="field-action" :disabled="!swiftBic" @click="copy(swiftBic, 'SWIFT/BIC')" title="Copy">
                  <Copy :size="14" />
                </button>
              </div>
            </label>
          </template>

          <label>
            <span>{{ notesLabel }}</span>
            <textarea v-model="notes" rows="3" :placeholder="(isCard || isBank) ? 'Any extra info…' : 'Recovery codes, security questions, ...'"></textarea>
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
  display: inline-flex; align-items: center; justify-content: center; gap: 5px;
  padding: 6px 8px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
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
.optional { color: var(--text-muted, var(--text-secondary)); font-weight: 400; opacity: 0.8; }
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
