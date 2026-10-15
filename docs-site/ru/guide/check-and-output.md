# Выбор и режимы вывода

## О чём эта страница

Логика выбора живёт в `assembly/tree-check.ts` и по `selectType` разветвляется на три довольно
разные семантики:

| `SelectType` | Поведение |
| --- | --- |
| `CHECKBOX` | Устанавливает целевой узел **и всё его поддерево**, затем один раз проходит по каждому предку, пересчитывая `checked` (`CHECKED` / `HALF_CHECKED` / `UNCHECKED`) по его прямым потомкам |
| `RADIO` | Во всём дереве выбран ровно один узел |
| `SELECT` | Выбор по клику; тоже единственный во всём дереве, но использует поле `selected` и не трогает состояние чекбоксов |

Два поведения, которые легко упустить:

- **Отключённые узлы выбрать нельзя**: если целевой узел `disabled`, операция сразу возвращается —
  не меняется даже его поддерево.
- **Пересчёт предков идемпотентен**: каждый предок пересчитывается по текущим значениям потомков,
  а не накоплением приращений, поэтому повторный выбор того же узла не «уплывает» в полувыбор.

## Параметры

| prop | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `selectType` | `SelectType` | `SelectType.CHECKBOX` | `CHECKBOX` / `RADIO` / `SELECT` |
| `outputIdOnly` | `boolean` | `true` | `true` — в v-model только ID выбранных узлов; `false` — полные `TreeNodeData` |
| `checkedOutputMode` | `CheckedOutputMode` | `CheckedOutputMode.All` | В режиме CHECKBOX — какие выбранные узлы попадают в вывод |
| `filterFn` | `FilterFn` | — | Пользовательский фильтр, см. таблицу ниже |
| `modelValue` | `TreeNodeData \| TreeNodeData[] \| string \| string[]` | — | Результат выбора (v-model) |

### `CheckedOutputMode`

| Значение | Вывод |
| --- | --- |
| `All` | Все выбранные узлы |
| `RootOnly` | Только корни полностью выбранных поддеревьев (без дублей, самый верхний уровень) |
| `LeafOnly` | Только листовые узлы |
| `Custom` | Определяет `filterFn` |

### Что делает `filterFn` в каждом режиме

| Режим | Действие |
| --- | --- |
| `CHECKBOX` + `Custom` | Фильтрует **вывод**: выбранный узел, для которого `filterFn` вернул `false`, не попадает в v-model |
| `RADIO` | Фильтрует **возможность выбора**: у узла с `false` радиокнопка не показывается |
| `SELECT` | Не затрагивается |

`filterFn` получает `extendData` узла (полную копию исходной строки), а не `TreeNodeData`.

## Использование

Только ID выбранных узлов (по умолчанию):

```vue
<VueGiantTree :tree="rows" root="root" v-model="selectedIds" />
<!-- selectedIds: ['2', '3'] -->
```

Полное содержимое узлов:

```vue
<VueGiantTree :tree="rows" root="root" :output-id-only="false" v-model="selectedRows" />
<!-- selectedRows: [{ id: '2', name: 'Дочерний A', ... }] -->
```

Только корни полностью выбранных поддеревьев:

```vue
<VueGiantTree
  :tree="rows"
  root="root"
  :checked-output-mode="CheckedOutputMode.RootOnly"
  v-model="selectedIds"
/>
```

## Попробуйте

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="check-and-output" />

Попробуйте: выберите корневой узел, затем переключите «Режим вывода» — панель перейдёт от «все
выбранные узлы» к «только корень» или «только листья». Переключитесь на `RADIO` — на тех же
данных появятся радиокнопки, выбранной будет не более одной.
