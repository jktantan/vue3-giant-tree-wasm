<script setup lang="ts">
import type { LogEntry } from './settings'
import { useMessages } from '../i18n'

defineProps<{ entries: LogEntry[] }>()

const t = useMessages()
</script>

<template>
  <div class="api-log">
    <p class="api-log__title">{{ t.apiLogTitle }}（{{ entries.length }} / 50）</p>
    <ol class="api-log__list">
      <li v-for="(entry, index) in entries" :key="`${entry.at}-${index}`">
        <code>{{ entry.at }}</code>
        {{ entry.text }}
      </li>
    </ol>
    <p v-if="entries.length === 0" class="api-log__empty">{{ t.noLog }}</p>
  </div>
</template>

<style scoped>
.api-log {
  margin-top: 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  padding: 8px 12px;
  background: var(--vp-c-bg-soft);
  font-size: 12px;
}

.api-log__title {
  font-weight: 600;
  margin-bottom: 4px;
}

.api-log__list {
  max-height: 180px;
  overflow: auto;
  padding-left: 18px;
  list-style: decimal;
}

.api-log__list li {
  line-height: 1.7;
  word-break: break-all;
}

.api-log__list code {
  color: var(--vp-c-text-3);
  margin-right: 6px;
}

.api-log__empty {
  color: var(--vp-c-text-3);
}
</style>
