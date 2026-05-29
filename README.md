# vue3-giant-tree-wasm

[中文](#中文) | [English](#english) | [Русский](#русский)

---

## 中文

### 简介

基于 Vue 3 + WebAssembly 的高性能虚拟滚动树组件，专为海量数据场景设计。核心树算法使用 AssemblyScript 编写并编译为 WASM，利用 MPTT（改进的前序遍历树）数据结构实现 O(1) 子树判定和 O(k) 可视区域切片，轻松处理十万级甚至百万级节点。

### 特性

- **WASM 加速** — 树构建、遍历、搜索、选中等核心运算在 WebAssembly 中执行
- **虚拟滚动** — 仅渲染可视区域内的节点，DOM 占用极低
- **MPTT 算法** — O(1) 子树判定，O(k) 视口切片，O(subtree + log N) 展开/折叠
- **三种选择模式** — 多选 (Checkbox)、单选 (Radio)、点击选中 (Select)
- **模糊搜索** — 关键词过滤并自动补全祖先链
- **可配置字段名** — 支持自定义输入 JSON 的字段映射（id / name / parentId / leftNode / rightNode）
- **统一树构建** — 无论输入是邻接表还是 MPTT 格式，始终自动重建 MPTT，避免 stale leftNode/rightNode
- **JSON 缓存** — 滚动位置不变时直接返回缓存，避免重复序列化
- **TypeScript 类型支持** — 完整的类型定义导出

### 安装

```bash
npm install vue3-giant-tree-wasm
# 或
pnpm add vue3-giant-tree-wasm
# 或
yarn add vue3-giant-tree-wasm
```

### 快速上手

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: '根节点', parentId: 'root' },
  { id: '2', name: '子节点 A', parentId: '1' },
  { id: '3', name: '子节点 B', parentId: '1' },
  { id: '4', name: '孙节点 A-1', parentId: '2' },
]

const selected = ref([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree
      :tree="treeData"
      root="root"
      v-model="selected"
    />
  </div>
</template>
```

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `tree` | `TreeInputItem[]` | `[]` | 树数据，邻接表格式 |
| `root` | `string` | `''` | 根节点标识，顶层节点的 `parentId` 应等于此值 |
| `modelValue` | `TreeNodeData \| TreeNodeData[]` | — | 选中结果 (v-model) |
| `width` | `string` | `'100%'` | 容器宽度 |
| `height` | `string` | `'100%'` | 容器高度 |
| `lineHeight` | `number` | `26` | 每行高度（像素） |
| `fontSize` | `string` | `'14px'` | 字体大小 |
| `selectType` | `SelectType` | `CHECKBOX` | 选择模式：`CHECKBOX` / `RADIO` / `SELECT` |
| `fieldKeys` | `TreeFieldKeys` | `{}` | JSON 字段名映射，见下方说明 |
| `outputIdOnly` | `boolean` | `true` | `true` 时 v-model 只传选中节点的 ID（默认）；`false` 时传完整 JSON |

### 字段名映射 (fieldKeys)

当输入数据的 JSON 字段名不是默认的 `id`/`name`/`parentId`/`leftNode`/`rightNode` 时，可通过 `fieldKeys` 指定映射关系：

```typescript
interface TreeFieldKeys {
  idField?: string       // 默认 'id'
  nameField?: string     // 默认 'name'
  parentIdField?: string // 默认 'parentId'
  leftNodeField?: string // 默认 'leftNode'
  rightNodeField?: string // 默认 'rightNode'
}
```

**示例：** 数据字段名为 `key` / `label` / `parent` / `lft` / `rgt`

```vue
<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    :fieldKeys="{
      idField: 'key',
      nameField: 'label',
      parentIdField: 'parent',
      leftNodeField: 'lft',
      rightNodeField: 'rgt',
    }"
  />
</template>
```

> **注意：** leftNode/rightNode 字段仅用于自动检测输入类型。无论输入是否包含这两个字段，组件始终基于 parentId 关系重新构建 MPTT 树，以确保 leftNode/rightNode 值准确无误。

### 数据格式

#### 输入数据 (TreeInputItem)

```typescript
interface TreeInputItem {
  id: string       // 节点唯一 ID
  name: string     // 节点显示名称
  parentId: string // 父节点 ID
}
```

#### 节点数据 (TreeNodeData)

```typescript
interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number   // MPTT 左边界
  rightNode: number  // MPTT 右边界
  deep: number       // 节点深度
  checked: CheckType // 选中状态
  selected: CheckType
  collapsed: boolean // 是否折叠
}
```

### 选择模式

| 模式 | 说明 |
|------|------|
| `CHECKBOX` | 多选复选框，支持半选状态，选中/取消自动传播至子节点和父节点 |
| `RADIO` | 单选模式，同一时刻只能选中一个节点 |
| `SELECT` | 点击选中模式，点击节点行即选中 |

### 开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev

# 构建 WASM
pnpm asbuild

# 构建组件库
pnpm lib:build
```

### 许可证

[BSD 2-Clause](./LICENSE)

---

## English

### Introduction

