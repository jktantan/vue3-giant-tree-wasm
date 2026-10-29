import type { CheckType } from '../../build/release'

/**
 * 自定义过滤回调：接收节点的 extendData（原始 JSON），返回 true 表示该项可选/可输出
 * Custom filter callback: receives the node's extendData (raw JSON), returns true if the item is selectable/outputtable
 * Пользовательский callback фильтрации: получает extendData узла (исходный JSON), возвращает true, если элемент доступен для выбора/вывода
 */
export type FilterFn = (extendData: Record<string, unknown>) => boolean

/**
 * 节点图标配置：true 使用内置图标；false 隐藏图标；字符串为两种状态共用的 CSS 类；
 * 对象可分别指定收起和展开状态的 CSS 类。
 */
export type NodeIconSpec =
  | boolean
  | string
  | {
      collapsed: string
      expanded?: string
    }

/** 根据节点数据返回节点图标配置。 */
export type NodeIconResolver = (node: TreeNodeData) => NodeIconSpec

/**
 * 连接线展示形态：
 * - `'solid'` 实线（默认，行为与旧 `true` 一致）；
 * - `'dashed'` 横/竖短划线，`linear-gradient` 切段实现；
 * - `'dotted'` 紧凑点状虚线，`radial-gradient` 等距填充。
 *
 * Show-line shape:
 * - `'solid'` (default): continuous line, matches legacy `true`;
 * - `'dashed'`: short stroke alternation, implemented via `linear-gradient`;
 * - `'dotted'`: tightly-spaced dots via `radial-gradient`.
 */
export type ShowLineStyle = 'solid' | 'dashed' | 'dotted'

/**
 * `showLine` 的对象形式。省略的字段使用默认值：`style: 'solid'`、`color: '#d0d4dc'`、
 * `width: 1`。
 *
 * Object form of `showLine`. Missing fields use defaults: `style: 'solid'`,
 * `color: '#d0d4dc'`, `width: 1`.
 */
export interface ShowLineOptions {
  /** 连接线形态，见 `ShowLineStyle`。缺省 'solid'。 / Guide-line shape, see `ShowLineStyle`. Defaults to 'solid'. */
  style?: ShowLineStyle
  /** 连接线颜色。接受任意合法的 CSS color。 / Guide-line color. Any legal CSS color. */
  color?: string
  /** 连接线粗细（像素）。缺省 1。 / Guide-line width in pixels. Defaults to 1. */
  width?: number
}

/**
 * `resolveShowLineOptions` 的返回值：已经填上默认值的最终配置。
 * Result type of `resolveShowLineOptions`: fully populated options with defaults applied.
 */
export interface ResolvedShowLineOptions {
  /** 连接线展示形态。 / Show-line shape. */
  style: ShowLineStyle
  /** 连接线颜色（CSS color）。 / Guide-line color (CSS color). */
  color: string
  /** 连接线粗细（像素）。 / Guide-line width in pixels. */
  width: number
}

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
  /**
   * 连接线展示字段（showLine 模式），由渲染层预计算，非 WASM 数据。
   * 仅在启用 `showLine` 时存在；默认关闭时不写入，以保持行对象轻量。
   * Guide-line fields (showLine mode), precomputed by the render layer, not WASM
   * data. Present only when `showLine` is enabled, keeping default rows light.
   */
  isLastChild?: boolean
  /** 祖先列贯穿位掩码，见 lib/core/guide.ts。 / Ancestor-column continuation bitmask, see lib/core/guide.ts. */
  guideMask?: number
  /** 标记列（箭头/图标那一格）竖线段形态，见 lib/core/guide.ts。 */
  markerLine?: 'none' | 'upper' | 'lower' | 'full'
}

/**
 * 搜索命中高亮片段：`hit: true` 的片段就是用户输入的关键词原文。
 * 通过 `#node` 插槽的 `highlights` prop 暴露，便于自定义渲染复用同一套切片。
 *
 * A fuzzy-search highlight run: `hit: true` marks the typed keyword itself.
 * Exposed through the `#node` slot's `highlights` prop so custom renderers can
 * reuse the same slicing.
 */
export interface SearchHighlightPart {
  /** 片段文本。 / Run text. */
  text: string
  /** 是否为命中关键词的片段。 / Whether this run is the matched keyword. */
  hit: boolean
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

/**
 * 用于 addNode 的原始输入节点。使用 fieldKeys 时，请使用映射后的字段名。
 * Raw input node accepted by addNode. When fieldKeys is used, provide the mapped field names.
 */
export type TreeMutationItem = Record<string, unknown> & Partial<TreeInputItem>

/** 用于 updateNode 的原始字段补丁；节点 ID 不可修改。 */
export type TreeNodePatch = Record<string, unknown>
