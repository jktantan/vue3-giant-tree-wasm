import type { FunctionalComponent, VNodeChild } from 'vue'

/**
 * 把「渲染函数 prop」当成插槽内容渲染出来。
 *
 * 为什么需要它：宿主（VueGiantTree）把插槽当作**普通 prop** 传给行组件，而不是
 * 通过 `<template #node>` 转发。转发的写法会让 Vue 给每个行 vnode 打上
 * `DYNAMIC_SLOTS`，于是「插槽可能变了」这一条就足以让**整屏行在每次快照后重渲染**，
 * 与行数据是否真的变化无关；改成函数 prop 后，行 vnode 只比较 props，宿主自己的
 * 状态没变、行对象也没变时，Vue 直接跳过整行。
 *
 * 模板里没法直接调用函数并渲染其返回值，所以用一个函数式组件做出口；它同时是
 * 「插槽函数在谁的渲染上下文里执行」的处理者 —— 宿主传入的是 `withCtx` 包装过的
 * 插槽函数，调用时它会自己切回宿主的实例，与 `renderSlot` 的行为一致。
 *
 * Renders a function prop as slot content. Forwarding the host's slot through
 * `<template #node>` makes Vue mark every row vnode with `DYNAMIC_SLOTS`, which
 * alone forces all visible rows to re-render after every viewport snapshot.
 * Passing the slot function as a prop keeps the row vnode prop-compared, so an
 * unchanged row is skipped entirely. A functional component is the only way to
 * invoke such a function from a template; `withCtx` already restores the host
 * instance for the call, exactly like `renderSlot` does.
 */
type SlotRendererProps = {
  /**
   * 参数写成 `never` 是为了让**具体的**插槽签名能赋进来：属性位置的函数参数是
   * 逆变的，`(p: never) => VNodeChild` 接受任何 `(p: Specific) => VNodeChild`。
   * `never` 在这里只是占位，运行时收到的仍是插槽实参。
   */
  render: (slotProps: never) => VNodeChild
  slotProps: unknown
}

export const SlotRenderer: FunctionalComponent<SlotRendererProps> = props =>
  (props.render as (slotProps: unknown) => VNodeChild)(props.slotProps)

/**
 * 声明 props 有两个作用：把 `slot-props` 归一化成驼峰（否则函数式组件读到的是
 * 原始 key，`props.slotProps` 恒为 undefined），以及让这两个 prop 不被当成透传属性。
 * 值写 `null` 表示不做类型校验。
 */
SlotRenderer.props = { render: null, slotProps: null }
