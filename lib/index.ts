/**
 * VueGiantTree 组件库入口：只导出组件与类型，不产生样式副作用。
 *
 * 样式在独立入口 `lib/style.ts` 中引入，由 `vite.config.lib.ts` 作为第二个
 * lib entry 构建成 `dist/style.css`。消费者需要自己
 * `import 'vue3-giant-tree-wasm/style.css'` 一次（或使用支持 `style` 字段
 * 自动注入的打包器）。
 *
 * VueGiantTree component library entry: exports the component and types only,
 * with no style side effect. Styles live in `lib/style.ts` and are built into
 * `dist/style.css` as a separate lib entry, so consumers import
 * `vue3-giant-tree-wasm/style.css` themselves.
 */
export { default as VueGiantTree } from './VueGiantTree.vue'
export { computeGuideLines } from './guide'
export type { GuideLineInfo } from './guide'
export {
  GIANT_TREE_SIZE_PRESETS,
  createGiantTreeThemeVars,
  mixHexColors,
  resolveGiantTreeSizePreset,
} from './theme'
export type {
  GiantTreeSize,
  GiantTreeSizePreset,
  GiantTreeTheme,
} from './theme'

// 枚举：组件的 selectType / checkedOutputMode 等 prop 直接以这些值为参数，
// 从入口 re-export，避免使用者必须去 internal 路径导入。
export {
  SelectType,
  CheckType,
  CheckedOutputMode,
  DisplayType,
} from '../build/release'

export type {
  TreeNodeData,
  TreeInputItem,
  TreeMutationItem,
  TreeNodePatch,
  TreeFieldKeys,
  FilterFn,
  NodeIconSpec,
  NodeIconResolver,
  ShowLineStyle,
  ShowLineOptions,
  ResolvedShowLineOptions,
  SearchHighlightPart,
} from './types'
