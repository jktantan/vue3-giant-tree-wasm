/**
 * VueGiantTree 组件库入口：导出树组件、类型定义，自动注册全局样式
 * VueGiantTree component library entry: exports tree component, type definitions, auto-registers global styles
 * Вход библиотеки VueGiantTree: экспортирует компонент дерева, определения типов, авторегистрация глобальных стилей
 */
import './assets/style/index.scss'

export { default as VueGiantTree } from './VueGiantTree.vue'
export { computeGuideLines } from './guide'
export type { GuideLineInfo } from './guide'

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
