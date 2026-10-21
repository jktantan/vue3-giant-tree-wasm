# Справочник API

Четыре таблицы соответствуют `defineProps` / `defineExpose` / слотам и `defineEmits` в
`lib/VueGiantTree.vue`; значения по умолчанию взяты из `withDefaults`.

## Props

| prop                | Тип                                                    | По умолчанию            | Описание                                                                                  |
| ------------------- | ------------------------------------------------------ | ----------------------- | ----------------------------------------------------------------------------------------- |
| `modelValue`        | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | —                       | Результат выбора (v-model)                                                                |
| `tree`              | `TreeInputItem[]`                                      | `[]`                    | Данные в виде списка смежности                                                            |
| `root`              | `string`                                               | `''`                    | Идентификатор корня; `parentId` узлов верхнего уровня должен быть равен ему               |
| `width`             | `string`                                               | `'100%'`                | Ширина контейнера                                                                         |
| `height`            | `string`                                               | `'100%'`                | Высота контейнера                                                                         |
| `lineHeight`        | `number`                                               | `26`                    | Высота строки в пикселях                                                                  |
| `fontSize`          | `string`                                               | `'14px'`                | Размер шрифта                                                                             |
| `selectType`        | `SelectType`                                           | `SelectType.CHECKBOX`   | `CHECKBOX` / `RADIO` / `SELECT`                                                           |
| `fieldKeys`         | `TreeFieldKeys`                                        | `{}`                    | Сопоставление имён полей входного JSON                                                    |
| `outputIdOnly`      | `boolean`                                              | `true`                  | `true` — в v-model только ID; `false` — полные узлы                                       |
| `checkedOutputMode` | `CheckedOutputMode`                                    | `CheckedOutputMode.All` | Режим фильтрации вывода для CHECKBOX                                                      |
| `filterFn`          | `FilterFn`                                             | —                       | Пользовательский фильтр (в CHECKBOX+Custom фильтрует вывод; в RADIO — возможность выбора) |
| `nodeIcon`          | `boolean \| NodeIconResolver`                          | `false`                 | Значки узлов: `true` — встроенные, или callback для каждого узла                          |
| `showLine`          | `boolean \| ShowLineOptions`                           | `false`                 | Режим направляющих линий                                                                  |
| `searchHighlight`   | `boolean`                                              | `false`                 | Подсвечивать только введённое ключевое слово в результатах поиска                         |
| `chunkedBuild`      | `boolean`                                              | `false`                 | Пакетная запись входа в WASM                                                              |
| `buildBatchSize`    | `number`                                               | `2000`                  | Узлов в пакете                                                                            |
| `workerMode`        | `boolean`                                              | `false`                 | Алгоритмы дерева в Web Worker                                                             |
| `preorderedInput`   | `boolean`                                              | `false`                 | Пропустить общую группировку, если вход уже в глубинном предпорядке                       |

## Методы

Вызываются через `ref` компонента.

| Метод                        | Описание                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- |
| `expandAll()`                | Разворачивает все разворачиваемые узлы текущего представления              |
| `collapseAll()`              | Сворачивает все сворачиваемые узлы текущего представления                  |
| `fuzzySearch(keyword)`       | Нечёткий поиск с антидребезгом 300 мс; пустая строка очищает поиск         |
| `fuzzySearchRaw(keyword)`    | Немедленный нечёткий поиск; пустая строка очищает поиск                    |
| `switchDisplay(displayType)` | Переключает представления `TREE` и `SEARCH`                                |
| `getTreeSize()`              | Общее количество узлов дерева                                              |
| `getBuildReady()`            | Завершено ли первое построение                                             |
| `getBuildMetrics()`          | Длительности фаз последнего построения                                     |
| `getWorkerMetrics()`         | Метрики очереди Worker, round-trip, сериализации и пакетов                 |
| `setChecked(id)`             | Установить один выбранный узел                                             |
| `setCheckedByIds(ids)`       | Установить выбранные узлы пакетом                                          |
| `clearAllChecked()`          | Очистить всё состояние выбора                                              |
| `refreshCheckedResult()`     | Повторно испустить текущий результат v-model по активным настройкам вывода |
| `updateNode(id, patch)`      | Обновить исходные поля узла; ID изменить нельзя                            |
| `addNode(node)`              | Добавить узел под корень или под существующего родителя                    |
| `removeNode(id)`             | Удалить узел и всё его поддерево                                           |

## Слоты

Оба слота получают `node` — текущий `TreeNodeData`; `#node` дополнительно получает `highlights`.

| Слот       | Описание                                                                                                                                                                                            |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `#node`    | Заменяет область содержимого узла; получает `{ node, highlights }`, где `highlights` — `SearchHighlightPart[] \| null` и не равен `null` только при включённом `searchHighlight` и совпадении имени |
| `#actions` | Область действий в конце строки; без слота не рендерится, а её клики не выбирают строку                                                                                                             |

`#actions` сам по себе не изменяет данные. Для изменения данных приложение может вызывать API экземпляра вместе с `v-model:tree`.

```vue
<VueGiantTree :tree="treeData" root="root" v-model="selected">
  <template #actions="{ node }">
    <button @click="edit(node)">Изменить</button>
    <button @click="remove(node)">Удалить</button>
  </template>
</VueGiantTree>
```

## События

| Событие             | Полезная нагрузка                                      | Описание                                                                   |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------- |
| `update:modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | Результат выбора изменился                                                 |
| `update:tree`       | `TreeInputItem[]`                                      | Новый входной массив после изменения                                       |
| `item-contextmenu`  | `(node: TreeNodeData, event: MouseEvent)`              | Правый клик по строке; компонент **не** вызывает `preventDefault()` за вас |

Компонент только испускает событие и не содержит UI меню. Правый клик по строке вызывает `item-contextmenu(node, event)`, где `node` — это `TreeNodeData` строки, а `event` — исходное `MouseEvent`. Компонент **не** вызывает `preventDefault()`, поэтому браузерное меню открывается как обычно; чтобы заменить его, вызовите `event.preventDefault()` в обработчике. Рендеринг, позиционирование и закрытие меню — задача потребителя; типичный подход — `Teleport` в `body` с позицией по `event.clientX/clientY`. Правый клик не вызывает выбор строки.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import type { TreeNodeData } from 'vue3-giant-tree-wasm'

const menu = ref<{ x: number; y: number; node: TreeNodeData } | null>(null)

const onContextMenu = (node: TreeNodeData, event: MouseEvent) => {
  event.preventDefault()
  menu.value = { x: event.clientX, y: event.clientY, node }
}
</script>

<template>
  <VueGiantTree
    :tree="treeData"
    root="root"
    v-model="selected"
    @item-contextmenu="onContextMenu"
  />

  <Teleport to="body">
    <ul
      v-if="menu"
      class="my-menu"
      :style="{ left: menu.x + 'px', top: menu.y + 'px' }"
    >
      <li @click="edit(menu.node)">Изменить</li>
      <li @click="remove(menu.node)">Удалить</li>
    </ul>
  </Teleport>
</template>
```

## Попробуйте

Все перечисленные возможности можно переключать на
[полной демо-площадке](/ru/playground).
