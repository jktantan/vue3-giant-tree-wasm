# Themes & sizes

The theme system follows Element Plus: **colours and sizes are driven by CSS variables at runtime**, while `theme` / `size` only add classes to the component root. Light variables live on `:root` and dark variables on `html.dark`, so overriding `--giant-tree-*` on an ancestor works in both light and dark mode without recompiling the stylesheet.

## Importing styles

The stylesheet ships with the package; import it once in your app entry:

```ts
import 'vue3-giant-tree-wasm/style.css'
```

`package.json` also exposes a `style` field, so build tools with automatic style injection can omit this line. **Without the stylesheet the component has no styling at all** — the library does not inject CSS at runtime.

## Theme mode

| Usage                       | Behaviour                                                               |
| --------------------------- | ----------------------------------------------------------------------- |
| Default (`theme="inherit"`) | Follows the global convention: dark colours under `<html class="dark">` |
| `theme="dark"`              | Dark colours for this instance only                                     |
| `theme="light"`             | Forces light colours, useful for a light panel inside a dark page       |

```vue
<VueGiantTree :tree="treeData" root="root" theme="dark" v-model="selected" />
```

When used alongside Element Plus, its `html.dark` switch applies automatically — no extra configuration.

Override precedence:

- light and dark variables sit on ancestors (`:root` and `html.dark`), so an override on `.brand-tree` keeps working after switching to dark mode;
- `theme="dark"` declares its variables on the component root. To override that instance's brand colour, use inline variables via `:style`, or a selector that hits the root (`html.dark .brand-tree .giant-tree--dark`);
- rules at the same level and specificity depend on CSS load order — prefer a wrapper class over `:root`.

## Size presets

| `size`    | Font size | Row height |
| --------- | --------- | ---------- |
| `small`   | 12px      | 24px       |
| `default` | 14px      | 26px       |
| `large`   | 16px      | 32px       |

```vue
<VueGiantTree :tree="treeData" root="root" size="small" v-model="selected" />
```

Explicit `fontSize` / `lineHeight` win over the preset. Row height is used by virtual scrolling, so it must reach the component as a pixel value (`size` or `lineHeight`); changing CSS alone cannot resize rows.

## CSS variables

| Variable                            | Light default                                 | Dark default | Description                                      |
| ----------------------------------- | --------------------------------------------- | ------------ | ------------------------------------------------ |
| `--giant-tree-color-primary`        | `#409eff`                                     | same         | Primary colour: checked/radio state, arrow hover |
| `--giant-tree-color-primary-hover`  | `#c6e2ff`                                     | `#1e3248`    | Light/dark derivative of the primary colour      |
| `--giant-tree-color-primary-active` | `#337ecc`                                     | `#3a8ee6`    | Pressed state (for custom styles)                |
| `--giant-tree-color-danger`         | `#ef4f4f`                                     | same         | Danger colour (for custom styles)                |
| `--giant-tree-color-disabled`       | `#aaa`                                        | `#6c6e72`    | Disabled colour (for custom styles)              |
| `--giant-tree-text-color`           | `#4d4d4d`                                     | `#e5eaf3`    | Text and unchecked icon colour                   |
| `--giant-tree-bg-color`             | `transparent`                                 | `#141414`    | Container background                             |
| `--giant-tree-bg-color-hover`       | `#c6e2ff`                                     | `#1e3248`    | Row hover / selected background                  |
| `--giant-tree-line-color`           | `#d0d4dc`                                     | `#4c4d4f`    | Default `showLine` guide colour                  |
| `--giant-tree-line-width`           | `1px`                                         | `1px`        | Default `showLine` guide width                   |
| `--giant-tree-font-size`            | `14px`                                        | same         | Row font size                                    |
| `--giant-tree-row-size`             | Falls back to `--giant-tree-font-size` (14px) | same         | Width of the control column (arrow / checkbox)   |
| `--giant-tree-indent-size`          | Falls back to `--giant-tree-row-size`         | same         | Indent width per level                           |
| `--giant-tree-icon-size`            | Falls back to `--giant-tree-row-size`         | same         | Node icon and checkbox size                      |
| `--giant-tree-row-padding-x`        | `5px`                                         | same         | Row horizontal padding                           |
| `--giant-tree-row-padding-y`        | `0`                                           | same         | Row vertical padding (height is prop-only)       |
| `--giant-tree-row-gap`              | `3px`                                         | same         | Gap between columns inside a row                 |
| `--giant-tree-actions-gap`          | `4px`                                         | same         | Gap between `#actions` slot items                |
| `--giant-tree-row-radius`           | `0`                                           | same         | Row background radius (hover / selected)         |
| `--giant-tree-font-family`          | `inherit`                                     | same         | Row font family, inherits from the host by default |
| `--giant-tree-font-weight`          | `inherit`                                     | same         | Row font weight, inherits from the host by default |
| `--giant-tree-disabled-opacity`     | `0.45`                                        | same         | Opacity of disabled rows                         |
| `--giant-tree-search-hit-bg`        | `#ffe58f`                                     | `#6b5410`    | Search-hit background                            |
| `--giant-tree-search-hit-color`     | `inherit`                                     | `#e5eaf3`    | Search-hit text colour                           |
| `--giant-tree-transition`           | `all .3s ease-in-out`                         | same         | Icon state transition                            |

