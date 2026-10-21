# Нечёткий поиск

## О чём эта страница

Поиск делает две вещи: сопоставляет имена узлов по ключевому слову, а затем **дополняет цепочку
предков** каждого совпадения, чтобы результаты оставались достижимыми путями в дереве. Обе части
выполняются в WASM (`assembly/tree-search.ts`):

- если есть индекс кандидатов, первый символ ключевого слова сужает набор до подстрочного поиска;
- родство определяется по **диапазону MPTT**
  (`leftNode <= node.leftNode && rightNode >= node.rightNode`) — без рекурсивного подъёма;
- результаты попадают в отдельный `searchTree`, поэтому состояние свёртки основного дерева не
  затрагивается: развёртывание внутри результатов поиска не меняет основное дерево.

| Ограничение                  | Значение     | Смысл                                                                |
| ---------------------------- | ------------ | -------------------------------------------------------------------- |
| Максимум совпадений за поиск | `5000` узлов | Сбор прекращается, чтобы огромный результат не тормозил сериализацию |

## Методы

| Метод                        | Описание                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `fuzzySearch(keyword)`       | Нечёткий поиск с **антидребезгом 300 мс**, рассчитан на привязку к полю ввода; пустая строка очищает поиск |
| `fuzzySearchRaw(keyword)`    | Немедленно, без антидребезга; пустая строка очищает поиск                                                  |
| `switchDisplay(displayType)` | Переключает представления `DisplayType.TREE` и `DisplayType.SEARCH`                                        |

У представления поиска своё состояние развёртывания: если развернуть ветвь во время поиска,
основное дерево останется таким же свёрнутым, как было.

## Подсветка ключевого слова

Включите `search-highlight`, и в каждом результате только **введённое ключевое слово** будет
обёрнуто в `<mark class="giant-tree__search-hit">`, остальной текст останется без изменений:

```vue
<VueGiantTree :tree="rows" root="root" search-highlight v-model="selected" />
```

- По умолчанию выключено. Предки, добавленные только для полноты пути, не подсвечиваются, если их имя не совпадает.
- Сопоставление такое же, как в поиске WASM (подстрока с учётом регистра); отмечаются все вхождения.
- Очистка поиска (`fuzzySearchRaw('')`) сразу убирает подсветку.
- Стили находятся в `lib/assets/style/highlight.scss`; их можно переопределить CSS-переменными
  `--giant-tree-search-hit-bg` / `--giant-tree-search-hit-color`.

Если строки рендерятся через слот `#node`, встроенный `<mark>` не применяется. Слот получает
`highlights` (`SearchHighlightPart[] | null`) с уже разбитыми фрагментами — рендерите по `hit`:

```vue
<template #node="{ node, highlights }">
  <span v-if="!highlights">{{ node.name }}</span>
  <span v-else>
    <template v-for="(part, i) in highlights" :key="i">
      <mark v-if="part.hit" class="giant-tree__search-hit">{{
        part.text
      }}</mark>
      <template v-else>{{ part.text }}</template>
    </template>
  </span>
</template>
```

## Использование

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { VueGiantTree, DisplayType } from 'vue3-giant-tree-wasm'

const treeRef = ref<InstanceType<typeof VueGiantTree>>()
const selected = ref([])
const keyword = ref('')

// поле ввода использует версию с антидребезгом, кнопка — немедленную
const onInput = () => treeRef.value?.fuzzySearch(keyword.value)
const searchNow = () => treeRef.value?.fuzzySearchRaw(keyword.value)
const clear = () => {
  keyword.value = ''
  treeRef.value?.fuzzySearchRaw('')
}
// вернуться к полному дереву вручную (очистка поиска делает это же)
const backToTree = () => treeRef.value?.switchDisplay(DisplayType.TREE)
</script>

<template>
  <div style="height: 500px">
    <input v-model="keyword" @input="onInput" placeholder="ключевое слово" />
    <button @click="searchNow">Найти</button>
    <button @click="clear">Очистить</button>
    <button @click="backToTree">К полному дереву</button>
    <VueGiantTree ref="treeRef" :tree="rows" root="root" v-model="selected" />
  </div>
</template>
```

## Попробуйте

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="fuzzy-search" />

Попробуйте найти `n1` — совпадут `n1` и `n10`…`n19`, и каждый результат показывается вместе со
своими предками. Затем нажмите «Свернуть всё»: это влияет только на представление поиска;
очистите ключевое слово — основное дерево не изменилось.
«Подсветка ключевого слова» здесь включена по умолчанию — каждый `n1` отмечается отдельно;
снимите галочку, чтобы сравнить.
