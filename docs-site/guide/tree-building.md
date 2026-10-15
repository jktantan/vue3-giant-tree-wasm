# 树构建与数据格式

> 本页内容将在「内容页 A」任务里补齐；当前只放一个 WASM 加载探针，用于确认站点能加载真实产物。

<script setup>
import { defineClientComponent } from 'vitepress'

const WasmProbe = defineClientComponent(() =>
  import('../.vitepress/theme/components/WasmProbe.vue')
)
</script>

<WasmProbe />
