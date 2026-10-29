import type { TreePreset } from '../treeData'

export type SelectTypeName = 'CHECKBOX' | 'RADIO' | 'SELECT'
export type ShowLineStyleName = 'solid' | 'dashed' | 'dotted'
export type NodeIconMode = 'off' | 'default' | 'business' | 'single' | 'partial'
export type OutputModeName = 'All' | 'RootOnly' | 'LeafOnly' | 'Custom'
export type FieldKeysMode = 'default' | 'custom'
export type ThemeMode = 'inherit' | 'light' | 'dark'
export type ComponentSize = 'small' | 'default' | 'large'

/** 完整演示场的全部可调项。默认值与 `lib/components/VueGiantTree.vue` 的 `withDefaults` 对齐。 */
export interface PlaygroundSettings {
  size: TreePreset
  /**
   * 树容器高度：`'fill'` 表示填满右栏剩余空间（组件高度用 `'100%'`），
   * 其余值是显式 CSS 长度，用于演示 `height` prop 本身。
   */
  height: string
  lineHeight: number
  fontSize: string
  /** 组件的 `theme` prop。 / The component's `theme` prop. */
  theme: ThemeMode
  /** 组件的 `size` prop（与上面的数据规模 `size` 无关）。 */
  componentSize: ComponentSize
  /** 主色；空字符串表示使用主题默认值。 / Primary colour; empty means the theme default. */
  primaryColor: string
  selectType: SelectTypeName
  outputIdOnly: boolean
  checkedOutputMode: OutputModeName
  enableFilterFn: boolean
  showLine: boolean
  showLineStyle: ShowLineStyleName
  showLineColor: string
  showLineWidth: number
  nodeIcon: NodeIconMode
  /** 高亮模糊搜索命中的关键词片段。 */
  searchHighlight: boolean
  /** 给树容器加深色背景，用于检查自定义图标在暗色下的效果。 */
  darkIconBg: boolean
  /** 用 `#node` 插槽把 MPTT 的 leftNode/rightNode 打在节点名后面。 */
  mptt: boolean
  useNodeSlot: boolean
  useActionsSlot: boolean
  workerMode: boolean
  chunkedBuild: boolean
  buildBatchSize: number
  preorderedInput: boolean
  fieldKeysMode: FieldKeysMode
  /** 模糊搜索关键词（控件写入，Playground 读取后调用 fuzzySearch）。 */
  keyword: string
  /** setCheckedByIds 的输入（逗号分隔）。 */
  checkedIdsInput: string
  /** 数据里是否掺入禁用节点（每第 9 个）。 */
  enableDisabled: boolean
  /** filterFn 使用的 category 值。 */
  filterCategory: 'A' | 'B'
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  size: 'medium',
  height: 'fill',
  lineHeight: 26,
  fontSize: '14px',
  theme: 'inherit',
  componentSize: 'default',
  primaryColor: '',
  selectType: 'CHECKBOX',
  outputIdOnly: true,
  checkedOutputMode: 'All',
  enableFilterFn: false,
  showLine: false,
  showLineStyle: 'solid',
  showLineColor: '#d0d4dc',
  showLineWidth: 1,
  nodeIcon: 'off',
  searchHighlight: false,
  darkIconBg: false,
  mptt: false,
  useNodeSlot: false,
  useActionsSlot: false,
  workerMode: false,
  chunkedBuild: false,
  buildBatchSize: 2000,
  preorderedInput: false,
  fieldKeysMode: 'default',
  keyword: '',
  checkedIdsInput: '',
  enableDisabled: true,
  filterCategory: 'A',
}

/** 控件面板能触发的动作；`Playground` 收到后调用对应的组件实例方法。 */
export type ApiAction =
  | 'reload'
  | 'expandAll'
  | 'collapseAll'
  | 'clearAllChecked'
  | 'setCheckedFromInput'
  | 'setCheckedRandom'
  | 'search'
  | 'clearSearch'
  | 'switchDisplayTree'
  | 'switchDisplaySearch'
  | 'refreshCheckedResult'
  | 'updateFirst'
  | 'addChild'
  | 'removeLast'
  | 'queryMetrics'

/** 日志条目。 */
export interface LogEntry {
  at: number
  text: string
}
