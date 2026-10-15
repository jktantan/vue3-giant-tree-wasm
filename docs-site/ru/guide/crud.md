# Добавление, изменение и удаление узлов

## О чём эта страница

Все три изменения идут через `v-model:tree`: компонент отдаёт обновлённый входной массив, а
родитель записывает его обратно в `tree`.

- **Изменение** меняет только содержимое узла, не структуру;
- **Добавление** и **удаление** пересчитывают границы MPTT **в том же экземпляре компонента** и
  восстанавливают позицию прокрутки, состояние развёртывания и выбор — компонент не
  перемонтируется через `key` (это потеряло бы вместе с прокруткой и состояние развёртывания);
- **ID узла неизменяем**: если в `patch` для `updateNode` приходит поле ID с другим значением,
  операция отклоняется;
- **Удаление убирает всё поддерево**: `removeNode(id)` собирает всех потомков по связям
  `parentId` и удаляет их вместе.

## Методы

| Метод | Сигнатура | Описание |
| --- | --- | --- |
| `addNode` | `(node: TreeMutationItem) => boolean` | Добавляет под корень или под существующего родителя; `false`, если ID уже есть или родителя нет |
| `updateNode` | `(id: string, patch: TreeNodePatch) => boolean` | Только поля, не структура; ID изменить нельзя |
| `removeNode` | `(id: string) => boolean` | Удаляет узел и всё его поддерево |

Одна лёгкая ловушка: `TreeMutationItem` — это просто исходная строка ввода
(`Record<string, unknown>`). Когда задан `fieldKeys`, передавайте **сопоставленные** имена полей:
если `idField` равен `key`, новому узлу нужен `key`, а не `id`.

## Использование

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree } from 'vue3-giant-tree-wasm'

const treeData = ref([
  { id: '1', name: 'Корень', parentId: 'root' },
  { id: '2', name: 'Дочерний A', parentId: '1' },
])
const selected = ref([])
const treeRef = ref<InstanceType<typeof VueGiantTree>>()

const rename = () => treeRef.value?.updateNode('2', { name: 'Новое имя' })
const addChild = () =>
  treeRef.value?.addNode({ id: crypto.randomUUID(), name: 'Новый узел', parentId: '1' })
const remove = () => treeRef.value?.removeNode('2') // вместе с поддеревом
</script>

<template>
  <VueGiantTree ref="treeRef" v-model:tree="treeData" v-model="selected" root="root" />
</template>
```

## Попробуйте

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="crud" />

Полный набор операций (`addNode` / `updateNode` / `removeNode` и журнал вызовов) находится на
[полной демо-площадке](/ru/playground).
