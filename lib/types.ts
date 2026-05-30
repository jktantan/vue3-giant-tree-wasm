import type { CheckType } from '../build/release'

/**
 * 自定义过滤回调：接收节点的 extendData（原始 JSON），返回 true 表示该项可选/可输出
 * Custom filter callback: receives the node's extendData (raw JSON), returns true if the item is selectable/outputtable
 * Пользовательский callback фильтрации: получает extendData узла (исходный JSON), возвращает true, если элемент доступен для выбора/вывода
 */
export type FilterFn = (extendData: Record<string, unknown>) => boolean

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
  /** MPTT 左边界编号 / MPTT left boundary / Левая граница MPTT */
  leftNode: number
  /** MPTT 右边界编号 / MPTT right boundary / Правая граница MPTT */
  rightNode: number
  /** 节点深度 / Node depth / Глубина узла */
  deep: number
  /** 复选框选中状态 / Checkbox check state / Состояние выбора чекбокса */
  checked: CheckType
  /** 点击选中状态（SELECT 模式） / Click selection state (SELECT mode) / Состояние выбора по клику (режим SELECT) */
  selected: CheckType
  /** 是否折叠 / Whether collapsed / Свёрнут ли */
  collapsed: boolean
  /** 是否禁用 / Whether disabled / Отключён ли */
  disabled: boolean
  /** 原始行数据（JSON 对象），包含输入时的所有自定义字段 / Original row data (JSON object), contains all custom fields from input / Исходные данные строки (объект JSON), содержит все пользовательские поля из ввода */
  extendData?: Record<string, unknown>
}

/**
 * 树输入项：用户传入的原始树节点数据（邻接表格式）
 * Tree input item: raw tree node data from user (adjacency list format)
 * Элемент ввода дерева: исходные данные узла дерева от пользователя (формат списка смежности)
 */
export interface TreeInputItem {
  id: string
  name: string
  parentId: string
  disabled?: boolean
}
