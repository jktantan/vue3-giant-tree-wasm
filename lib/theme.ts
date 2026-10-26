/**
 * 主题与尺寸预设。
 *
 * 主题系统参考 Element Plus 的组织方式：
 * - 颜色/尺寸以 CSS 变量（`--giant-tree-*`）为唯一运行时入口，宿主在自己的
 *   `:root` 或任意祖先元素上覆盖即可换肤；
 * - `theme` prop 只负责在组件根节点上挂主题类，不把颜色写进 JS；
 * - `size` prop 选择一组字号/行高预设，字号同时以 CSS 变量下发，行高用于虚拟滚动计算。
 *
 * Theme and size presets. The colour/size system follows Element Plus: runtime
 * theming goes through `--giant-tree-*` CSS variables, while `theme` only toggles
 * a class on the root element and `size` picks a font-size/row-height preset.
 */

/** 主题模式：`inherit` 跟随全局（如 `html.dark`），`light` / `dark` 强制指定。 */
export type GiantTreeTheme = 'light' | 'dark' | 'inherit'

/** 尺寸预设。 */
export type GiantTreeSize = 'small' | 'default' | 'large'

export interface GiantTreeSizePreset {
  /** 行内字号（px）。 / Row font size in px. */
  fontSize: number
  /** 行高（px），虚拟滚动按它换算可见区间。 / Row height in px, used by virtual scrolling. */
  lineHeight: number
}

/**
 * 三档尺寸预设。`default` 与组件历史默认值（14px / 26px）保持一致，
 * 因此升级不会改变既有外观。
 *
 * Three size presets. `default` keeps the historical defaults (14px / 26px),
 * so upgrading does not change the existing look.
 */
export const GIANT_TREE_SIZE_PRESETS: Readonly<
  Record<GiantTreeSize, GiantTreeSizePreset>
> = {
  small: { fontSize: 12, lineHeight: 24 },
  default: { fontSize: 14, lineHeight: 26 },
  large: { fontSize: 16, lineHeight: 32 },
}

/** 取尺寸预设，未知值回退到 `default`。 / Resolve a preset, falling back to `default`. */
export const resolveGiantTreeSizePreset = (
  size: GiantTreeSize | undefined
): GiantTreeSizePreset =>
  GIANT_TREE_SIZE_PRESETS[size ?? 'default'] ?? GIANT_TREE_SIZE_PRESETS.default

/** 把 `#rgb` / `#rrggbb` 展开成小写 `#rrggbb`，无法解析时返回 undefined。 */
const normalizeHexColor = (color: string): string | undefined => {
  const raw = color.trim().replace(/^#/, '')
  const hex =
    raw.length === 3
      ? raw
          .split('')
          .map(char => char + char)
          .join('')
      : raw
  return /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : undefined
}

const parseHexChannels = (
  color: string
): [number, number, number] | undefined => {
  const normalized = normalizeHexColor(color)
  if (!normalized) return undefined
  return [
    parseInt(normalized.slice(1, 3), 16),
    parseInt(normalized.slice(3, 5), 16),
    parseInt(normalized.slice(5, 7), 16),
  ]
}

/**
 * 按权重混合两个十六进制颜色，返回 `#rrggbb`。`weight` 是 `from` 的占比
 * （0–100），与 SCSS `color.mix($from, $to, $weight)` 的语义一致。任一颜色
 * 无法解析时原样返回 `from`。
 *
 * Mix two hex colours and return `#rrggbb`. `weight` is the share of `from`
 * (0–100), matching SCSS `color.mix($from, $to, $weight)`.
 */
export const mixHexColors = (
  from: string,
  to: string,
  weight: number
): string => {
  const a = parseHexChannels(from)
  const b = parseHexChannels(to)
  if (!a || !b) return from
  const ratio = Math.min(100, Math.max(0, weight)) / 100
  const channel = (index: number) =>
    Math.round(a[index] * ratio + b[index] * (1 - ratio))
  return `#${[0, 1, 2]
    .map(index => channel(index).toString(16).padStart(2, '0'))
    .join('')}`
}

/**
 * 由主色生成一组可直接交给组件根元素的 `--giant-tree-*` 覆盖变量。
 * 混色比例与内置浅色/暗色主题一致，因此只换主色时 hover / active / 选中背景
 * 也会跟着变，不会残留默认蓝色。
 *
 * Build a set of `--giant-tree-*` overrides from a primary colour. The mixes
 * match the built-in light/dark themes, so hover, active and selected
 * backgrounds follow the new colour instead of keeping the default blue.
 *
 * ```vue
 * <VueGiantTree :style="createGiantTreeThemeVars('#7c3aed', isDark)" />
 * ```
 *
 * 只接受 `#rgb` / `#rrggbb`；其它格式返回空对象（保持主题默认）。
 */
export const createGiantTreeThemeVars = (
  primaryColor: string,
  dark = false
): Record<string, string> => {
  const primary = normalizeHexColor(primaryColor)
  if (!primary) return {}
  const hover = dark
    ? mixHexColors(primary, '#141414', 22)
    : mixHexColors(primary, '#ffffff', 30)
  const active = dark
    ? mixHexColors(primary, '#000000', 90)
    : mixHexColors(primary, '#000000', 80)
  return {
    '--giant-tree-color-primary': primary,
    '--giant-tree-color-primary-hover': hover,
    '--giant-tree-color-primary-active': active,
    '--giant-tree-bg-color-hover': hover,
  }
}