## Custom themes

To change only the primary colour, use the exported `createGiantTreeThemeVars` helper. It derives hover / active / selected-background variables with the same mixes as the built-in themes:

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

It accepts `#rgb` / `#rrggbb`; other formats return an empty object so the theme defaults apply.

Global restyle:

```css
:root {
  --giant-tree-color-primary: #7c3aed;
  --giant-tree-color-primary-hover: #f3e8ff;
  --giant-tree-bg-color-hover: #f3e8ff;
  --giant-tree-font-size: 15px;
  --giant-tree-row-size: 15px;
}
```

Scoped to one instance (variables inherit down the DOM tree):

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

Adding a new named theme is just another class:

```css
.theme-forest {
  --giant-tree-color-primary: #16a34a;
  --giant-tree-color-primary-hover: #dcfce7;
  --giant-tree-bg-color-hover: #dcfce7;
  --giant-tree-text-color: #14532d;
  --giant-tree-line-color: #bbf7d0;
}
```

## Aligning with a design system

Prefer variables for row box and typography:

```css
.brand-tree {
  --giant-tree-font-family: 'Inter', system-ui, sans-serif;
  --giant-tree-font-size: 13px;
  --giant-tree-row-size: 13px;
  --giant-tree-indent-size: 16px;
  --giant-tree-icon-size: 16px;
  --giant-tree-row-padding-x: 8px;
  --giant-tree-row-gap: 4px;
  --giant-tree-row-radius: 4px;
  --giant-tree-actions-gap: 6px;
}
```

Row height is virtual-scroll layout, so it is prop-only (`size` / `lineHeight`). Structural sizing is wrapped in `:where()` (specificity `(0,1,0)`), so plain selectors override it; use `:deep()` inside scoped styles:

```css
.my-tree .giant-tree__arrow-cell { width: 18px; }
.my-tree .giant-tree__indent { width: 20px; }
.my-tree .giant-tree__text { font-size: 13px; gap: 6px; }
```

## Compile-time SCSS

The `scss/` sources ship at the package root. Configure `common/var` first, then load `index` (Sass loads a module once, so the order matters):

```scss
// src/styles/tree.scss
@use 'vue3-giant-tree-wasm/scss/style/common/var' with (
  $giant-tree__color-primary: #7c3aed,
  $giant-tree__row-gap: 4px,
  $giant-tree__row-padding-x: 8px
);
@use 'vue3-giant-tree-wasm/scss/style/index';
```

```ts
// replaces import 'vue3-giant-tree-wasm/style.css'
import './styles/tree.scss'
```

See `scss/style/common/var.scss` for the full list of `!default` variables. Do not import both `style.css` and the compiled SCSS.

## Notes

- An explicit `fontSize` writes inline `--giant-tree-font-size` and related variables on the root; they outrank external CSS. When omitted, the stylesheet is fully in control.
- Changing `--giant-tree-font-size` alone does not change row height; adjust `lineHeight` or `size` too.
- `showLine`'s `color` / `width` options outrank the theme variables; when omitted they fall back to `--giant-tree-line-color` / `--giant-tree-line-width`.
