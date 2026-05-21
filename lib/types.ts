import type { CheckType } from '../build/release'

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
}

export interface TreeInputItem {
  id: string
  name: string
  parentId: string
}
