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
  <h1>完整演示场</h1>
  <p>
    这一页把组件的全部 prop、实例方法、插槽与事件放在一起：数据规模、选择模式、连接线、
    节点图标、输出模式、Worker、字段名映射、增删改都能现场切换，右侧日志会记录每一次
    事件与 API 调用。
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
