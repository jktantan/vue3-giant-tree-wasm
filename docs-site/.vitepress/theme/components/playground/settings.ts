import type { TreePreset } from '../treeData'

export type SelectTypeName = 'CHECKBOX' | 'RADIO' | 'SELECT'
export type ShowLineStyleName = 'solid' | 'dashed' | 'dotted'
export type NodeIconMode = 'off' | 'default' | 'business'
export type OutputModeName = 'All' | 'RootOnly' | 'LeafOnly' | 'Custom'
export type FieldKeysMode = 'default' | 'custom'

/** 完整演示场的全部可调项。与 `lib/VueGiantTree.vue` 的 `withDefaults` 保持同一套默认值。 */
export interface PlaygroundSettings {
  size: TreePreset
  selectType: SelectTypeName
  height: string
  lineHeight: number
  fontSize: string
  showLine: boolean
  showLineStyle: ShowLineStyleName
  showLineColor: string
  showLineWidth: number
  nodeIcon: NodeIconMode
  outputIdOnly: boolean
  checkedOutputMode: OutputModeName
  enableFilterFn: boolean
  workerMode: boolean
  chunkedBuild: boolean
  buildBatchSize: number
  preorderedInput: boolean
  fieldKeysMode: FieldKeysMode
  useNodeSlot: boolean
  useActionsSlot: boolean
}

export const DEFAULT_SETTINGS: PlaygroundSettings = {
  size: 'medium',
  selectType: 'CHECKBOX',
  height: '360px',
  lineHeight: 26,
  fontSize: '14px',
  showLine: false,
  showLineStyle: 'solid',
  showLineColor: '#d0d4dc',
  showLineWidth: 1,
  nodeIcon: 'off',
  outputIdOnly: true,
  checkedOutputMode: 'All',
  enableFilterFn: false,
  workerMode: false,
  chunkedBuild: false,
  buildBatchSize: 2000,
  preorderedInput: false,
  fieldKeysMode: 'default',
  useNodeSlot: false,
  useActionsSlot: false,
}

/** 控件面板能触发的动作；`Playground` 收到后调用对应的组件实例方法。 */
export type ApiAction =
  | 'reload'
  | 'expandAll'
  | 'collapseAll'
  | 'clearAllChecked'
  | 'setCheckedFirst'
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
