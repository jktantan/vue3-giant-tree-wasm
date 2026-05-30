/**
 * VueGiantTree 组件库入口：导出树组件、类型定义，自动注册全局样式
 * VueGiantTree component library entry: exports tree component, type definitions, auto-registers global styles
 * Вход библиотеки VueGiantTree: экспортирует компонент дерева, определения типов, авторегистрация глобальных стилей
 */
import './assets/style/index.scss'

export { default as VueGiantTree } from './VueGiantTree.vue'
export type {
  TreeNodeData,
  TreeInputItem,
  TreeFieldKeys,
  FilterFn,
} from './types'
