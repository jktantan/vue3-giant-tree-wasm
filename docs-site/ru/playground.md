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
    <h1>Полная демо-площадка</h1>
    <p>
      На этой странице собраны все prop, методы экземпляра, слоты и события: размер данных, режим
      выбора, направляющие линии, значки узлов, режим вывода, Worker, сопоставление ключей полей и
      CRUD переключаются на месте из левой панели, а журнал под деревом записывает происходящее.
    </p>
  </header>
  <Playground />
</div>

<style scoped>
/* Страница не прокручивается: прокрутка только у левой панели, дерева и журнала. */
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

/* Уже 960px две колонки не помещаются: складываем их и возвращаем прокрутку страницы. */
@media (max-width: 960px) {
  .playground-page {
    height: auto;
    overflow: visible;
  }
}
</style>
