import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import WasmProbe from './components/WasmProbe.vue'

/**
 * 站点主题：沿用 VitePress 默认主题，额外注册站点内共享的 DEMO 组件。
 * 交互组件一律用 `defineClientComponent` 在页面里懒加载，避免 SSR 期执行浏览器 API。
 */
export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('WasmProbe', WasmProbe)
  },
} satisfies Theme
