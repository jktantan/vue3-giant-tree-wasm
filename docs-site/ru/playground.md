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
  <h1>Полная демо-площадка</h1>
  <p>
    На этой странице собраны все prop, методы экземпляра, слоты и события: размер данных, режим
    выбора, направляющие линии, значки узлов, режим вывода, Worker, сопоставление ключей полей и
    CRUD переключаются на месте, а журнал записывает каждое событие и вызов API.
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
