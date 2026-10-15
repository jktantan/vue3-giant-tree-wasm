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
  <header class="playground-page__head">
    <h1>Full playground</h1>
    <p>
      This page puts every prop, instance method, slot and event in one place: data size, selection
      mode, guide lines, node icons, output mode, Worker mode, field-key mapping and CRUD can all be
      switched live from the left panel, and the log under the tree records what happened.
    </p>
  </header>
  <Playground />
</div>

<style scoped>
/* The page itself never scrolls: only the left panel, the tree and the log do. */
.playground-page {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100dvh - var(--vp-nav-height, 64px));
  padding: 16px 24px 18px;
  overflow: hidden;
}

.playground-page__head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 14px;
}

.playground-page__head h1 {
  margin: 0;
  padding: 0;
  border-bottom: 0;
  font-size: 22px;
  line-height: 1.3;
}

.playground-page__head p {
  flex: 1;
  min-width: 240px;
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-3);
}

/* Below 960px the two columns no longer fit: stack them and let the page scroll again. */
@media (max-width: 960px) {
  .playground-page {
    height: auto;
    overflow: visible;
  }
}
</style>