A high-performance virtual-scrolling tree component built with Vue 3 + WebAssembly, designed for massive datasets. The core tree algorithms are written in AssemblyScript and compiled to WASM, leveraging the MPTT (Modified Preorder Tree Traversal) data structure to achieve O(1) subtree checks and O(k) viewport slicing — easily handling hundreds of thousands or even millions of nodes.

### Features

- **WASM-Accelerated** — Tree building, traversal, search, and check operations run in WebAssembly
- **Virtual Scrolling** — Only renders nodes within the visible viewport, minimal DOM footprint
- **MPTT Algorithm** — O(1) subtree checks, O(k) viewport slicing, O(subtree + log N) expand/collapse
- **Three Selection Modes** — Checkbox (multi-select), Radio (single-select), Click-to-Select
- **Fuzzy Search** — Keyword filtering with automatic ancestor chain completion
- **Configurable Field Keys** — Custom JSON field name mapping for id / name / parentId / leftNode / rightNode
- **Unified Tree Building** — Always rebuilds MPTT from parentId regardless of input format, avoiding stale leftNode/rightNode
- **JSON Caching** — Returns cached results when scroll position is unchanged
- **TypeScript Support** — Full type definitions exported

### Installation

```bash
npm install vue3-giant-tree-wasm
# or
pnpm add vue3-giant-tree-wasm
# or
yarn add vue3-giant-tree-wasm
```

### Quick Start

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: 'Root', parentId: 'root' },
  { id: '2', name: 'Child A', parentId: '1' },
  { id: '3', name: 'Child B', parentId: '1' },
  { id: '4', name: 'Grandchild A-1', parentId: '2' },
]

const selected = ref([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree
      :tree="treeData"
      root="root"
      v-model="selected"
    />
  </div>
</template>
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tree` | `TreeInputItem[]` | `[]` | Tree data in adjacency list format |
| `root` | `string` | `''` | Root identifier; top-level nodes' `parentId` should equal this |
| `modelValue` | `TreeNodeData \| TreeNodeData[]` | — | Selected result (v-model) |
| `width` | `string` | `'100%'` | Container width |
| `height` | `string` | `'100%'` | Container height |
| `lineHeight` | `number` | `26` | Row height in pixels |
| `fontSize` | `string` | `'14px'` | Font size |
| `selectType` | `SelectType` | `CHECKBOX` | Selection mode: `CHECKBOX` / `RADIO` / `SELECT` |
| `fieldKeys` | `TreeFieldKeys` | `{}` | JSON field name mapping, see below |
| `outputIdOnly` | `boolean` | `true` | When `true` (default), v-model emits only selected node IDs; `false` emits full JSON |

### Field Key Mapping (fieldKeys)

When your input data uses custom JSON field names instead of the default `id`/`name`/`parentId`/`leftNode`/`rightNode`, use `fieldKeys` to specify the mapping:

```typescript
interface TreeFieldKeys {
  idField?: string       // default 'id'
  nameField?: string     // default 'name'
  parentIdField?: string // default 'parentId'
  leftNodeField?: string // default 'leftNode'
  rightNodeField?: string // default 'rightNode'
}
```

**Example:** data with `key` / `label` / `parent` / `lft` / `rgt` fields

```vue
<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    :fieldKeys="{
      idField: 'key',
      nameField: 'label',
      parentIdField: 'parent',
      leftNodeField: 'lft',
      rightNodeField: 'rgt',
    }"
  />
</template>
```

> **Note:** The leftNode/rightNode fields are only used for input type auto-detection. Regardless of whether these fields are present, the component always rebuilds the MPTT tree from parentId relationships to ensure accurate leftNode/rightNode values.

### Data Format

#### Input Data (TreeInputItem)

```typescript
interface TreeInputItem {
  id: string       // Unique node ID
  name: string     // Display name
  parentId: string // Parent node ID
}
```

#### Node Data (TreeNodeData)

```typescript
interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number   // MPTT left boundary
  rightNode: number  // MPTT right boundary
  deep: number       // Node depth
  checked: CheckType // Check state
  selected: CheckType
  collapsed: boolean // Whether collapsed
}
```

### Selection Modes

| Mode | Description |
|------|-------------|
| `CHECKBOX` | Multi-select with half-check support; check/uncheck propagates to children and parents |
| `RADIO` | Single-select; only one node can be selected at a time |
| `SELECT` | Click-to-select; clicking a node row selects it |

### Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev

# Build WASM
pnpm asbuild

# Build component library
pnpm lib:build
```

### License

[BSD 2-Clause](./LICENSE)

---

## Русский

### Введение

Высокопроизводительный компонент дерева с виртуальной прокруткой на основе Vue 3 + WebAssembly, спроектированный для работы с массивными наборами данных. Основные алгоритмы дерева написаны на AssemblyScript и скомпилированы в WASM, используя структуру данных MPTT (Modified Preorder Tree Traversal) для достижения проверки поддерева за O(1) и среза видимой области за O(k) — легко справляясь с сотнями тысяч и даже миллионами узлов.

### Возможности

