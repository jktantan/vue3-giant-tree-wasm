/**
 * 选中状态枚举
 * Check state enumeration
 * Перечисление состояний выбора
 */
export enum CheckType {
  /** 未选中 / Unchecked / Не выбрано */
  UNCHECKED,
  /** 半选（子节点部分选中时的父节点状态） / Half-checked (parent state when children are partially checked) / Полувыбрано (состояние родителя при частичном выборе дочерних) */
  HALF_CHECKED,
  /** 已选中 / Checked / Выбрано */
  CHECKED,
}

/**
 * 选择模式枚举
 * Selection mode enumeration
 * Перечисление режимов выбора
 */
export enum SelectType {
  /** 多选复选框模式，支持半选状态 / Multi-select checkbox mode with half-check support / Режим множественного выбора с чекбоксами и поддержкой полувыбора */
  CHECKBOX,
  /** 单选模式，同时只能选中一个节点 / Single-select radio mode, only one node can be selected / Режим одиночного выбора, только один узел может быть выбран */
  RADIO,
  /** 点击选中模式，点击节点行即选中 / Click-to-select mode, clicking the node row selects it / Режим выбора по клику, клик по строке узла выбирает его */
  SELECT,
}

/**
 * JSON 字段键名配置：允许用户自定义传入 JSON 中的字段映射
 * JSON field key configuration: allows custom field name mapping in input JSON
 * Конфигурация имён полей JSON: позволяет настроить соответствие полей во входном JSON
 *
 * 默认值 / Default values / Значения по умолчанию:
 * - id: 'id'
 * - name: 'name'
 * - parentId: 'parentId'
 * - leftNode: 'leftNode'
 * - rightNode: 'rightNode'
 */
export class TreeFieldKeys {
  constructor(
    public idField: string = 'id',
    public nameField: string = 'name',
    public parentIdField: string = 'parentId',
    public leftNodeField: string = 'leftNode',
    public rightNodeField: string = 'rightNode'
  ) {}
}

/**
 * CHECKBOX 输出 ID 模式：控制 getCheckedIds 返回哪些 ID
 * CHECKBOX output ID mode: controls which IDs getCheckedIds returns
 * Режим вывода ID для CHECKBOX: управляет тем, какие ID возвращает getCheckedIds
 *
 * - All: 所有选中的节点（包括根节点和叶子节点）/ All checked nodes (roots + leaves)
 * - RootOnly: 全选子树只传根节点，去重 / Only roots of fully-checked subtrees
 * - LeafOnly: 只传叶子节点 / Only leaf nodes
 */
export enum CheckedOutputMode {
  All,
  RootOnly,
  LeafOnly,
}

/**
 * 显示模式枚举：切换主树与搜索结果树
 * Display mode enumeration: switch between main tree and search result tree
 * Перечисление режимов отображения: переключение между основным деревом и деревом результатов поиска
 */
export enum DisplayType {
  /** 显示完整树结构 / Display full tree structure / Отображение полной структуры дерева */
  TREE,
  /** 显示搜索结果树 / Display search result tree / Отображение дерева результатов поиска */
  SEARCH,
}

/**
 * 邻接表节点：用户输入的原始树结构，通过 parentId 表达父子关系
 * Adjacency list node: raw tree structure from user input, parent-child relationship expressed via parentId
 * Узел списка смежности: исходная структура дерева от пользователя, связь родитель-потомок через parentId
 */
export class NeighborTree {
  /** 节点唯一标识 / Unique node identifier / Уникальный идентификатор узла */
  id: string = ''
  /** 节点显示名称 / Node display name / Отображаемое имя узла */
  name: string = ''
  /** 父节点ID，根节点的 parentId 等于 GiantTree 的 root 值 / Parent node ID, root node's parentId equals GiantTree's root value / ID родительского узла, parentId корневого узла равен значению root в GiantTree */
  parentId: string = ''
  /** 扩展数据（预留字段） / Extended data (reserved field) / Расширенные данные (зарезервированное поле) */
  extendData: string = ''
  /** 是否禁用（禁用节点不可选中） / Whether disabled (disabled nodes cannot be checked) / Отключён ли (отключённые узлы не могут быть выбраны) */
  disabled: boolean = false
}

/**
 * MPTT 树节点：改进的前序遍历树节点，继承邻接表字段并增加 MPTT 专用属性
 * MPTT tree node: Modified Preorder Tree Traversal node, extends adjacency fields with MPTT-specific properties
 * Узел дерева MPTT: узел модифицированного обхода дерева в прямом порядке, расширяет поля списка смежности свойствами MPTT
 *
 * MPTT 原理：每个节点拥有 leftNode 和 rightNode 两个编号，
 * 子树中所有后代的 leftNode 都在 [parentLeft+1, parentRight-1] 范围内。
 * 这使得子树判定从递归 O(depth) 变为常数时间 O(1) 的范围比较。
 *
 * MPTT principle: each node has leftNode and rightNode numbers.
 * All descendants' leftNode values fall within [parentLeft+1, parentRight-1].
 * This converts subtree checks from recursive O(depth) to constant-time O(1) range comparison.
 *
 * Принцип MPTT: каждый узел имеет номера leftNode и rightNode.
 * Все leftNode потомков попадают в диапазон [parentLeft+1, parentRight-1].
 * Это позволяет проверять принадлежность к поддереву за O(1) вместо рекурсивного O(depth).
 */
export class MpttTree extends NeighborTree {
  /** MPTT 左边界编号 / MPTT left boundary number / Номер левой границы MPTT */
  leftNode: i32 = 0
  /** MPTT 右边界编号，叶节点的 rightNode = leftNode + 1 / MPTT right boundary number, leaf node's rightNode = leftNode + 1 / Номер правой границы MPTT, для листового узла rightNode = leftNode + 1 */
  rightNode: i32 = 0
  /** 节点深度，根节点的直接子节点为 0 / Node depth, direct children of root are 0 / Глубина узла, прямые потомки корня имеют глубину 0 */
  deep: i32 = 0
  /** 虚拟滚动顶部像素位置（预留字段） / Virtual scroll top pixel position (reserved field) / Позиция верхнего пикселя виртуальной прокрутки (зарезервированное поле) */
  top: f32 = 0
  /** 虚拟滚动底部像素位置（预留字段） / Virtual scroll bottom pixel position (reserved field) / Позиция нижнего пикселя виртуальной прокрутки (зарезервированное поле) */
  bottom: f32 = 0
  /** 复选框选中状态 / Checkbox check state / Состояние выбора чекбокса */
  checked: CheckType = CheckType.UNCHECKED
  /** 点击选中状态（SELECT 模式专用） / Click selection state (for SELECT mode) / Состояние выбора по клику (для режима SELECT) */
  selected: CheckType = CheckType.UNCHECKED
  /** 是否折叠（true=子节点隐藏） / Whether collapsed (true=children hidden) / Свёрнут ли (true=дочерние узлы скрыты) */
  collapsed: boolean = true
  /** 是否在虚拟滚动列表中可见 / Whether visible in virtual scroll list / Видим ли в списке виртуальной прокрутки */
  shown: boolean = false
}
