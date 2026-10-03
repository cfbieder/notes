<script setup>
import { ref, computed, onMounted } from 'vue';
import { Sparkles, Loader2, CheckCircle, XCircle } from 'lucide-vue-next';
import { useAiProvidersStore } from '../../stores/aiProviders.js';
import ConfirmModal from '../ui/ConfirmModal.vue';

// Phase 1 covers the "text" capability (AI Assist + translation). OCR /
// transcription land in later phases.
const CAPABILITY = 'text';

const store = useAiProvidersStore();

const provider = ref('gateway');
const modelQuick = ref('');
const modelDeep = ref('');
const modelCondense = ref('');
const baseUrl = ref('');
const apiKey = ref('');
const hasKey = ref(false);

const saving = ref(false);
const testing = ref(false);
const message = ref('');
const isError = ref(false);
const testResult = ref(null); // { ok, message }
const showResetConfirm = ref(false);

const isCloud = computed(() => provider.value !== 'gateway');
const showBaseUrl = computed(() => provider.value === 'openai_compatible');
const keyOptional = computed(() => provider.value === 'openai_compatible');
// A local / OpenAI-compatible provider has no fixed endpoint: without a Base
// URL, Save and Test can only fail, so block them and say why.
const missingBaseUrl = computed(() => showBaseUrl.value && !baseUrl.value.trim());
const hasExistingRow = computed(() => !!store.forCapability(CAPABILITY));

const modelPlaceholders = computed(() => {
  if (provider.value === 'anthropic') {
    return { quick: 'claude-haiku-4-5', deep: 'claude-opus-5', condense: 'claude-haiku-4-5' };
  }
  if (provider.value === 'openai') {
    return { quick: 'e.g. gpt-… (mini)', deep: 'e.g. gpt-… (large)', condense: 'e.g. gpt-… (mini)' };
  }
  return { quick: 'model name', deep: 'model name', condense: 'model name' };
});

function loadFromStore() {
  const cfg = store.forCapability(CAPABILITY);
  if (!cfg) {
    provider.value = 'gateway';
    return;
  }
  provider.value = cfg.provider;
  baseUrl.value = cfg.baseUrl || '';
  hasKey.value = !!cfg.hasKey;
  const m = cfg.modelConfig || {};
  modelQuick.value = m.quick || '';
  modelDeep.value = m.deep || '';
  modelCondense.value = m.condense || '';
}

onMounted(async () => {
  if (!store.loaded) await store.fetchAll();
  loadFromStore();
});

function buildPayload() {
  const payload = { provider: provider.value };
  if (isCloud.value) {
    payload.modelConfig = { quick: modelQuick.value.trim(), deep: modelDeep.value.trim(), condense: modelCondense.value.trim() };
    if (showBaseUrl.value) payload.baseUrl = baseUrl.value.trim();
    if (apiKey.value.trim()) payload.apiKey = apiKey.value.trim();
  }
  return payload;
}

async function save() {
  saving.value = true; message.value = ''; isError.value = false; testResult.value = null;
  try {
    const saved = await store.save(CAPABILITY, buildPayload());
    hasKey.value = !!saved.hasKey;
    apiKey.value = '';
    message.value = 'Saved.';
  } catch (e) {
    isError.value = true;
    message.value = e?.message || 'Save failed';
  } finally {
    saving.value = false;
  }
}

async function runTest() {
  testing.value = true; testResult.value = null; message.value = '';
  try {
    const payload = { provider: provider.value };
    if (showBaseUrl.value) payload.baseUrl = baseUrl.value.trim();
    if (apiKey.value.trim()) payload.apiKey = apiKey.value.trim();
    testResult.value = await store.test(CAPABILITY, payload);
  } catch (e) {
    testResult.value = { ok: false, message: e?.message || 'Test failed' };
  } finally {
    testing.value = false;
  }
}

