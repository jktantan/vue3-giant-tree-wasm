<script setup lang="ts">
import type { LogEntry } from './settings'
import { useMessages } from '../i18n'

defineProps<{ entries: LogEntry[] }>()

const t = useMessages()
</script>

<template>
  <div class="api-log">
    <p class="api-log__title">{{ t.apiLogTitle }} ({{ entries.length }} / 50)</p>
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
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--vp-c-bg-soft);
  font-size: 12px;
}

.api-log__title {
  margin: 0 0 6px;
  font-weight: 600;
}

.api-log__list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding-left: 18px;
  overflow: auto;
  overscroll-behavior: contain;
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
  margin: 0;
  color: var(--vp-c-text-3);
}
</style>
