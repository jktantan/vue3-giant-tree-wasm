# Справочник API

Четыре таблицы соответствуют `defineProps` / `defineExpose` / слотам и `defineEmits` в
`lib/VueGiantTree.vue`; значения по умолчанию взяты из `withDefaults`.

## Props

| prop | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | — | Результат выбора (v-model) |
| `tree` | `TreeInputItem[]` | `[]` | Данные в виде списка смежности |
| `root` | `string` | `''` | Идентификатор корня; `parentId` узлов верхнего уровня должен быть равен ему |
| `width` | `string` | `'100%'` | Ширина контейнера |
| `height` | `string` | `'100%'` | Высота контейнера |
| `lineHeight` | `number` | `26` | Высота строки в пикселях |
| `fontSize` | `string` | `'14px'` | Размер шрифта |
| `selectType` | `SelectType` | `SelectType.CHECKBOX` | `CHECKBOX` / `RADIO` / `SELECT` |
| `fieldKeys` | `TreeFieldKeys` | `{}` | Сопоставление имён полей входного JSON |
| `outputIdOnly` | `boolean` | `true` | `true` — в v-model только ID; `false` — полные узлы |
| `checkedOutputMode` | `CheckedOutputMode` | `CheckedOutputMode.All` | Режим фильтрации вывода для CHECKBOX |
| `filterFn` | `FilterFn` | — | Пользовательский фильтр (в CHECKBOX+Custom фильтрует вывод; в RADIO — возможность выбора) |
| `nodeIcon` | `boolean \| NodeIconResolver` | `false` | Значки узлов: `true` — встроенные, или callback для каждого узла |
| `showLine` | `boolean \| ShowLineOptions` | `false` | Режим направляющих линий |
| `chunkedBuild` | `boolean` | `false` | Пакетная запись входа в WASM |
| `buildBatchSize` | `number` | `2000` | Узлов в пакете |
| `workerMode` | `boolean` | `false` | Алгоритмы дерева в Web Worker |
| `preorderedInput` | `boolean` | `false` | Пропустить общую группировку, если вход уже в глубинном предпорядке |

## Методы

Вызываются через `ref` компонента.

| Метод | Описание |
| --- | --- |
| `expandAll()` | Разворачивает все разворачиваемые узлы текущего представления |
| `collapseAll()` | Сворачивает все сворачиваемые узлы текущего представления |
| `fuzzySearch(keyword)` | Нечёткий поиск с антидребезгом 300 мс; пустая строка очищает поиск |
| `fuzzySearchRaw(keyword)` | Немедленный нечёткий поиск; пустая строка очищает поиск |
| `switchDisplay(displayType)` | Переключает представления `TREE` и `SEARCH` |
| `getTreeSize()` | Общее количество узлов дерева |
| `getBuildReady()` | Завершено ли первое построение |
| `getBuildMetrics()` | Длительности фаз последнего построения |
| `getWorkerMetrics()` | Метрики очереди Worker, round-trip, сериализации и пакетов |
| `setChecked(id)` | Установить один выбранный узел |
| `setCheckedByIds(ids)` | Установить выбранные узлы пакетом |
| `clearAllChecked()` | Очистить всё состояние выбора |
| `refreshCheckedResult()` | Повторно испустить текущий результат v-model по активным настройкам вывода |
| `updateNode(id, patch)` | Обновить исходные поля узла; ID изменить нельзя |
| `addNode(node)` | Добавить узел под корень или под существующего родителя |
| `removeNode(id)` | Удалить узел и всё его поддерево |

## Слоты

Оба слота получают `{ node }` — текущий `TreeNodeData`.

| Слот | Описание |
| --- | --- |
| `#node` | Заменяет область содержимого узла; по умолчанию `node.name` |
| `#actions` | Область действий в конце строки; без слота не рендерится, а её клики не выбирают строку |

## События

| Событие | Полезная нагрузка | Описание |
| --- | --- | --- |
| `update:modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | Результат выбора изменился |
| `update:tree` | `TreeInputItem[]` | Новый входной массив после изменения |
| `item-contextmenu` | `(node: TreeNodeData, event: MouseEvent)` | Правый клик по строке; компонент **не** вызывает `preventDefault()` за вас |

## Попробуйте

Все перечисленные возможности можно переключать на
[полной демо-площадке](/ru/playground).