async function resetToDefault() {
  showResetConfirm.value = false;
  saving.value = true; message.value = ''; isError.value = false;
  try {
    await store.remove(CAPABILITY);
    provider.value = 'gateway';
    modelQuick.value = modelDeep.value = modelCondense.value = baseUrl.value = apiKey.value = '';
    hasKey.value = false;
    message.value = 'Reset to the built-in gateway.';
  } catch (e) {
    isError.value = true;
    message.value = e?.message || 'Reset failed';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="settings-section">
    <h3><Sparkles :size="16" /> AI Provider (Text)</h3>
    <p class="section-desc">
      Choose which AI powers text generation (AI Assist &amp; translation). The built-in
      gateway is the default; you can point it at Anthropic (Claude), OpenAI, or a local
      OpenAI-compatible server instead. Keys are stored encrypted and never shown again.
    </p>

    <div class="config-form">
      <div class="form-group">
        <label>Provider</label>
        <select v-model="provider" class="form-input">
          <option value="gateway">Built-in gateway (default)</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
          <option value="openai_compatible">Local / OpenAI-compatible</option>
        </select>
      </div>

      <template v-if="isCloud">
        <div v-if="showBaseUrl" class="form-group">
          <label>Base URL <span class="section-hint">(required)</span></label>
          <input v-model="baseUrl" type="text" class="form-input" placeholder="http://localhost:11434/v1"
                 :aria-invalid="missingBaseUrl" />
          <span class="section-hint">Local/private hosts require <code>AI_PROVIDER_ALLOW_PRIVATE=true</code> on the server.</span>
        </div>

        <div class="form-group">
          <label>Quick model</label>
          <input v-model="modelQuick" type="text" class="form-input" :placeholder="modelPlaceholders.quick" />
        </div>
        <div class="form-group">
          <label>Deep model</label>
          <input v-model="modelDeep" type="text" class="form-input" :placeholder="modelPlaceholders.deep" />
        </div>
        <div class="form-group">
          <label>Condense model</label>
          <input v-model="modelCondense" type="text" class="form-input" :placeholder="modelPlaceholders.condense" />
        </div>

        <div class="form-group">
          <label>API key <span v-if="keyOptional" class="section-hint">(optional for local)</span></label>
          <input v-model="apiKey" type="password" class="form-input" autocomplete="off"
                 :placeholder="hasKey ? '•••••••• (leave blank to keep current)' : 'Paste your API key'" />
        </div>
      </template>

      <div class="btn-row">
        <button class="btn btn-primary" @click="save" :disabled="saving || missingBaseUrl"
                :title="missingBaseUrl ? 'Enter the Base URL of your local / OpenAI-compatible server' : ''">
          <Loader2 v-if="saving" :size="14" class="spin" />
          <span>{{ saving ? 'Saving…' : 'Save' }}</span>
        </button>
        <button class="btn btn-secondary" @click="runTest" :disabled="testing || missingBaseUrl"
                :title="missingBaseUrl ? 'Enter the Base URL of your local / OpenAI-compatible server' : ''">
          <Loader2 v-if="testing" :size="14" class="spin" />
          <span>{{ testing ? 'Testing…' : 'Test connection' }}</span>
        </button>
        <button v-if="hasExistingRow" class="btn btn-ghost btn-danger" @click="showResetConfirm = true" :disabled="saving">
          Reset to default
        </button>
      </div>

      <span v-if="message" :class="['config-msg', { 'config-msg-error': isError }]">{{ message }}</span>
      <div v-if="testResult" class="test-result">
        <CheckCircle v-if="testResult.ok" :size="14" class="status-connected" />
        <XCircle v-else :size="14" class="status-error" />
        <span>{{ testResult.message }}</span>
      </div>
    </div>

    <ConfirmModal v-if="showResetConfirm"
      title="Reset AI provider"
      message="Remove this provider configuration (including any stored API key) and fall back to the built-in gateway?"
      confirm-text="Reset"
      :danger="true"
      @confirm="resetToDefault"
      @cancel="showResetConfirm = false" />
  </section>
</template>

<style scoped>
/* SettingsView's form styles are scoped to that view and do not reach this
   child component, so it carries the same rules itself. */
.config-form { display: flex; flex-direction: column; gap: 14px; margin-top: 12px; }
.form-group { display: flex; flex-direction: column; gap: 4px; }
.form-group label {
  font-size: 12px; font-weight: 500; color: var(--text-secondary);
  text-transform: uppercase; letter-spacing: 0.5px;
}
.form-group label .section-hint { text-transform: none; letter-spacing: 0; font-weight: 400; }
.form-input {
  padding: 8px 12px; background: var(--bg-main); border: 1px solid var(--border-subtle);
  border-radius: 6px; color: var(--text-primary); font-family: 'Inter', sans-serif; font-size: 13px;
}
.form-input:focus { outline: none; border-color: var(--accent-primary); }
.btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border: none;
  border-radius: 6px; font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
  cursor: pointer; transition: background 0.15s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--accent-primary); color: #ffffff; }
.btn-primary:hover:not(:disabled) { background: var(--accent-hover); }
.btn-secondary { background: var(--bg-main); border: 1px solid var(--border-subtle); color: var(--text-primary); }
.btn-secondary:hover:not(:disabled) { border-color: var(--accent-primary); }
.btn-ghost { background: none; color: var(--text-muted); }
.btn-ghost:hover:not(:disabled) { color: var(--text-primary); }
.btn-danger:hover:not(:disabled) { color: var(--status-error); }
.config-msg { font-size: 12px; color: var(--status-success); }
.config-msg-error { color: var(--status-error); }
.btn-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.test-result { display: flex; align-items: center; gap: 6px; margin-top: 8px; font-size: 0.9em; }
.status-error { color: var(--color-danger, #e5484d); }
.section-hint { font-size: 0.85em; opacity: 0.75; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
