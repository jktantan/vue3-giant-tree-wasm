import { describe, expect, it } from 'vitest'
import {
  createGiantTreeThemeVars,
  mixHexColors,
} from '../lib/theme'

describe('theme helpers: 主色派生', () => {
  it('浅色派生色与内置主题一致', () => {
    expect(createGiantTreeThemeVars('#409eff')).toEqual({
      '--giant-tree-color-primary': '#409eff',
      '--giant-tree-color-primary-hover': '#c6e2ff',
      '--giant-tree-color-primary-active': '#337ecc',
      '--giant-tree-bg-color-hover': '#c6e2ff',
    })
  })

  it('暗色派生色与内置暗色主题一致', () => {
    expect(createGiantTreeThemeVars('#409eff', true)).toEqual({
      '--giant-tree-color-primary': '#409eff',
      '--giant-tree-color-primary-hover': '#1e3248',
      '--giant-tree-color-primary-active': '#3a8ee6',
      '--giant-tree-bg-color-hover': '#1e3248',
    })
  })

  it('支持三位 hex 并规范化输出', () => {
    expect(createGiantTreeThemeVars('#0AF')).toEqual({
      '--giant-tree-color-primary': '#00aaff',
      '--giant-tree-color-primary-hover': '#b3e6ff',
      '--giant-tree-color-primary-active': '#0088cc',
      '--giant-tree-bg-color-hover': '#b3e6ff',
    })
  })

  it('非法颜色返回空对象，保持主题默认', () => {
    expect(createGiantTreeThemeVars('')).toEqual({})
    expect(createGiantTreeThemeVars('rgb(64, 158, 255)')).toEqual({})
    expect(createGiantTreeThemeVars('#12')).toEqual({})
  })

  it('mixHexColors 按权重混合，并夹取越界权重', () => {
    expect(mixHexColors('#000000', '#ffffff', 50)).toBe('#808080')
    expect(mixHexColors('#000000', '#ffffff', 0)).toBe('#ffffff')
    expect(mixHexColors('#000000', '#ffffff', 100)).toBe('#000000')
    expect(mixHexColors('#000000', '#ffffff', 150)).toBe('#000000')
    expect(mixHexColors('#000000', '#ffffff', -10)).toBe('#ffffff')
  })

  it('mixHexColors 遇到非法颜色时原样返回第一个参数', () => {
    expect(mixHexColors('not-a-color', '#ffffff', 50)).toBe('not-a-color')
    expect(mixHexColors('#000000', 'not-a-color', 50)).toBe('#000000')
  })
})
