# Значки узлов

## О чём эта страница

`nodeIcon` по умолчанию выключен и потому не меняет текущую раскладку строк. После включения:

- свёрнутый родитель показывает закрытую папку, развёрнутый — открытую;
- листья показывают значок файла.

Значки обычно зависят от бизнес-типа. Не передавайте имена фронтенд-ресурсов с бэкенда — используйте
callback, который сопоставляет бизнес-поля с CSS-классами значков на фронте: бэкенду достаточно
возвращать стабильное бизнес-поле (например, `nodeType`), а как это выглядит, решает фронт.

## Параметры

| prop | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `nodeIcon` | `boolean \| NodeIconResolver` | `false` | `true` — встроенные значки; callback решает для каждого узла |

### Возвращаемые значения callback

| Значение | Действие |
| --- | --- |
| `true` | Использовать встроенный значок компонента |
| `false` | Не показывать значок у этого узла |
| `string` | CSS-класс, общий для обоих состояний |
| `{ collapsed: string; expanded?: string }` | Разные CSS-классы для состояний |

Если в объекте нет `expanded`, используется `collapsed`; листья тоже используют `collapsed`.

Пользовательские классы должны полностью задавать стиль значка (например,
`background-image: url(...)`) — так многоцветная заливка SVG сохраняется, а не сглаживается
одноцветным `mask`. Тёмная тема может переопределить `background-image` для того же класса в
переключателе тем.

## Использование

```ts
import type { NodeIconResolver } from 'vue3-giant-tree-wasm'

const nodeIcon: NodeIconResolver = node => {
  switch (node.extendData?.nodeType) {
    case 'directory':
      return { collapsed: 'app-icon-folder', expanded: 'app-icon-folder-open' }
    case 'document':
      return 'app-icon-document' // общий для обоих состояний
    case 'hidden':
      return false // у этого узла значка нет
    default:
      return true // вернуться к встроенному значку
  }
}
```

```vue
<VueGiantTree :tree="rows" root="root" :node-icon="nodeIcon" />
```

## Попробуйте

<script setup>
import { defineClientComponent } from 'vitepress'

const TreePlayground = defineClientComponent(() =>
  import('../../.vitepress/theme/components/TreePlayground.vue')
)
</script>

<TreePlayground preset="node-icons" />

Переключатель «Значки узлов» в демо использует встроенные значки; выключите его — и раскладка
строк вернётся к виду без значков. Именно поэтому по умолчанию они выключены.
