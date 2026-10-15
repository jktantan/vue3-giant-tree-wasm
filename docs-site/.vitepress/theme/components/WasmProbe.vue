<script setup lang="ts">
/**
 * WASM 加载探针：只用于验证站点能把 release/debug 产物真正加载起来。
 * 组件在 `onMounted` 里才 import WASM，SSR 期间不执行，因此可安全参与构建。
 *
 * 注意：`'../build/release'` 这个说明符由 `docs-site/.vitepress/assemblyscript.ts`
 * 劫持为 virtual 模块，与 `lib/` 内的写法保持一致，并非真实相对路径。
 */
import { onMounted, ref } from 'vue'

const state = ref<'loading' | 'ok' | 'error'>('loading')
const detail = ref('正在加载 WASM…')

onMounted(async () => {
  try {
    const wasm = await import('../build/release')
    const probes = [
      'newTree',
      'setNeighborTree',
      'getShownNodes',
      'fuzzyTree',
      'checkNode',
      'getSize',
    ] as const
    const missing = probes.filter(name => typeof wasm[name] !== 'function')
    if (missing.length > 0) {
      state.value = 'error'
      detail.value = `缺少导出：${missing.join('、')}`
      return
    }

    const tree = wasm.newTree('root', 26, wasm.SelectType.CHECKBOX, false)
    wasm.setNeighborTree(
      tree,
      JSON.stringify([
        { id: '1', name: '探针根', parentId: 'root' },
        { id: '2', name: '探针子节点', parentId: '1' },
      ])
    )
    const size = wasm.getSize(tree)
    state.value = 'ok'
    detail.value = `${probes.length} 个关键导出可用；建树后 getSize() = ${size}`
  } catch (error) {
    state.value = 'error'
    detail.value = `加载失败：${String(error)}`
  }
})
</script>

<template>
  <p class="wasm-probe" :data-state="state">
    <strong>WASM 探针：</strong>
    <span v-if="state === 'loading'">加载中…</span>
    <span v-else-if="state === 'ok'">✅ {{ detail }}</span>
    <span v-else>❌ {{ detail }}</span>
  </p>
</template>

<style scoped>
.wasm-probe {
  padding: 8px 12px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  background: var(--vp-c-bg-soft);
}
</style>
