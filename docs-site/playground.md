---
layout: page
---

<script setup>
import { defineClientComponent } from 'vitepress'

const Playground = defineClientComponent(() =>
  import('./.vitepress/theme/components/Playground.vue')
)
</script>

<div class="playground-page">
  <header class="playground-page__head">
    <h1>完整演示场</h1>
    <p>
      这一页把组件的全部 prop、实例方法、插槽与事件放在一起：数据规模、选择模式、连接线、
      节点图标、输出模式、Worker、字段名映射、增删改都能现场切换，左侧面板的操作与树下方
      的日志会同步记录。
    </p>
  </header>
  <Playground />
</div>

<style scoped>
/* 整页固定视口：页面自身不滚动，滚动只发生在左侧面板、树和日志内部。 */
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

/* 窄屏放不下左右两栏，回到上下堆叠并恢复页面滚动（与 Playground.vue 的断点一致）。 */
@media (max-width: 960px) {
  .playground-page {
    height: auto;
    overflow: visible;
  }
}
</style>
