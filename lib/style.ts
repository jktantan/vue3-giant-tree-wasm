/**
 * 样式构建入口（仅构建期使用，不对外导出）。
 *
 * 把 SCSS 交给 Vite 处理后抽取成 `dist/style.css`。因为公开入口
 * `lib/index.ts` 不再 import 样式，消费者不会在导入组件时被动承担 CSS 副作用，
 * 需要显式 `import 'vue3-giant-tree-wasm/style.css'`。
 *
 * Style-only build entry (internal). Vite extracts it into `dist/style.css`;
 * the public entry stays free of CSS side effects.
 */
import './assets/style/index.scss'
