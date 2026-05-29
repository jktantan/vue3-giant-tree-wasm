import type { CheckType } from '../build/release'

/**
 * JSON 字段键名配置
 * JSON field key configuration
 * Конфигурация имён полей JSON
 */
export interface TreeFieldKeys {
  /** 节点 ID 字段名，默认 'id' */
  idField?: string
  /** 节点名称字段名，默认 'name' */
  nameField?: string
  /** 父节点 ID 字段名，默认 'parentId' */
  parentIdField?: string
  /** MPTT 左边界字段名，默认 'leftNode' */
  leftNodeField?: string
  /** MPTT 右边界字段名，默认 'rightNode' */
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
  /** 原始行数据（JSON 对象），包含输入时的所有自定义字段 */
  extendData?: Record<string, unknown>
}

export interface TreeInputItem {
  id: string
  name: string
  parentId: string
  disabled?: boolean
}
