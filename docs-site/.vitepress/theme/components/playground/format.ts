import type { TreeNodeData } from '@lib/types'

/** ID 列表最多显示多少个。 */
const MAX_ITEMS = 8
/** 完整 JSON 最多显示多少字符。 */
const MAX_JSON_LENGTH = 400

export type CheckedValue =
  | TreeNodeData
  | TreeNodeData[]
  | string
  | string[]
  | null
  | undefined

/**
 * 把 v-model 的结果渲染成可读文本。
 *
 * `outputIdOnly` 为 `true` 时列出 ID，为 `false` 时给出完整节点的 JSON ——
 * 这样演示场里切换 `outputIdOnly` 能立刻看出两种输出的差别；
 * 若两种情形都只渲染一个数量，这个开关就演示不出任何东西。
 */
export function formatCheckedResult(
  value: CheckedValue,
  outputIdOnly: boolean,
  emptyText = '（未选中）'
): string {
  const items: Array<TreeNodeData | string> = Array.isArray(value)
    ? value
    : value
      ? [value]
      : []
  if (items.length === 0) return emptyText

  if (!outputIdOnly) {
    const payload = items.length === 1 ? items[0] : items
    const json = JSON.stringify(payload, null, 2)
    return json.length > MAX_JSON_LENGTH
      ? `${json.slice(0, MAX_JSON_LENGTH)}…`
      : json
  }

  const ids = items.map(item => (typeof item === 'string' ? item : item.id))
  const head = ids.slice(0, MAX_ITEMS).join('、')
  return ids.length > MAX_ITEMS ? `${head} …（共 ${ids.length} 项）` : head
}
