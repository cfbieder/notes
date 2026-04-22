<script setup>
import { ref, onMounted, computed } from 'vue';
import { api } from '../../api/client.js';
import { RefreshCw, CheckCircle, XCircle, AlertTriangle } from 'lucide-vue-next';

const stats = ref(null);
const loading = ref(false);
const error = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const res = await api.get('/system/stats');
    stats.value = res.data;
  } catch (e) {
    error.value = e.message || 'Failed to load stats';
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function fmtBytes(n) {
  if (n == null) return '—';
  if (n === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(n) / Math.log(1024));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtUptime(s) {
  if (s == null) return '—';
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m || (!d && !h)) parts.push(`${m}m`);
  return parts.join(' ');
}

function fmtDate(s) {
  if (!s) return 'never';
  return new Date(s).toLocaleString();
}

const diskUsed = computed(() => {
  const s = stats.value?.storage;
  if (!s || s.disk_total_bytes == null || s.disk_free_bytes == null) return null;
  return s.disk_total_bytes - s.disk_free_bytes;
});

const diskPct = computed(() => {
  const s = stats.value?.storage;
  if (!s || s.disk_total_bytes == null || s.disk_free_bytes == null) return null;
  const used = s.disk_total_bytes - s.disk_free_bytes;
  return Math.round((used / s.disk_total_bytes) * 100);
});

const diskBarClass = computed(() => {
  const p = diskPct.value;
  if (p == null) return '';
  if (p >= 90) return 'bar-danger';
  if (p >= 75) return 'bar-warn';
  return 'bar-ok';
});
</script>

<template>
  <section class="settings-section system-status">
    <div class="status-header">
      <h3>System Status</h3>
      <button class="refresh-btn" :disabled="loading" @click="load" title="Refresh stats">
        <RefreshCw :size="14" :class="{ spinning: loading }" />
        Refresh
      </button>
    </div>

    <div v-if="error" class="status-error">
      <AlertTriangle :size="14" /> {{ error }}
    </div>

    <div v-else-if="!stats && loading" class="status-loading">Loading…</div>

    <div v-else-if="stats" class="status-grid">
      <!-- Storage -->
      <div class="status-group">
        <h4>Storage</h4>
        <div v-if="diskPct != null" class="disk-bar-wrap">
          <div class="disk-bar">
            <div class="disk-bar-fill" :class="diskBarClass" :style="{ width: diskPct + '%' }"></div>
          </div>
          <div class="disk-bar-label">
            {{ fmtBytes(diskUsed) }} of {{ fmtBytes(stats.storage.disk_total_bytes) }} used
            ({{ diskPct }}%) — {{ fmtBytes(stats.storage.disk_free_bytes) }} free
          </div>
        </div>
        <dl class="status-list">
          <div><dt>Attachments</dt><dd>{{ fmtBytes(stats.storage.attachments_bytes) }}</dd></div>
          <div><dt>Database</dt><dd>{{ fmtBytes(stats.storage.db_size_bytes) }}</dd></div>
          <div><dt>Attachments path</dt><dd class="path">{{ stats.storage.attachments_path }}</dd></div>
        </dl>
      </div>

      <!-- Content -->
      <div class="status-group">
        <h4>Content</h4>
        <dl class="status-list">
          <div><dt>Notes</dt><dd>{{ stats.content.notes }}</dd></div>
          <div><dt>Ideas</dt><dd>{{ stats.content.ideas }}</dd></div>
          <div><dt>Trashed</dt><dd>{{ stats.content.trashed }}</dd></div>
          <div><dt>Tasks</dt><dd>{{ stats.content.tasks_open }} open · {{ stats.content.tasks_done }} done</dd></div>
          <div><dt>Attachments</dt><dd>{{ stats.content.attachments }} ({{ stats.content.attachments_ocr }} OCR'd)</dd></div>
          <div><dt>Tags</dt><dd>{{ stats.content.tags }}</dd></div>
        </dl>
      </div>

      <!-- Server -->
      <div class="status-group">
        <h4>Server</h4>
        <dl class="status-list">
          <div><dt>App version</dt><dd>v{{ stats.server.app_version || '—' }}</dd></div>
          <div><dt>Node</dt><dd>{{ stats.server.node_version }}</dd></div>
          <div><dt>Environment</dt><dd>{{ stats.server.env }}</dd></div>
          <div><dt>Uptime</dt><dd>{{ fmtUptime(stats.server.uptime_seconds) }}</dd></div>
          <div><dt>Memory (RSS)</dt><dd>{{ fmtBytes(stats.server.memory_rss_bytes) }}</dd></div>
        </dl>
      </div>

      <!-- Integrations -->
      <div class="status-group">
        <h4>Integrations</h4>
        <dl class="status-list">
          <div>
            <dt>LLM gateway</dt>
            <dd>
              <template v-if="!stats.integrations.llm_enabled">
                <span class="status-muted">Disabled</span>
              </template>
              <template v-else-if="stats.integrations.llm_reachable">
                <CheckCircle :size="12" class="status-ok" /> Reachable
                <span v-if="stats.integrations.llm_model_count != null" class="status-muted">
                  · {{ stats.integrations.llm_model_count }} models
                </span>
              </template>
              <template v-else>
                <XCircle :size="12" class="status-bad" /> Unreachable
              </template>
            </dd>
          </div>
          <div><dt>Gateway URL</dt><dd class="path">{{ stats.integrations.llm_gateway_url }}</dd></div>
          <div>
            <dt>Google Drive</dt>
            <dd>
              <template v-if="stats.integrations.google_drive_connected">
                <CheckCircle :size="12" class="status-ok" /> Connected
                <span v-if="stats.integrations.google_drive_enabled === false" class="status-muted">(disabled)</span>
              </template>
              <template v-else>
                <span class="status-muted">Not connected</span>
              </template>
            </dd>
          </div>
        </dl>
      </div>

      <!-- Backup -->
      <div class="status-group">
        <h4>Backup</h4>
        <dl class="status-list">
          <div><dt>Last backup</dt><dd>{{ fmtDate(stats.backup.last_at) }}</dd></div>
          <div><dt>Last size</dt><dd>{{ fmtBytes(stats.backup.last_size_bytes) }}</dd></div>
          <div><dt>Backup count</dt><dd>{{ stats.backup.count }}</dd></div>
          <div><dt>Backup path</dt><dd class="path">{{ stats.backup.dir }}</dd></div>
        </dl>
      </div>
    </div>
  </section>
</template>

<style scoped>
.system-status { margin-top: 8px; }

.status-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.status-header h3 { margin: 0; }

.refresh-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: 'Inter', sans-serif;
  font-size: 12px;
  cursor: pointer;
}
.refresh-btn:hover:not(:disabled) {
  border-color: var(--accent-primary);
  color: var(--text-primary);
}
.refresh-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-loading, .status-error {
  padding: 12px;
  color: var(--text-muted);
  font-size: 13px;
}
.status-error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--status-error);
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.status-group {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 14px 16px;
}
.status-group h4 {
  margin: 0 0 10px 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
}

.status-list {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.status-list > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}
.status-list dt {
  color: var(--text-muted);
  flex-shrink: 0;
}
.status-list dd {
  margin: 0;
  color: var(--text-primary);
  text-align: right;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.status-list dd.path {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.status-ok { color: var(--accent-success); }
.status-bad { color: var(--status-error); }
.status-muted { color: var(--text-muted); }

.disk-bar-wrap { margin-bottom: 12px; }
.disk-bar {
  height: 8px;
  background: var(--hover-bg);
  border-radius: 4px;
  overflow: hidden;
}
.disk-bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.bar-ok { background: var(--accent-success); }
.bar-warn { background: var(--accent-warn); }
.bar-danger { background: var(--status-error); }
.disk-bar-label {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
