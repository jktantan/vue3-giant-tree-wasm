import type { CheckType } from './giant-tree'

export type FilterFn = (extendData: Record<string, unknown>) => boolean

export interface TreeFieldKeys {
  idField?: string
  nameField?: string
  parentIdField?: string
  leftNodeField?: string
  rightNodeField?: string
}

export interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number
  rightNode: number
  deep: number
  checked: CheckType
  selected: CheckType
  collapsed: boolean
  disabled: boolean
  extendData?: Record<string, unknown>
}

export interface TreeInputItem {
  id: string
  name: string
  parentId: string
  disabled?: boolean
}