- **Ускорение через WASM** — Построение дерева, обход, поиск и выбор выполняются в WebAssembly
- **Виртуальная прокрутка** — Рендерятся только узлы в видимой области, минимальное использование DOM
- **Алгоритм MPTT** — Проверка поддерева за O(1), срез viewport за O(k), развёртывание/свёртывание за O(поддерево + log N)
- **Три режима выбора** — Чекбокс (множественный), Радиокнопка (одиночный), Выбор по клику
- **Нечёткий поиск** — Фильтрация по ключевому слову с автоматическим дополнением цепочки предков
- **Настраиваемые ключи полей** — Сопоставление пользовательских имён полей JSON (id / name / parentId / leftNode / rightNode)
- **Единое построение дерева** — Всегда перестраивает MPTT из parentId независимо от формата входных данных, избегая устаревших leftNode/rightNode
- **Кэширование JSON** — При неизменной позиции прокрутки возвращается кэшированный результат
- **Поддержка TypeScript** — Полные определения типов

### Установка

```bash
npm install vue3-giant-tree-wasm
# или
pnpm add vue3-giant-tree-wasm
# или
yarn add vue3-giant-tree-wasm
```

### Быстрый старт

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = [
  { id: '1', name: 'Корень', parentId: 'root' },
  { id: '2', name: 'Дочерний A', parentId: '1' },
  { id: '3', name: 'Дочерний B', parentId: '1' },
  { id: '4', name: 'Внук A-1', parentId: '2' },
]

const selected = ref([])
</script>

<template>
  <div style="width: 400px; height: 600px">
    <VueGiantTree
      :tree="treeData"
      root="root"
      v-model="selected"
    />
  </div>
</template>
```

### Свойства (Props)

| Свойство | Тип | По умолчанию | Описание |
|----------|-----|--------------|----------|
| `tree` | `TreeInputItem[]` | `[]` | Данные дерева в формате списка смежности |
| `root` | `string` | `''` | Идентификатор корня; `parentId` узлов верхнего уровня должен быть равен этому значению |
| `modelValue` | `TreeNodeData \| TreeNodeData[]` | — | Результат выбора (v-model) |
| `width` | `string` | `'100%'` | Ширина контейнера |
| `height` | `string` | `'100%'` | Высота контейнера |
| `lineHeight` | `number` | `26` | Высота строки в пикселях |
| `fontSize` | `string` | `'14px'` | Размер шрифта |
| `selectType` | `SelectType` | `CHECKBOX` | Режим выбора: `CHECKBOX` / `RADIO` / `SELECT` |
| `fieldKeys` | `TreeFieldKeys` | `{}` | Сопоставление имён полей JSON, см. ниже |
| `outputIdOnly` | `boolean` | `true` | Если `true` (по умолч.), v-model передаёт только ID выбранных узлов; `false` — полные данные |

### Сопоставление ключей полей (fieldKeys)

Если во входных данных используются пользовательские имена полей JSON вместо стандартных `id`/`name`/`parentId`/`leftNode`/`rightNode`, используйте `fieldKeys` для указания соответствия:

```typescript
interface TreeFieldKeys {
  idField?: string       // по умолчанию 'id'
  nameField?: string     // по умолчанию 'name'
  parentIdField?: string // по умолчанию 'parentId'
  leftNodeField?: string // по умолчанию 'leftNode'
  rightNodeField?: string // по умолчанию 'rightNode'
}
```

**Пример:** данные с полями `key` / `label` / `parent` / `lft` / `rgt`

```vue
<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    :fieldKeys="{
      idField: 'key',
      nameField: 'label',
      parentIdField: 'parent',
      leftNodeField: 'lft',
      rightNodeField: 'rgt',
    }"
  />
</template>
```

> **Примечание:** Поля leftNode/rightNode используются только для автоопределения типа входных данных. Независимо от их наличия, компонент всегда перестраивает дерево MPTT на основе parentId для обеспечения точности значений leftNode/rightNode.

### Формат данных

#### Входные данные (TreeInputItem)

```typescript
interface TreeInputItem {
  id: string       // Уникальный ID узла
  name: string     // Отображаемое имя
  parentId: string // ID родительского узла
}
```

#### Данные узла (TreeNodeData)

```typescript
interface TreeNodeData {
  id: string
  name: string
  parentId: string
  leftNode: number   // Левая граница MPTT
  rightNode: number  // Правая граница MPTT
  deep: number       // Глубина узла
  checked: CheckType // Состояние выбора
  selected: CheckType
  collapsed: boolean // Свёрнут ли узел
}
```

### Режимы выбора

| Режим | Описание |
|-------|----------|
| `CHECKBOX` | Множественный выбор с поддержкой полувыбора; выбор/отмена распространяется на дочерние и родительские узлы |
| `RADIO` | Одиночный выбор; одновременно может быть выбран только один узел |
| `SELECT` | Выбор по клику; клик по строке узла выбирает его |

### Разработка

```bash
# Установка зависимостей
pnpm install

# Запуск сервера разработки
pnpm dev

# Сборка WASM
pnpm asbuild

# Сборка библиотеки компонентов
pnpm lib:build
```

### Лицензия

[BSD 2-Clause](./LICENSE)
