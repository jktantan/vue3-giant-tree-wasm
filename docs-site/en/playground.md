---
layout: page
---

<script setup>
import { defineClientComponent } from 'vitepress'

const Playground = defineClientComponent(() =>
  import('../.vitepress/theme/components/Playground.vue')
)
</script>

<div class="playground-page">
  <h1>Full playground</h1>
  <p>
    This page puts every prop, instance method, slot and event in one place: data size, selection
    mode, guide lines, node icons, output mode, Worker mode, field-key mapping and CRUD can all be
    switched live, and the log records every event and API call.
  </p>
  <Playground />
</div>

<style scoped>
.playground-page {
  padding: 24px 32px 48px;
  max-width: 1200px;
  margin: 0 auto;
}
</style>
