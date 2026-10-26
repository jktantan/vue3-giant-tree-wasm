# Темы и размеры

Система тем повторяет подход Element Plus: **цвета и размеры задаются CSS-переменными во время выполнения**, а `theme` / `size` лишь добавляют класс на корневой элемент. Достаточно переопределить `--giant-tree-*`, чтобы изменить оформление без пересборки стилей.

## Подключение стилей

Стили поставляются вместе с пакетом и подключаются один раз на входе приложения:

```ts
import 'vue3-giant-tree-wasm/style.css'
```

## Режим темы

| Использование                    | Поведение                                                                         |
| -------------------------------- | --------------------------------------------------------------------------------- |
| По умолчанию (`theme="inherit"`) | Следует глобальному соглашению: тёмные цвета при `<html class="dark">`            |
| `theme="dark"`                   | Тёмные цвета только для этого экземпляра                                          |
| `theme="light"`                  | Принудительно светлые цвета — например, для светлой панели внутри тёмной страницы |

```vue
<VueGiantTree :tree="treeData" root="root" theme="dark" v-model="selected" />
```

При совместном использовании с Element Plus его переключатель `html.dark` применяется автоматически.

## Пресеты размера

| `size`    | Размер шрифта | Высота строки |
| --------- | ------------- | ------------- |
| `small`   | 12px          | 24px          |
| `default` | 14px          | 26px          |
| `large`   | 16px          | 32px          |

```vue
<VueGiantTree :tree="treeData" root="root" size="small" v-model="selected" />
```

Явно переданные `fontSize` / `lineHeight` имеют приоритет над пресетом. Высота строки используется виртуальной прокруткой, поэтому должна передаваться компоненту в пикселях (`size` или `lineHeight`), а не только через CSS.

## CSS-переменные

| Переменная                          | Светлая тема                              | Тёмная тема | Назначение                                               |
| ----------------------------------- | ----------------------------------------- | ----------- | -------------------------------------------------------- |
| `--giant-tree-color-primary`        | `#409eff`                                 | та же       | Основной цвет: выбранный флажок/радио, hover стрелки     |
| `--giant-tree-color-primary-hover`  | `#c6e2ff`                                 | `#1e3248`   | Светлый/тёмный производный основного цвета               |
| `--giant-tree-color-primary-active` | `#337ecc`                                 | `#3a8ee6`   | Нажатое состояние (для пользовательских стилей)          |
| `--giant-tree-color-danger`         | `#ef4f4f`                                 | та же       | Опасный цвет (для пользовательских стилей)               |
| `--giant-tree-color-disabled`       | `#aaa`                                    | `#6c6e72`   | Цвет отключённых элементов (для пользовательских стилей) |
| `--giant-tree-text-color`           | `#4d4d4d`                                 | `#e5eaf3`   | Текст и невыбранные значки                               |
| `--giant-tree-bg-color`             | `transparent`                             | `#141414`   | Фон контейнера                                           |
| `--giant-tree-bg-color-hover`       | `#c6e2ff`                                 | `#1e3248`   | Фон при hover / выборе строки                            |
| `--giant-tree-line-color`           | `#d0d4dc`                                 | `#4c4d4f`   | Цвет направляющих `showLine`                             |
| `--giant-tree-line-width`           | `1px`                                     | `1px`       | Толщина направляющих `showLine`                          |
| `--giant-tree-font-size`            | `14px`                                    | та же       | Размер шрифта строки                                     |
| `--giant-tree-row-size`             | Наследует `--giant-tree-font-size` (14px) | та же       | Ширина колонки управления (стрелка / флажок)             |
| `--giant-tree-indent-size`          | Наследует `--giant-tree-row-size`         | та же       | Ширина отступа на уровень                                |
| `--giant-tree-icon-size`            | Наследует `--giant-tree-row-size`         | та же       | Размер значка узла и флажка                              |
| `--giant-tree-disabled-opacity`     | `0.45`                                    | та же       | Прозрачность отключённой строки                          |
| `--giant-tree-search-hit-bg`        | `#ffe58f`                                 | `#6b5410`   | Фон найденного фрагмента                                 |
| `--giant-tree-search-hit-color`     | `inherit`                                 | `#e5eaf3`   | Цвет найденного фрагмента                                |
| `--giant-tree-transition`           | `all .3s ease-in-out`                     | та же       | Переход состояния значков                                |

## Своя тема

Чтобы изменить только основной цвет, используйте экспортированный `createGiantTreeThemeVars`: он вычисляет hover / active / фон выбранной строки с теми же пропорциями, что и встроенные темы:

```ts
import { computed } from 'vue'
import { createGiantTreeThemeVars } from 'vue3-giant-tree-wasm'

const treeThemeVars = computed(() =>
  createGiantTreeThemeVars(primaryColor.value, isDark.value)
)
```

```vue
<VueGiantTree :tree="treeData" root="root" :style="treeThemeVars" v-model="selected" />
```

Принимает `#rgb` / `#rrggbb`; для других форматов возвращает пустой объект, и используются значения темы по умолчанию.

Глобально:

```css
:root {
  --giant-tree-color-primary: #7c3aed;
  --giant-tree-color-primary-hover: #f3e8ff;
  --giant-tree-bg-color-hover: #f3e8ff;
  --giant-tree-font-size: 15px;
  --giant-tree-row-size: 15px;
}
```

Только для одного экземпляра (переменные наследуются по DOM):

```vue
<div class="brand-tree">
  <VueGiantTree :tree="treeData" root="root" v-model="selected" />
</div>

<style>
.brand-tree {
  --giant-tree-color-primary: #7c3aed;
  --giant-tree-icon-size: 16px;
}
</style>
```

Новая именованная тема — это просто ещё один класс:

```css
.theme-forest {
  --giant-tree-color-primary: #16a34a;
  --giant-tree-color-primary-hover: #dcfce7;
  --giant-tree-bg-color-hover: #dcfce7;
  --giant-tree-text-color: #14532d;
  --giant-tree-line-color: #bbf7d0;
}
```

## Примечания

- Явно переданный `fontSize` записывает inline-переменные `--giant-tree-font-size` и связанные с ними на корень, поэтому они приоритетнее внешнего CSS. Если не передавать его, стилями управляет таблица стилей.
- Изменение только `--giant-tree-font-size` не меняет высоту строки — настройте также `lineHeight` или `size`.
- Опции `color` / `width` у `showLine` приоритетнее переменных темы; если они не заданы, используются `--giant-tree-line-color` / `--giant-tree-line-width`.
