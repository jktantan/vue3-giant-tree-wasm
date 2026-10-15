# Построение дерева и формат данных

## О чём эта страница

На вход подаётся **список смежности**: каждой строке нужны только `id` / `name` / `parentId`.
Границы MPTT указывать не нужно — `assembly/tree-builder.ts` делает всё сам внутри WASM:

1. Потоково разбирает JSON строка за строкой — обычные поля идут по быстрому пути без выделения
   памяти, а декодирование экранирования включается только при наличии обратного слэша;
2. Группирует узлы по `parentId`;
3. Пересчитывает `leftNode` / `rightNode` за **один проход в глубину**, поэтому каждое поддерево
   занимает непрерывный диапазон номеров.

> **Почему MPTT всегда перестраивается**: как только входные данные отличаются от предыдущих,
> приложенные к ним `leftNode` / `rightNode` могут быть устаревшими. Проверка поддерева по
> устаревшим границам молча даёт неверный результат. Поэтому компонент не доверяет границам из
> входных данных и всегда пересчитывает их по `parentId`. Поля `leftNodeField` /
> `rightNodeField` участвуют только в определении формата входных данных.

## Параметры

| prop | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `tree` | `TreeInputItem[]` | `[]` | Данные в виде списка смежности; поля кроме `id`/`name`/`parentId` попадают в `extendData` |
| `root` | `string` | `''` | Идентификатор корня; `parentId` узлов верхнего уровня должен быть равен ему |
| `fieldKeys` | `TreeFieldKeys` | `{}` | Сопоставление имён полей, см. ниже |
| `preorderedInput` | `boolean` | `false` | `true`, если данные уже строго в порядке глубинного обхода |
| `chunkedBuild` | `boolean` | `false` | Пакетная запись узлов в WASM, снижает блокировку первого кадра |
| `buildBatchSize` | `number` | `2000` | Узлов в пакете (когда `chunkedBuild` включён) |

### Сопоставление ключей полей

```ts
interface TreeFieldKeys {
  idField?: string // по умолчанию 'id'
  nameField?: string // по умолчанию 'name'
  parentIdField?: string // по умолчанию 'parentId'
  leftNodeField?: string // по умолчанию 'leftNode' (только определение формата)
  rightNodeField?: string // по умолчанию 'rightNode' (только определение формата)
}
```

Два поведения, о которых стоит знать:

- `chunkedBuild` действует только когда `outputIdOnly` равен `true` **и** `filterFn` не задан —
  только в этих двух случаях компоненту не нужны полные исходные строки.
- Если `preorderedInput` включён, а порядок данных не совпадает, компонент вернётся к общей
  сборке вместо построения неправильного дерева.

## Использование

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const selected = ref([])
const rows = [
  { id: '1', name: 'Корень', parentId: 'root' },
  { id: '2', name: 'Дочерний A', parentId: '1' },
  { id: '3', name: 'Дочерний B', parentId: '1' },
]
</script>

<template>
  <div style="height: 400px">
    <VueGiantTree :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

Когда поля называются не `id` / `name` / `parentId`:

```vue
<VueGiantTree
  :tree="rows"
  root="root"
  :field-keys="{ idField: 'key', nameField: 'label', parentIdField: 'parent' }"
  v-model="selected"
/>
```

## Попробуйте

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="tree-building" />

Переключите «Размер данных» на `10k` — компонент так же перестроит всё дерево MPTT; обратите
внимание на `getTreeSize()` и на то, сколько занимает первый кадр.
