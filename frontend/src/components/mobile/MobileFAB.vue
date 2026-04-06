<script setup>
import { Plus } from 'lucide-vue-next';

const emit = defineEmits(['click']);
</script>

<template>
  <button class="mobile-fab" @click="$emit('click')" title="Quick Capture">
    <Plus :size="24" />
  </button>
</template>

<style scoped>
.mobile-fab {
  display: none;
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--accent-warn);
  color: #1a1a1a;
  border: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  cursor: pointer;
  z-index: 900;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s;
}
.mobile-fab:active { transform: scale(0.92); }

@media (max-width: 768px) {
  .mobile-fab {
    display: flex;
  }
}
</style>
